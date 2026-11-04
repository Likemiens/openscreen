export type NativeWindowsSourceType = "display" | "window";

export type NativeWindowsRecordingRequest = {
	recordingId?: number;
	preferSoftwareEncoder?: boolean;
	source: {
		type: NativeWindowsSourceType;
		sourceId: string;
		displayId?: number;
		windowHandle?: string;
	};
	video: {
		fps: number;
		width: number;
		height: number;
	};
	audio: {
		system: {
			enabled: boolean;
		};
		microphone: {
			enabled: boolean;
			deviceId?: string;
			deviceName?: string;
			gain: number;
		};
	};
	webcam: {
		enabled: boolean;
		deviceId?: string;
		deviceName?: string;
		directShowClsid?: string;
		width: number;
		height: number;
		fps: number;
	};
	cursor: {
		mode: import("./recordingSession").CursorCaptureMode;
	};
	/**
	 * Set for a quick clip: the recorder writes it at its final size, so nothing is left to
	 * crop or scale after Stop.
	 */
	finalOutput?: QuickClipFinalOutput;
};

export type QuickClipFinalOutput = {
	/** The area to keep, as fractions of the recorded frame; null for the whole frame. */
	region: { x: number; y: number; width: number; height: number } | null;
	/** Short side of the clip in pixels; 0 keeps the recorded size. */
	targetShortSide: number;
};

export type NativeWindowsRecordingStartResult = {
	success: boolean;
	recordingId?: number;
	path?: string;
	helperPath?: string;
	error?: string;
	/** Helper-reported encoder selection: "default", "software-preferred", or "software-fallback". */
	videoEncoderSelection?: string | null;
	/** Whether the recorder writes the clip at its final size (it falls back to the whole frame). */
	finalOutputApplied?: boolean;
};

export function parseWindowHandleFromSourceId(sourceId?: string | null) {
	if (!sourceId?.startsWith("window:")) {
		return null;
	}

	const handlePart = sourceId.split(":")[1];
	if (!handlePart || !/^\d+$/.test(handlePart)) {
		return null;
	}

	return handlePart;
}
