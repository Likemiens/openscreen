export const DEFAULT_YANDEX_DISK_FOLDER = "Recordings";

export interface YandexDiskSettings {
	autoUpload: boolean;
	folder: string;
	connected: boolean;
	encryptionAvailable: boolean;
}

export interface SaveYandexDiskSettingsInput {
	autoUpload: boolean;
	folder: string;
	/**
	 * A token is write-only: the main process encrypts it and never returns it to the renderer.
	 * Omit this field to keep the currently stored token.
	 */
	accessToken?: string;
}

export interface YandexDiskSettingsResult {
	success: boolean;
	settings?: YandexDiskSettings;
	error?: string;
}

export interface YandexDiskUploadRequestResult {
	success: boolean;
	queued?: boolean;
	skipped?: "disabled" | "not-connected";
	error?: string;
}

export type YandexDiskUploadState = "uploading" | "success" | "error";

export interface YandexDiskUploadStatus {
	uploadId: string;
	state: YandexDiskUploadState;
	fileName: string;
	remotePath: string;
	error?: string;
}

/**
 * Yandex Disk's `app:/` root already isolates OpenScreen from the rest of the user's Disk.
 * Keep the setting relative to that root and remove traversal-like segments.
 */
export function normalizeYandexDiskFolder(value: unknown): string {
	if (typeof value !== "string") return DEFAULT_YANDEX_DISK_FOLDER;

	const segments = value
		.trim()
		.replace(/\\/g, "/")
		.replace(/^(?:app|disk):\/*/i, "")
		.split("/")
		.map((segment) => segment.trim())
		.filter((segment) => segment.length > 0 && segment !== "." && segment !== "..");

	return segments.join("/") || DEFAULT_YANDEX_DISK_FOLDER;
}

export function buildYandexDiskRemotePath(folder: unknown, fileName: string): string {
	const normalizedFolder = normalizeYandexDiskFolder(folder);
	const normalizedFileName =
		fileName.split(/[\\/]/).pop()?.trim().replace(/[\\/]/g, "-") || "recording.webm";

	return `app:/${normalizedFolder}/${normalizedFileName}`;
}
