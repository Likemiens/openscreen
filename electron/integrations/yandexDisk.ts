import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import { request as httpsRequest } from "node:https";
import path from "node:path";
import { BrowserWindow, type IpcMain, Notification, safeStorage, shell } from "electron";
import { buildPublishedFileName, sanitizeRecordingTitle } from "../../src/lib/recordingDraft";
import {
	buildYandexDiskRemotePath,
	DEFAULT_YANDEX_DISK_FOLDER,
	isVerifiedYandexDiskUpload,
	matchesYandexDiskPublicFolder,
	normalizeYandexDiskFolder,
	type SaveYandexDiskSettingsInput,
	YANDEX_DISK_PUBLIC_FOLDER_URL,
	type YandexDiskSettings,
	type YandexDiskSettingsResult,
	type YandexDiskUploadRequest,
	type YandexDiskUploadRequestResult,
	type YandexDiskUploadStatus,
} from "../../src/lib/yandexDisk";

const SETTINGS_FILE_NAME = "yandex-disk.json";
const API_BASE_URL = "https://cloud-api.yandex.net/v1/disk";
const UPLOAD_EVENT = "yandex-disk-upload-status";

interface PendingLocalDeletion {
	filePath: string;
	fileName: string;
	remotePath: string;
}

interface PersistedYandexDiskSettings {
	version: 2;
	autoUpload: boolean;
	folder: string;
	deleteLocalAfterUpload: boolean;
	encryptedAccessToken?: string;
	pendingLocalDeletions: PendingLocalDeletion[];
}

interface YandexDiskApiErrorBody {
	message?: string;
	description?: string;
	error?: string;
}

class YandexDiskRequestError extends Error {
	constructor(
		message: string,
		readonly statusCode?: number,
	) {
		super(message);
		this.name = "YandexDiskRequestError";
	}
}

function isPathWithinDirectory(filePath: string, directory: string): boolean {
	const normalizeForComparison = (value: string) =>
		process.platform === "win32" ? value.toLowerCase() : value;
	const resolvedFile = normalizeForComparison(path.resolve(filePath));
	const resolvedDirectory = normalizeForComparison(path.resolve(directory));
	return (
		resolvedFile === resolvedDirectory || resolvedFile.startsWith(`${resolvedDirectory}${path.sep}`)
	);
}

async function readErrorMessage(response: Response): Promise<string> {
	const fallback = `Yandex Disk request failed (${response.status})`;
	try {
		const body = (await response.json()) as YandexDiskApiErrorBody;
		return body.message || body.description || body.error || fallback;
	} catch {
		return fallback;
	}
}

async function requestYandexDisk(
	url: URL,
	accessToken: string,
	init: RequestInit = {},
): Promise<Response> {
	const response = await fetch(url, {
		...init,
		headers: {
			Accept: "application/json",
			Authorization: `OAuth ${accessToken}`,
			...init.headers,
		},
	});

	if (!response.ok) {
		throw new YandexDiskRequestError(await readErrorMessage(response), response.status);
	}

	return response;
}

async function verifyDestinationFolder(folder: string, accessToken: string): Promise<void> {
	const url = new URL(`${API_BASE_URL}/resources`);
	url.searchParams.set("path", `disk:/${normalizeYandexDiskFolder(folder)}`);
	url.searchParams.set("fields", "type,public_url,public_key");

	const response = await requestYandexDisk(url, accessToken);
	const resource = (await response.json()) as {
		type?: string;
		public_url?: string;
		public_key?: string;
	};
	if (!matchesYandexDiskPublicFolder(resource, YANDEX_DISK_PUBLIC_FOLDER_URL)) {
		throw new Error(
			`The folder disk:/${normalizeYandexDiskFolder(folder)} does not match the configured public Yandex Disk folder.`,
		);
	}
}

async function getUploadUrl(remotePath: string, accessToken: string): Promise<string> {
	const url = new URL(`${API_BASE_URL}/resources/upload`);
	url.searchParams.set("path", remotePath);
	url.searchParams.set("overwrite", "true");

	const response = await requestYandexDisk(url, accessToken);
	const body = (await response.json()) as { href?: string };
	if (!body.href) {
		throw new YandexDiskRequestError("Yandex Disk did not return an upload URL.");
	}
	return body.href;
}

