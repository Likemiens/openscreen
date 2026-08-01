export const DEFAULT_YANDEX_DISK_FOLDER = "OpenScreen Exports";
export const YANDEX_DISK_OAUTH_CLIENT_ID = "142b83b82bbf41bba44432263a352580";
export const YANDEX_DISK_PUBLIC_FOLDER_URL = "https://disk.yandex.ru/d/GKhvA2QkXOBe2g";
export const YANDEX_DISK_OAUTH_URL = `https://oauth.yandex.ru/authorize?response_type=token&client_id=${YANDEX_DISK_OAUTH_CLIENT_ID}&scope=cloud_api%3Adisk.read%20cloud_api%3Adisk.write`;

export interface YandexDiskSettings {
	folder: string;
	deleteLocalAfterUpload: boolean;
	connected: boolean;
	encryptionAvailable: boolean;
}

export interface SaveYandexDiskSettingsInput {
	folder: string;
	deleteLocalAfterUpload: boolean;
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
	error?: string;
}

export interface YandexDiskUploadRequest {
	filePath: string;
	fileName?: string;
	cleanupSourcePaths?: string[];
}

export type YandexDiskUploadState =
	| "uploading"
	| "success"
	| "error"
	| "local-deleted"
	| "cleanup-error";

export type YandexDiskLocalDeletionState = "kept" | "pending" | "deleted";

export interface YandexDiskUploadStatus {
	uploadId: string;
	state: YandexDiskUploadState;
	fileName: string;
	remotePath: string;
	publicUrl: string;
	localDeletion?: YandexDiskLocalDeletionState;
	error?: string;
}

export interface YandexDiskResourceMetadata {
	type?: string;
	size?: number;
	public_url?: string;
	public_key?: string;
}

export function matchesYandexDiskPublicFolder(
	resource: YandexDiskResourceMetadata,
	publicFolderUrl: string,
): boolean {
	const publicFolderId = publicFolderUrl.split("/").filter(Boolean).pop();
	const publicReference = `${resource.public_url ?? ""} ${resource.public_key ?? ""}`;
	return (
		resource.type === "dir" && Boolean(publicFolderId && publicReference.includes(publicFolderId))
	);
}

export function isVerifiedYandexDiskUpload(
	resource: YandexDiskResourceMetadata,
	expectedSize: number,
): boolean {
	return resource.type === "file" && resource.size === expectedSize;
}

/**
 * Keep the user-entered folder below the Disk root and remove traversal-like segments.
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

	return `disk:/${normalizedFolder}/${normalizedFileName}`;
}
