import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import { request as httpsRequest } from "node:https";
import path from "node:path";
import { BrowserWindow, type IpcMain, Notification, safeStorage } from "electron";
import {
	buildYandexDiskRemotePath,
	DEFAULT_YANDEX_DISK_FOLDER,
	normalizeYandexDiskFolder,
	type SaveYandexDiskSettingsInput,
	type YandexDiskSettings,
	type YandexDiskSettingsResult,
	type YandexDiskUploadRequestResult,
	type YandexDiskUploadStatus,
} from "../../src/lib/yandexDisk";

const SETTINGS_FILE_NAME = "yandex-disk.json";
const API_BASE_URL = "https://cloud-api.yandex.net/v1/disk";
const UPLOAD_EVENT = "yandex-disk-upload-status";

interface PersistedYandexDiskSettings {
	version: 1;
	autoUpload: boolean;
	folder: string;
	encryptedAccessToken?: string;
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

async function ensureRemoteFolder(folder: string, accessToken: string): Promise<void> {
	const segments = normalizeYandexDiskFolder(folder).split("/");
	let currentPath = "app:";

	for (const segment of segments) {
		currentPath = `${currentPath}/${segment}`;
		const url = new URL(`${API_BASE_URL}/resources`);
		url.searchParams.set("path", currentPath);

		const response = await fetch(url, {
			method: "PUT",
			headers: {
				Accept: "application/json",
				Authorization: `OAuth ${accessToken}`,
			},
		});

		// 409 means the directory already exists, which is the desired state.
		if (response.ok || response.status === 409) continue;
		throw new YandexDiskRequestError(await readErrorMessage(response), response.status);
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

	constructor(
		private readonly recordingsDirectory: string,
		private readonly settingsPath: string,
	) {}

	async getSettings(): Promise<YandexDiskSettings> {
		const settings = await this.readSettings();
		return {
			autoUpload: settings.autoUpload,
			folder: settings.folder,
			connected: this.canDecryptAccessToken(settings.encryptedAccessToken),
			encryptionAvailable: safeStorage.isEncryptionAvailable(),
		};
	}

	async saveSettings(input: SaveYandexDiskSettingsInput): Promise<YandexDiskSettings> {
		const current = await this.readSettings();
		const accessToken = input.accessToken?.trim();
		let encryptedAccessToken = current.encryptedAccessToken;

		if (accessToken) {
			if (!safeStorage.isEncryptionAvailable()) {
				throw new Error("Secure token storage is unavailable on this system.");
			}
			// Validate both the token and the narrow app-folder permission before persisting it.
			await ensureRemoteFolder(normalizeYandexDiskFolder(input.folder), accessToken);
			encryptedAccessToken = safeStorage.encryptString(accessToken).toString("base64");
		}

		const next: PersistedYandexDiskSettings = {
			version: 1,
			autoUpload: Boolean(input.autoUpload),
			folder: normalizeYandexDiskFolder(input.folder),
			...(encryptedAccessToken ? { encryptedAccessToken } : {}),
		};
		await this.writeSettings(next);
		return this.getSettings();
	}

	async disconnect(): Promise<YandexDiskSettings> {
		const current = await this.readSettings();
		await this.writeSettings({
			version: 1,
			autoUpload: false,
			folder: current.folder,
		});
		return this.getSettings();
	}

	async enqueue(filePath: string): Promise<YandexDiskUploadRequestResult> {
		const [resolvedFilePath, resolvedRecordingsDirectory] = await Promise.all([
			fs.realpath(filePath),
			fs.realpath(this.recordingsDirectory),
		]);
		const stats = await fs.stat(resolvedFilePath);
		if (!stats.isFile() || !isPathWithinDirectory(resolvedFilePath, resolvedRecordingsDirectory)) {
			return { success: false, error: "Only files created by OpenScreen can be uploaded." };
		}

		const settings = await this.readSettings();
		if (!settings.autoUpload) return { success: true, skipped: "disabled" };
		if (!settings.encryptedAccessToken) return { success: true, skipped: "not-connected" };

		const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
		this.uploadQueue = this.uploadQueue
			.catch(() => undefined)
			.then(() => this.uploadFile(uploadId, resolvedFilePath, settings));

		return { success: true, queued: true };
	}

	private async uploadFile(
		uploadId: string,
		filePath: string,
		settings: PersistedYandexDiskSettings,
	): Promise<void> {
		const fileName = path.basename(filePath);
		const remotePath = buildYandexDiskRemotePath(settings.folder, fileName);
		this.broadcast({ uploadId, state: "uploading", fileName, remotePath });

		try {
			const accessToken = this.decryptAccessToken(settings.encryptedAccessToken);
			await fs.access(filePath);

			for (let attempt = 0; attempt < 2; attempt += 1) {
				try {
					await ensureRemoteFolder(settings.folder, accessToken);
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

			this.broadcast({ uploadId, state: "success", fileName, remotePath });
			this.notify(`Uploaded ${fileName}`, `Saved to ${remotePath}`);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.broadcast({ uploadId, state: "error", fileName, remotePath, error: message });
			this.notify(`Could not upload ${fileName}`, message);
			console.error("Yandex Disk upload failed:", message);
		}
	}

	private async readSettings(): Promise<PersistedYandexDiskSettings> {
		try {
			const raw = JSON.parse(
				await fs.readFile(this.settingsPath, "utf8"),
			) as Partial<PersistedYandexDiskSettings>;
			return {
				version: 1,
				autoUpload: typeof raw.autoUpload === "boolean" ? raw.autoUpload : false,
				folder: normalizeYandexDiskFolder(raw.folder),
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
				version: 1,
				autoUpload: false,
				folder: DEFAULT_YANDEX_DISK_FOLDER,
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
		new Notification({ title: `Yandex Disk · ${title}`, body }).show();
	}
}

export function registerYandexDiskIpcHandlers(
	ipcMain: IpcMain,
	recordingsDirectory: string,
	userDataDirectory: string,
): void {
	const service = new YandexDiskService(
		recordingsDirectory,
		path.join(userDataDirectory, SETTINGS_FILE_NAME),
	);

	ipcMain.handle("get-yandex-disk-settings", async (): Promise<YandexDiskSettingsResult> => {
		try {
			return { success: true, settings: await service.getSettings() };
		} catch (error) {
			return { success: false, error: error instanceof Error ? error.message : String(error) };
		}
	});

	ipcMain.handle(
		"save-yandex-disk-settings",
		async (_, input: SaveYandexDiskSettingsInput): Promise<YandexDiskSettingsResult> => {
			try {
				return { success: true, settings: await service.saveSettings(input) };
			} catch (error) {
				return { success: false, error: error instanceof Error ? error.message : String(error) };
			}
		},
	);

	ipcMain.handle("disconnect-yandex-disk", async (): Promise<YandexDiskSettingsResult> => {
		try {
			return { success: true, settings: await service.disconnect() };
		} catch (error) {
			return { success: false, error: error instanceof Error ? error.message : String(error) };
		}
	});

	ipcMain.handle(
		"upload-recording-to-yandex-disk",
		async (_, filePath: string): Promise<YandexDiskUploadRequestResult> => {
			try {
				return await service.enqueue(filePath);
			} catch (error) {
				return { success: false, error: error instanceof Error ? error.message : String(error) };
			}
		},
	);
}
