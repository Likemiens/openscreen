import { beforeEach, describe, expect, it } from "vitest";
import {
	DEFAULT_CAPTURE_SETTINGS,
	loadCaptureSettings,
	normalizeCaptureSettings,
	resolveEffectiveCapture,
	saveCaptureSettings,
} from "./captureSettings";

describe("resolveEffectiveCapture", () => {
	const preferences = { webcamEnabled: true, cursorCaptureMode: "editable-overlay" as const };

	it("records area clips with the cursor in the video and no camera track", () => {
		expect(resolveEffectiveCapture({ mode: "area", ...preferences })).toEqual({
			webcamEnabled: false,
			cursorCaptureMode: "system",
		});
	});

	it("honours the preferences for window and screen captures", () => {
		expect(resolveEffectiveCapture({ mode: "window", ...preferences })).toEqual(preferences);
		expect(resolveEffectiveCapture({ mode: "screen", ...preferences })).toEqual(preferences);
	});
});

describe("capture settings", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it("defaults to an instantly shareable area clip", () => {
		expect(loadCaptureSettings()).toEqual(DEFAULT_CAPTURE_SETTINGS);
		expect(DEFAULT_CAPTURE_SETTINGS.cursorCaptureMode).toBe("system");
		expect(DEFAULT_CAPTURE_SETTINGS.countdownSeconds).toBe(0);
	});

	it("round-trips the last-used setup, including the area", () => {
		const settings = {
			...DEFAULT_CAPTURE_SETTINGS,
			mode: "area" as const,
			quality: "medium" as const,
			frameRate: 30 as const,
			microphoneEnabled: true,
			microphoneDeviceId: "mic-1",
			microphoneDeviceName: "Studio mic",
			region: {
				displayId: 7,
				x: 10,
				y: 20,
				width: 800,
				height: 600,
				displayWidth: 1920,
				displayHeight: 1080,
				scaleFactor: 1.25,
			},
		};

		saveCaptureSettings(settings);

		expect(loadCaptureSettings()).toEqual(settings);
	});

	it("falls back field by field instead of discarding everything", () => {
		expect(
			normalizeCaptureSettings({
				mode: "hologram",
				quality: "medium",
				frameRate: 24,
				countdownSeconds: 5,
				systemAudioEnabled: "yes",
				region: { x: 1 },
			}),
		).toEqual({
			...DEFAULT_CAPTURE_SETTINGS,
			quality: "medium",
			countdownSeconds: 5,
		});
	});

	it("survives corrupted storage", () => {
		localStorage.setItem("openscreen_capture_settings_v1", "{not json");
		expect(loadCaptureSettings()).toEqual(DEFAULT_CAPTURE_SETTINGS);
	});
});