async function putFile(uploadUrl: string, filePath: string): Promise<void> {
	const stats = await fs.stat(filePath);

	await new Promise<void>((resolve, reject) => {
		const request = httpsRequest(
			new URL(uploadUrl),
			{
				method: "PUT",
				headers: {
					"Content-Length": stats.size,
					"Content-Type": "application/octet-stream",
				},
			},
			(response) => {
				const chunks: Buffer[] = [];
				response.on("data", (chunk: Buffer) => chunks.push(chunk));
				response.on("end", () => {
					const statusCode = response.statusCode ?? 0;
					if (statusCode >= 200 && statusCode < 300) {
						resolve();
						return;
					}

					const body = Buffer.concat(chunks).toString("utf8");
					let message = `Yandex Disk upload failed (${statusCode})`;
					try {
						const parsed = JSON.parse(body) as YandexDiskApiErrorBody;
						message = parsed.message || parsed.description || parsed.error || message;
					} catch {
						// The upload host may return a non-JSON response. Keep the status-based message.
					}
					reject(new YandexDiskRequestError(message, statusCode));
				});
			},
		);

		request.on("error", reject);
		const stream = createReadStream(filePath);
		stream.on("error", (error) => request.destroy(error));
		stream.pipe(request);
	});
}

async function verifyUploadedFile(
	remotePath: string,
	accessToken: string,
	expectedSize: number,
): Promise<void> {
	for (let attempt = 0; attempt < 10; attempt += 1) {
		const url = new URL(`${API_BASE_URL}/resources`);
		url.searchParams.set("path", remotePath);
		url.searchParams.set("fields", "type,size,path");

		try {
			const response = await requestYandexDisk(url, accessToken);
			const resource = (await response.json()) as { type?: string; size?: number };
			if (isVerifiedYandexDiskUpload(resource, expectedSize)) return;
		} catch (error) {
			if (!(error instanceof YandexDiskRequestError) || error.statusCode !== 404) throw error;
		}

		if (attempt < 9) await wait(Math.min(2_000, 500 * (attempt + 1)));
	}

	throw new Error("Yandex Disk did not confirm the uploaded file size. The local copy was kept.");
}

function shouldRetry(error: unknown): boolean {
	return (
		error instanceof YandexDiskRequestError &&
		(error.statusCode === 429 || (error.statusCode !== undefined && error.statusCode >= 500))
	);
}

function wait(delayMs: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, delayMs));
}

class YandexDiskService {
	private uploadQueue: Promise<void> = Promise.resolve();
	private editorActive = false;
	private cleanupInProgress = false;

	constructor(
		private readonly recordingsDirectory: string,
		private readonly settingsPath: string,
	) {}

	async initialize(): Promise<void> {
		try {
			const raw = JSON.parse(await fs.readFile(this.settingsPath, "utf8")) as {
				version?: number;
				autoUpload?: boolean;
			};
			if (raw.version === 1) {
				await this.writeSettings({
					version: 2,
					autoUpload: Boolean(raw.autoUpload),
					folder: DEFAULT_YANDEX_DISK_FOLDER,
					deleteLocalAfterUpload: true,
					pendingLocalDeletions: [],
				});
			}
		} catch (error) {
			const nodeError = error as NodeJS.ErrnoException;
			if (nodeError.code !== "ENOENT") {
				console.warn("Failed to migrate Yandex Disk settings:", nodeError.message);
			}
		}

		await this.cleanupPendingLocalFiles();
	}

	setEditorActive(active: boolean): void {
		this.editorActive = active;
		if (!active) void this.cleanupPendingLocalFiles();
	}

	async getSettings(): Promise<YandexDiskSettings> {
		const settings = await this.readSettings();
		return {
			folder: settings.folder,
			deleteLocalAfterUpload: settings.deleteLocalAfterUpload,
			connected: this.canDecryptAccessToken(settings.encryptedAccessToken),
			encryptionAvailable: safeStorage.isEncryptionAvailable(),
		};
	}

	async saveSettings(input: SaveYandexDiskSettingsInput): Promise<YandexDiskSettings> {
		const current = await this.readSettings();
		const accessToken = input.accessToken?.trim();
		let encryptedAccessToken = current.encryptedAccessToken;
		let effectiveAccessToken: string | undefined;

		if (accessToken) {
			if (!safeStorage.isEncryptionAvailable()) {
				throw new Error("Secure token storage is unavailable on this system.");
			}
			effectiveAccessToken = accessToken;
			encryptedAccessToken = safeStorage.encryptString(accessToken).toString("base64");
		} else if (encryptedAccessToken) {
			effectiveAccessToken = this.decryptAccessToken(encryptedAccessToken);
		}

		// Validate both full-Disk access and the exact public destination before persisting.
		if (effectiveAccessToken) {
			await verifyDestinationFolder(input.folder, effectiveAccessToken);
		}

		const next: PersistedYandexDiskSettings = {
			version: 2,
			autoUpload: false,
			folder: normalizeYandexDiskFolder(input.folder),
			deleteLocalAfterUpload: Boolean(input.deleteLocalAfterUpload),
			pendingLocalDeletions: current.pendingLocalDeletions,
			...(encryptedAccessToken ? { encryptedAccessToken } : {}),
		};
		await this.writeSettings(next);
		return this.getSettings();
	}

