// @vitest-environment node
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Writable } from "node:stream";
import type { IpcMain } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	YANDEX_DISK_PUBLIC_FOLDER_URL,
	type YandexDiskUploadRequest,
	type YandexDiskUploadRequestResult,
	type YandexDiskUploadStatus,
} from "../../src/lib/yandexDisk";

const electronMocks = vi.hoisted(() => ({
	send: vi.fn(),
	writeText: vi.fn(),
}));

vi.mock("electron", () => ({
	BrowserWindow: {
		getAllWindows: () => [{ isDestroyed: () => false, webContents: { send: electronMocks.send } }],
	},
	clipboard: { writeText: electronMocks.writeText },
	Notification: { isSupported: () => false },
	safeStorage: {
		isEncryptionAvailable: () => true,
		encryptString: (value: string) => Buffer.from(`enc:${value}`),
		decryptString: (value: Buffer) => value.toString().replace(/^enc:/, ""),
	},
	shell: { openExternal: vi.fn() },
}));

// The upload itself goes through node:https. Swallow the bytes and answer 201.
vi.mock("node:https", () => ({
	request: (_url: URL, _options: unknown, onResponse: (response: EventEmitter) => void) => {
		const sink = new Writable({
			write(_chunk, _encoding, callback) {
				callback();
			},
		});
		sink.on("finish", () => {
			const response = Object.assign(new EventEmitter(), { statusCode: 201 });
			onResponse(response);
			response.emit("end");
		});
		return sink;
	},
}));

const PUBLIC_LINK = "https://disk.yandex.ru/i/clip-link";

function jsonResponse(body: unknown): Response {
	return new Response(JSON.stringify(body), { status: 200 });
}

describe("Yandex Disk uploads", () => {
	let workDir: string;
	let recordingsDir: string;
	let clipsDir: string;
	let folderChecks: number;
	let upload: (request: YandexDiskUploadRequest) => Promise<YandexDiskUploadRequestResult>;
	let approveUploadPath: (filePath: string) => void;

	function statuses(): YandexDiskUploadStatus[] {
		return electronMocks.send.mock.calls.map((call) => call[1] as YandexDiskUploadStatus);
	}

	async function waitForFinalStatus(): Promise<YandexDiskUploadStatus> {
		return vi.waitFor(() => {
			const final = statuses().find(
				(status) => status.state === "success" || status.state === "error",
			);
			if (!final) throw new Error("upload still running");
			return final;
		});
	}

	beforeEach(async () => {
		workDir = fs.mkdtempSync(path.join(os.tmpdir(), "openscreen-yadisk-"));
		recordingsDir = path.join(workDir, "recordings");
		clipsDir = path.join(workDir, "clips");
		fs.mkdirSync(recordingsDir);
		fs.mkdirSync(clipsDir);
		fs.writeFileSync(
			path.join(workDir, "yandex-disk.json"),
			JSON.stringify({
				version: 2,
				autoUpload: false,
				folder: "OpenScreen Exports",
				deleteLocalAfterUpload: true,
				pendingLocalDeletions: [],
				encryptedAccessToken: Buffer.from("enc:token").toString("base64"),
			}),
		);

		folderChecks = 0;
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: URL | string, init?: RequestInit) => {
				const url = new URL(String(input));
				const fields = url.searchParams.get("fields");
				if (url.pathname.endsWith("/resources/upload")) {
					return jsonResponse({ href: "https://uploader.example/put" });
				}
				if (url.pathname.endsWith("/resources/publish")) {
					expect(init?.method).toBe("PUT");
					return jsonResponse({});
				}
				if (fields === "type,public_url,public_key") {
					folderChecks += 1;
					return jsonResponse({ type: "dir", public_url: YANDEX_DISK_PUBLIC_FOLDER_URL });
				}
				if (fields === "type,size,path") {
					return jsonResponse({ type: "file", size: 5 });
				}
				if (fields === "public_url") {
					return jsonResponse({ public_url: PUBLIC_LINK });
				}
				throw new Error(`Unexpected Yandex Disk request: ${url}`);
			}),
		);

		electronMocks.send.mockClear();
		electronMocks.writeText.mockClear();

		const handlers = new Map<string, (...args: unknown[]) => unknown>();
		const ipcMain = {
			handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
				handlers.set(channel, handler);
			},
		} as unknown as IpcMain;

		const { registerYandexDiskIpcHandlers } = await import("./yandexDisk");
		const integration = registerYandexDiskIpcHandlers(ipcMain, recordingsDir, workDir);
		approveUploadPath = (filePath) => integration.approveUploadPath(filePath);
		upload = (request) =>
			handlers.get("upload-recording-to-yandex-disk")?.(
				{},
				request,
			) as Promise<YandexDiskUploadRequestResult>;
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		fs.rmSync(workDir, { recursive: true, force: true });
	});

	it("refuses files OpenScreen did not create", async () => {
		const stray = path.join(clipsDir, "stray.mp4");
		fs.writeFileSync(stray, "video");

		expect(await upload({ filePath: stray })).toEqual({
			success: false,
			error: "Only files created by OpenScreen can be uploaded.",
		});
		expect(statuses()).toHaveLength(0);
	});

	it("shares a clip from the user's folder and keeps the file", async () => {
		const clip = path.join(clipsDir, "Demo.mp4");
		fs.writeFileSync(clip, "video");
		approveUploadPath(clip);

		expect(await upload({ filePath: clip, fileName: "Demo", keepLocal: true })).toEqual({
			success: true,
			queued: true,
		});
		const final = await waitForFinalStatus();

		expect(final).toMatchObject({
			state: "success",
			filePath: clip,
			publicUrl: PUBLIC_LINK,
			localDeletion: "kept",
		});
		// "Delete after upload" is on, but a clip saved to the user's folder must survive.
		expect(fs.existsSync(clip)).toBe(true);
		expect(electronMocks.writeText).toHaveBeenCalledWith(PUBLIC_LINK);

		const progress = statuses()
			.filter((status) => status.state === "uploading")
			.map((status) => status.progress);
		expect(progress[0]).toBe(0);
		expect(progress.at(-1)).toBe(1);
		expect(statuses().every((status) => status.filePath === clip)).toBe(true);
	});

	it("still removes Studio exports from the recordings folder after upload", async () => {
		const exported = path.join(recordingsDir, "Export.mp4");
		fs.writeFileSync(exported, "video");

		await upload({ filePath: exported });
		const final = await waitForFinalStatus();

		expect(final).toMatchObject({ state: "success", localDeletion: "deleted" });
		expect(fs.existsSync(exported)).toBe(false);
	});

	it("checks the destination folder once for consecutive uploads", async () => {
		for (const name of ["First.mp4", "Second.mp4"]) {
			const clip = path.join(clipsDir, name);
			fs.writeFileSync(clip, "video");
			approveUploadPath(clip);
			electronMocks.send.mockClear();
			await upload({ filePath: clip, keepLocal: true });
			expect((await waitForFinalStatus()).state).toBe("success");
		}

		expect(folderChecks).toBe(1);
	});
});
