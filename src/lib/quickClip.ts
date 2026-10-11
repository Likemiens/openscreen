import {
	type CaptureRegion,
	isFullDisplayRegion,
	type PixelCropRect,
	regionToPixelCrop,
} from "./captureRegion";
import type { ExportQuality, Mp4FrameRate } from "./exporter/types";
import type { CursorCaptureMode } from "./recordingSession";

/**
 * A quick clip is a recording that needs no Studio pass: the cursor is already
 * in the frames and there is no separate webcam track to composite. Such a
 * recording is turned into the final MP4 right after Stop.
 */
export function canFinalizeQuickClip(input: {
	cursorCaptureMode: CursorCaptureMode;
	hasWebcamTrack: boolean;
}): boolean {
	return input.cursorCaptureMode === "system" && !input.hasWebcamTrack;
}

export interface QuickClipPlanInput {
	sourceWidth: number;
	sourceHeight: number;
	/** Measured frame rate of the recording, when known. */
	sourceFrameRate?: number | null;
	sourceIsMp4: boolean;
	quality: ExportQuality;
	frameRate: Mp4FrameRate;
	region?: CaptureRegion | null;
}

export type QuickClipPlan =
	| { mode: "copy"; width: number; height: number }
	| {
			mode: "transcode";
			width: number;
			height: number;
			crop?: PixelCropRect;
			bitrate: number;
			/** Set only when the recording must be resampled to a lower rate. */
			frameRate?: Mp4FrameRate;
	  };

const SHORT_SIDE_BY_QUALITY: Record<ExportQuality, number> = {
	medium: 720,
	good: 1080,
	source: Number.POSITIVE_INFINITY,
};

// Screen content compresses well; this keeps text crisp while producing files
// small enough to share. 1080p60 lands near 10 Mbps, 720p30 near 3 Mbps.
const BITS_PER_PIXEL_FRAME = 0.08;
const MIN_BITRATE = 3_000_000;
const MAX_BITRATE = 40_000_000;
// A recording made at 60 fps may report 59.x; do not resample for rounding noise.
const FRAME_RATE_TOLERANCE = 2;
// H.264 encoders commonly stop at 4096 px per side and about 4096 x 2304 pixels in
// total (level 5.x). A larger crop — an ultrawide or 5K display at Original quality —
// is scaled down to fit rather than handed to an encoder that would refuse it.
const MAX_ENCODE_SIDE = 4096;
const MAX_ENCODE_PIXELS = 4096 * 2304;

function toEven(value: number): number {
	return Math.max(2, Math.floor(value / 2) * 2);
}

export function calculateQuickClipBitrate(width: number, height: number, frameRate: number) {
	const raw = width * height * frameRate * BITS_PER_PIXEL_FRAME;
	return Math.round(Math.min(MAX_BITRATE, Math.max(MIN_BITRATE, raw)));
}

/** Decides whether a recording can be saved as-is or needs a crop/scale pass. */
export function planQuickClip(input: QuickClipPlanInput): QuickClipPlan {
	const sourceWidth = toEven(input.sourceWidth);
	const sourceHeight = toEven(input.sourceHeight);

	const crop =
		input.region && !isFullDisplayRegion(input.region)
			? regionToPixelCrop(input.region, input.sourceWidth, input.sourceHeight)
			: undefined;
	const baseWidth = crop?.width ?? sourceWidth;
	const baseHeight = crop?.height ?? sourceHeight;

	const targetShortSide = SHORT_SIDE_BY_QUALITY[input.quality];
	const shortSide = Math.min(baseWidth, baseHeight);
	const scale = shortSide > targetShortSide ? targetShortSide / shortSide : 1;

	const resampleFrameRate =
		typeof input.sourceFrameRate === "number" &&
		Number.isFinite(input.sourceFrameRate) &&
		input.sourceFrameRate > input.frameRate + FRAME_RATE_TOLERANCE;

	if (!crop && scale === 1 && !resampleFrameRate && input.sourceIsMp4) {
		return { mode: "copy", width: sourceWidth, height: sourceHeight };
	}

	const encodeScale = Math.min(
		scale,
		MAX_ENCODE_SIDE / baseWidth,
		MAX_ENCODE_SIDE / baseHeight,
		Math.sqrt(MAX_ENCODE_PIXELS / (baseWidth * baseHeight)),
	);
	// Round for an ordinary resize; round down only when an encoder limit is the bound,
	// where a pixel over is a pixel too many.
	const fit = encodeScale < scale ? Math.floor : Math.round;
	const width = toEven(fit(baseWidth * encodeScale));
	const height = toEven(fit(baseHeight * encodeScale));

	return {
		mode: "transcode",
		width,
		height,
		...(crop ? { crop } : {}),
		bitrate: calculateQuickClipBitrate(width, height, input.frameRate),
		...(resampleFrameRate ? { frameRate: input.frameRate } : {}),
	};
}

export function formatFileSize(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
	const megabytes = bytes / (1024 * 1024);
	if (megabytes >= 1024) return `${(megabytes / 1024).toFixed(2)} GB`;
	if (megabytes >= 1) return `${megabytes.toFixed(megabytes >= 100 ? 0 : 1)} MB`;
	return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function formatClipDuration(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
	const total = Math.round(seconds);
	const minutes = Math.floor(total / 60);
	const rest = total % 60;
	return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export const QUALITY_LABELS: Record<ExportQuality, string> = {
	medium: "720p",
	good: "1080p",
	source: "Original",
};
