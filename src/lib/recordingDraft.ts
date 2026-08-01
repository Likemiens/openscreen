const INVALID_FILE_NAME_CHARACTERS = /[<>:"/\\|?*]/g;
const TRAILING_DOTS_AND_SPACES = /[. ]+$/g;

export const RECORDING_DRAFT_TITLE_MAX_LENGTH = 120;

export function createDefaultRecordingTitle(createdAt = Date.now()): string {
	const date = new Date(createdAt);
	const pad = (value: number) => String(value).padStart(2, "0");
	return `Запись ${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
		date.getHours(),
	)}-${pad(date.getMinutes())}`;
}

export function sanitizeRecordingTitle(
	value: unknown,
	fallback = createDefaultRecordingTitle(),
): string {
	if (typeof value !== "string") return fallback;

	const normalized = value
		.split("")
		.map((character) => (character.charCodeAt(0) < 32 ? "-" : character))
		.join("")
		.replace(INVALID_FILE_NAME_CHARACTERS, "-")
		.replace(/\s+/g, " ")
		.trim()
		.replace(TRAILING_DOTS_AND_SPACES, "")
		.slice(0, RECORDING_DRAFT_TITLE_MAX_LENGTH)
		.trim()
		.replace(TRAILING_DOTS_AND_SPACES, "");

	return normalized || fallback;
}

export function buildPublishedFileName(title: unknown, extension = ".mp4"): string {
	const normalizedExtension = extension.startsWith(".") ? extension : `.${extension}`;
	return `${sanitizeRecordingTitle(title)}${normalizedExtension.toLowerCase()}`;
}