	async disconnect(): Promise<YandexDiskSettings> {
		const current = await this.readSettings();
		await this.writeSettings({
			version: 2,
			autoUpload: false,
			folder: current.folder,
			deleteLocalAfterUpload: current.deleteLocalAfterUpload,
			pendingLocalDeletions: current.pendingLocalDeletions,
		});
		return this.getSettings();
	}

	async enqueue(input: YandexDiskUploadRequest): Promise<YandexDiskUploadRequestResult> {
		const filePath = input.filePath;
		const [resolvedFilePath, resolvedRecordingsDirectory] = await Promise.all([
			fs.realpath(filePath),
			fs.realpath(this.recordingsDirectory),
		]);
		const stats = await fs.stat(resolvedFilePath);
		if (!stats.isFile() || !isPathWithinDirectory(resolvedFilePath, resolvedRecordingsDirectory)) {
			return { success: false, error: "Only files created by OpenScreen can be uploaded." };
		}

		const settings = await this.readSettings();
		if (!settings.encryptedAccessToken) {
			return { success: false, error: "Яндекс Диск не подключён." };
		}

		const sourceExtension = path.extname(resolvedFilePath) || ".mp4";
		const requestedTitle = input.fileName
			? path.parse(input.fileName).name
			: path.parse(resolvedFilePath).name;
		const fileName = buildPublishedFileName(
			sanitizeRecordingTitle(requestedTitle),
			sourceExtension,
		);
		const cleanupSourcePaths = this.resolveCleanupSourcePaths(
			input.cleanupSourcePaths,
			resolvedRecordingsDirectory,
		);

		const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
		this.uploadQueue = this.uploadQueue
			.catch(() => undefined)
			.then(() =>
				this.uploadFile(uploadId, resolvedFilePath, fileName, cleanupSourcePaths, settings),
			);

		return { success: true, queued: true };
	}

