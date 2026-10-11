import { type CaptureRegion, normalizeCaptureRegion } from "./captureRegion";
import type { ExportQuality, Mp4FrameRate } from "./exporter/types";
import type { RecordingCountdownSeconds } from "./recordingRecipes";
import type { CursorCaptureMode } from "./recordingSession";

const CAPTURE_SETTINGS_KEY = "openscreen_capture_settings_v1";

export type CaptureMode = "area" | "window" | "screen";

/**
 * The last-used recorder setup. The HUD window is released from memory while
 * the app idles in the tray, so everything needed to record again without
 * re-configuring lives here rather than in React state.
 */
export interface CaptureSettings {
	mode: CaptureMode;
	region: CaptureRegion | null;
	quality: ExportQuality;
	frameRate: Mp4FrameRate;
	countdownSeconds: RecordingCountdownSeconds;
	microphoneEnabled: boolean;
	microphoneDeviceId?: string;
	microphoneDeviceName?: string;
	systemAudioEnabled: boolean;
	webcamEnabled: boolean;
	webcamDeviceId?: string;
	webcamDeviceName?: string;
	cursorCaptureMode: CursorCaptureMode;
}

export const DEFAULT_CAPTURE_SETTINGS: CaptureSettings = {
	mode: "area",
	region: null,
	quality: "good",
	frameRate: 60,
	countdownSeconds: 0,
	microphoneEnabled: false,
	systemAudioEnabled: false,
	webcamEnabled: false,
	// Baked-in cursor keeps the clip shareable the moment recording stops.
	cursorCaptureMode: "system",
};

/**
 * What a capture will actually use. Area clips are saved exactly as filmed, so in
 * area mode the cursor is always recorded into the video and there is no separate
 * camera track — whatever the stored preferences say. The preferences themselves are
 * left alone, so they come back when the mode changes.
 */
export function resolveEffectiveCapture(input: {
	mode: CaptureMode;
	webcamEnabled: boolean;
	cursorCaptureMode: CursorCaptureMode;
}): { webcamEnabled: boolean; cursorCaptureMode: CursorCaptureMode } {
	if (input.mode !== "area") {
		return { webcamEnabled: input.webcamEnabled, cursorCaptureMode: input.cursorCaptureMode };
	}
	return { webcamEnabled: false, cursorCaptureMode: "system" };
}

function optionalString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function normalizeCaptureSettings(value: unknown): CaptureSettings {
	if (!value || typeof value !== "object") return { ...DEFAULT_CAPTURE_SETTINGS };
	const raw = value as Record<string, unknown>;
	const microphoneDeviceId = optionalString(raw.microphoneDeviceId);
	const microphoneDeviceName = optionalString(raw.microphoneDeviceName);
	const webcamDeviceId = optionalString(raw.webcamDeviceId);
	const webcamDeviceName = optionalString(raw.webcamDeviceName);

	return {
		mode:
			raw.mode === "area" || raw.mode === "window" || raw.mode === "screen"
				? raw.mode
				: DEFAULT_CAPTURE_SETTINGS.mode,
		region: normalizeCaptureRegion(raw.region),
		quality:
			raw.quality === "medium" || raw.quality === "good" || raw.quality === "source"
				? raw.quality
				: DEFAULT_CAPTURE_SETTINGS.quality,
		frameRate: raw.frameRate === 30 || raw.frameRate === 60 ? raw.frameRate : 60,
		countdownSeconds:
			raw.countdownSeconds === 0 || raw.countdownSeconds === 3 || raw.countdownSeconds === 5
				? raw.countdownSeconds
				: DEFAULT_CAPTURE_SETTINGS.countdownSeconds,
		microphoneEnabled: raw.microphoneEnabled === true,
		...(microphoneDeviceId ? { microphoneDeviceId } : {}),
		...(microphoneDeviceName ? { microphoneDeviceName } : {}),
		systemAudioEnabled: raw.systemAudioEnabled === true,
		webcamEnabled: raw.webcamEnabled === true,
		...(webcamDeviceId ? { webcamDeviceId } : {}),
		...(webcamDeviceName ? { webcamDeviceName } : {}),
		cursorCaptureMode:
			raw.cursorCaptureMode === "editable-overlay" || raw.cursorCaptureMode === "system"
				? raw.cursorCaptureMode
				: DEFAULT_CAPTURE_SETTINGS.cursorCaptureMode,
	};
}

export function loadCaptureSettings(): CaptureSettings {
	try {
		const raw = localStorage.getItem(CAPTURE_SETTINGS_KEY);
		return normalizeCaptureSettings(raw ? JSON.parse(raw) : null);
	} catch {
		return { ...DEFAULT_CAPTURE_SETTINGS };
	}
}

export function saveCaptureSettings(settings: CaptureSettings): void {
	try {
		localStorage.setItem(CAPTURE_SETTINGS_KEY, JSON.stringify(settings));
	} catch {
		// Persistence is a convenience. Recording must still work without storage.
	}
}
