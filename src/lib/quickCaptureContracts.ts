import type { AppSettingsView } from "./appSettings";
import type { CaptureRegion } from "./captureRegion";

/** Commands the main process sends to the recorder HUD. */
export type HudCommand =
	/** The record hotkey was pressed while idle: start a capture with the last setup. */
	| "quick-record"
	/** Tray "Record area…": always go through the area picker first. */
	| "record-area";

export interface RegionSelectorContext {
	display: {
		id: number;
		/** Display size in DIP. */
		width: number;
		height: number;
		scaleFactor: number;
	};
	/** The previous selection, offered again when it was drawn on this display. */
	initialRegion: CaptureRegion | null;
}

export type RegionSelectionResult =
	| { canceled: true }
	| { canceled: false; region: CaptureRegion; startRecording: boolean };

export interface ClipFileResult {
	success: boolean;
	path?: string;
	/** File size in bytes. */
	size?: number;
	discarded?: boolean;
	error?: string;
}

export interface AppSettingsResult {
	success: boolean;
	settings: AppSettingsView;
	canceled?: boolean;
	error?: string;
}