	private async uploadFile(
		uploadId: string,
		filePath: string,
		fileName: string,
		cleanupSourcePaths: string[],
		settings: PersistedYandexDiskSettings,
	): Promise<void> {
		const remotePath = buildYandexDiskRemotePath(settings.folder, fileName);
		this.broadcast({
			uploadId,
			state: "uploading",
			fileName,
			remotePath,
			publicUrl: YANDEX_DISK_PUBLIC_FOLDER_URL,
		});

		try {
			const accessToken = this.decryptAccessToken(settings.encryptedAccessToken);
			const localStats = await fs.stat(filePath);

			for (let attempt = 0; attempt < 2; attempt += 1) {
				try {
					await verifyDestinationFolder(settings.folder, accessToken);
					const uploadUrl = await getUploadUrl(remotePath, accessToken);
					await putFile(uploadUrl, filePath);
					break;
				} catch (error) {
					if (attempt === 0 && shouldRetry(error)) {
						await wait(1_000);
						continue;
					}
					throw error;
				}
			}

			await verifyUploadedFile(remotePath, accessToken, localStats.size);
			const localDeletion = await this.handleLocalDeletions(
				[filePath, ...cleanupSourcePaths],
				remotePath,
			);
			this.broadcast({
				uploadId,
				state: "success",
				fileName,
				remotePath,
				publicUrl: YANDEX_DISK_PUBLIC_FOLDER_URL,
				localDeletion,
			});
			this.notify(
				`${fileName} опубликован`,
				localDeletion === "deleted"
					? "Файл проверен, локальная копия удалена. Нажмите, чтобы открыть папку."
					: localDeletion === "pending"
						? "Файл проверен. Локальная копия удалится после выхода из редактора."
						: "Файл проверен на Яндекс Диске. Нажмите, чтобы открыть папку.",
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.broadcast({
				uploadId,
				state: "error",
				fileName,
				remotePath,
				publicUrl: YANDEX_DISK_PUBLIC_FOLDER_URL,
				error: message,
			});
			this.notify(`Не удалось опубликовать ${fileName}`, message);
			console.error("Yandex Disk upload failed:", message);
		}
	}

	private resolveCleanupSourcePaths(
		input: string[] | undefined,
		recordingsDirectory: string,
	): string[] {
		const candidates = new Set<string>();
		for (const value of input ?? []) {
			if (typeof value !== "string" || !value.trim()) continue;
			const resolved = path.resolve(value);
			if (!isPathWithinDirectory(resolved, recordingsDirectory)) continue;
			candidates.add(resolved);

			const parsed = path.parse(resolved);
			if (!parsed.name.endsWith("-webcam")) {
				candidates.add(`${resolved}.cursor.json`);
				candidates.add(path.join(parsed.dir, `${parsed.name}.session.json`));
			}
		}
		return [...candidates];
	}

	private async handleLocalDeletions(filePaths: string[], remotePath: string) {
		const uniquePaths = [...new Set(filePaths.map((filePath) => path.resolve(filePath)))];
		const results = [];
		for (const filePath of uniquePaths) {
			results.push(
				await this.handleLocalDeletion({
					filePath,
					fileName: path.basename(filePath),
					remotePath,
				}),
			);
		}
		if (results.some((result) => result === "pending")) return "pending" as const;
		if (results.every((result) => result === "deleted")) return "deleted" as const;
		return "kept" as const;
	}

	async cleanupPendingLocalFiles(): Promise<void> {
		if (this.editorActive || this.cleanupInProgress) return;
		this.cleanupInProgress = true;

		try {
			const settings = await this.readSettings();
			if (settings.pendingLocalDeletions.length === 0) return;

			const remaining: PendingLocalDeletion[] = [];
			for (const item of settings.pendingLocalDeletions) {
				try {
					const [resolvedFilePath, resolvedRecordingsDirectory] = await Promise.all([
						fs.realpath(item.filePath),
						fs.realpath(this.recordingsDirectory),
					]);
					if (!isPathWithinDirectory(resolvedFilePath, resolvedRecordingsDirectory)) {
						throw new Error("Refusing to delete a file outside the OpenScreen recordings folder.");
					}
					await fs.unlink(resolvedFilePath);
					this.broadcast({
						uploadId: `cleanup-${Date.now()}`,
						state: "local-deleted",
						fileName: item.fileName,
						remotePath: item.remotePath,
						publicUrl: YANDEX_DISK_PUBLIC_FOLDER_URL,
						localDeletion: "deleted",
					});
				} catch (error) {
					const nodeError = error as NodeJS.ErrnoException;
					if (nodeError.code === "ENOENT") continue;
					remaining.push(item);
					const message = error instanceof Error ? error.message : String(error);
					this.broadcast({
						uploadId: `cleanup-${Date.now()}`,
						state: "cleanup-error",
						fileName: item.fileName,
						remotePath: item.remotePath,
						publicUrl: YANDEX_DISK_PUBLIC_FOLDER_URL,
						error: message,
					});
				}
			}

			await this.writeSettings({ ...settings, pendingLocalDeletions: remaining });
		} finally {
			this.cleanupInProgress = false;
		}
	}

	private async handleLocalDeletion(item: PendingLocalDeletion) {
		const settings = await this.readSettings();
		if (!settings.deleteLocalAfterUpload) return "kept" as const;

		if (!this.editorActive) {
			try {
				await fs.unlink(item.filePath);
				return "deleted" as const;
			} catch (error) {
				const nodeError = error as NodeJS.ErrnoException;
				if (nodeError.code === "ENOENT") return "deleted" as const;
			}
		}

		const alreadyPending = settings.pendingLocalDeletions.some(
			(pending) => pending.filePath === item.filePath,
		);
		if (!alreadyPending) {
			await this.writeSettings({
				...settings,
				pendingLocalDeletions: [...settings.pendingLocalDeletions, item],
			});
		}
		return "pending" as const;
	}

	private async readSettings(): Promise<PersistedYandexDiskSettings> {
		try {
			const raw = JSON.parse(
				await fs.readFile(this.settingsPath, "utf8"),
			) as Partial<PersistedYandexDiskSettings> & { version?: number };
			if (raw.version !== 2) {
				return {
					version: 2,
					autoUpload: Boolean(raw.autoUpload),
					folder: DEFAULT_YANDEX_DISK_FOLDER,
					deleteLocalAfterUpload: true,
					pendingLocalDeletions: [],
				};
			}
			return {
				version: 2,
				autoUpload: typeof raw.autoUpload === "boolean" ? raw.autoUpload : false,
				folder: normalizeYandexDiskFolder(raw.folder),
				deleteLocalAfterUpload:
					typeof raw.deleteLocalAfterUpload === "boolean" ? raw.deleteLocalAfterUpload : true,
				pendingLocalDeletions: Array.isArray(raw.pendingLocalDeletions)
					? raw.pendingLocalDeletions.filter(
							(item): item is PendingLocalDeletion =>
								typeof item?.filePath === "string" &&
								typeof item.fileName === "string" &&
								typeof item.remotePath === "string",
						)
					: [],
				...(typeof raw.encryptedAccessToken === "string" && raw.encryptedAccessToken
					? { encryptedAccessToken: raw.encryptedAccessToken }
					: {}),
			};
		} catch (error) {
			const nodeError = error as NodeJS.ErrnoException;
			if (nodeError.code !== "ENOENT") {
				console.warn("Failed to read Yandex Disk settings:", nodeError.message);
			}
			return {
				version: 2,
				autoUpload: false,
				folder: DEFAULT_YANDEX_DISK_FOLDER,
				deleteLocalAfterUpload: true,
				pendingLocalDeletions: [],
			};
		}
	}

	private async writeSettings(settings: PersistedYandexDiskSettings): Promise<void> {
		await fs.mkdir(path.dirname(this.settingsPath), { recursive: true });
		await fs.writeFile(this.settingsPath, JSON.stringify(settings, null, 2), { mode: 0o600 });
	}

	private canDecryptAccessToken(encryptedAccessToken?: string): boolean {
		if (!encryptedAccessToken || !safeStorage.isEncryptionAvailable()) return false;
		try {
			return safeStorage.decryptString(Buffer.from(encryptedAccessToken, "base64")).length > 0;
		} catch {
			return false;
		}
	}

	private decryptAccessToken(encryptedAccessToken?: string): string {
		if (!encryptedAccessToken || !safeStorage.isEncryptionAvailable()) {
			throw new Error("Yandex Disk is not connected.");
		}

		try {
			return safeStorage.decryptString(Buffer.from(encryptedAccessToken, "base64"));
		} catch {
			throw new Error("The saved Yandex Disk token can no longer be decrypted. Reconnect it.");
		}
	}

	private broadcast(status: YandexDiskUploadStatus): void {
		for (const window of BrowserWindow.getAllWindows()) {
			if (!window.isDestroyed()) window.webContents.send(UPLOAD_EVENT, status);
		}
	}

	private notify(title: string, body: string): void {
		if (!Notification.isSupported()) return;
		const notification = new Notification({ title: `Яндекс Диск · ${title}`, body });
		notification.on("click", () => {
			void shell.openExternal(YANDEX_DISK_PUBLIC_FOLDER_URL);
		});
		notification.show();
	}
}

export interface YandexDiskIntegration {
	setEditorActive(active: boolean): void;
	cleanupPendingLocalFiles(): Promise<void>;
}

export function registerYandexDiskIpcHandlers(
	ipcMain: IpcMain,
	recordingsDirectory: string,
	userDataDirectory: string,
): YandexDiskIntegration {
	const service = new YandexDiskService(
		recordingsDirectory,
		path.join(userDataDirectory, SETTINGS_FILE_NAME),
	);
	const initialization = service.initialize().catch((error) => {
		console.error("Failed to initialize Yandex Disk integration:", error);
	});

	ipcMain.handle("get-yandex-disk-settings", async (): Promise<YandexDiskSettingsResult> => {
		try {
			await initialization;
			return { success: true, settings: await service.getSettings() };
		} catch (error) {
			return { success: false, error: error instanceof Error ? error.message : String(error) };
		}
	});

	ipcMain.handle(
		"save-yandex-disk-settings",
		async (_, input: SaveYandexDiskSettingsInput): Promise<YandexDiskSettingsResult> => {
			try {
				await initialization;
				return { success: true, settings: await service.saveSettings(input) };
			} catch (error) {
				return { success: false, error: error instanceof Error ? error.message : String(error) };
			}
		},
	);

	ipcMain.handle("disconnect-yandex-disk", async (): Promise<YandexDiskSettingsResult> => {
		try {
			await initialization;
			return { success: true, settings: await service.disconnect() };
		} catch (error) {
			return { success: false, error: error instanceof Error ? error.message : String(error) };
		}
	});

	ipcMain.handle(
		"upload-recording-to-yandex-disk",
		async (_, request: YandexDiskUploadRequest): Promise<YandexDiskUploadRequestResult> => {
			try {
				await initialization;
				return await service.enqueue(request);
			} catch (error) {
				return { success: false, error: error instanceof Error ? error.message : String(error) };
			}
		},
	);

	return service;
}
