import { describe, expect, it } from "vitest";
import {
	buildPublishedFileName,
	createDefaultRecordingTitle,
	sanitizeRecordingTitle,
} from "./recordingDraft";

describe("recording draft names", () => {
	it("builds a stable Russian default title", () => {
		expect(createDefaultRecordingTitle(new Date(2026, 7, 1, 9, 5).getTime())).toBe(
			"Запись 2026-08-01 09-05",
		);
	});

	it("removes characters that are unsafe on Windows", () => {
		expect(sanitizeRecordingTitle(" Demo: \\ take / 1? ", "fallback")).toBe("Demo- - take - 1-");
	});

	it("uses the requested output extension", () => {
		expect(buildPublishedFileName("Мой ролик", "mp4")).toBe("Мой ролик.mp4");
	});
});
