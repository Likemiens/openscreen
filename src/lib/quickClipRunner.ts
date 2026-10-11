import {
	ALL_FORMATS,
	Conversion,
	Input,
	Mp4OutputFormat,
	Output,
	StreamSource,
	StreamTarget,
	type StreamTargetChunk,
} from "mediabunny";
import type { CaptureRegion } from "./captureRegion";
import type { ExportQuality, Mp4FrameRate } from "./exporter/types";
import { planQuickClip, type QuickClipPlan } from "./quickClip";

// Each read crosses the IPC boundary, so fetch generously and let mediabunny cache it.
const SOURCE_CACHE_BYTES = 64 * 1024 * 1024;
const OUTPUT_CHUNK_BYTES = 4 * 1024 * 1024;
// Below this size the clip is assembled in memory so the MP4 index can be written first
// ("fast start"), which lets players and share links begin playback immediately.
const FAST_START_MAX_BYTES = 256 * 1024 * 1024;
const KEY_FRAME_INTERVAL_SECONDS = 2;
const FRAME_RATE_SAMPLE_PACKETS = 120;

export interface FinalizeQuickClipInput {
	sourcePath: string;
	title: string;
	quality: ExportQuality;
	frameRate: Mp4FrameRate;
	region: CaptureRegion | null;
	onProgress?: (fraction: number) => void;
}

export interface FinishedQuickClip {
	path: string;
	sizeBytes: number;
	width: number;
	height: number;
	durationSeconds: number;
	/** "copy" when the recording was already the final file. */
	mode: QuickClipPlan["mode"];
}

function createSource(sourcePath: string, size: number): StreamSource {
	return new StreamSource({
		getSize: () => size,
		read: async (start, end) => {
			const result = await window.electronAPI.readFileChunk(sourcePath, start, end - start);
			if (!result.success || !result.data) {
				throw new Error(result.message ?? "Could not read the recording.");
			}
			return new Uint8Array(result.data);
		},
		maxCacheSize: SOURCE_CACHE_BYTES,
		prefetchProfile: "network",
	});
}

function createClipWritable(outputId: string): WritableStream<StreamTargetChunk> {
	return new WritableStream<StreamTargetChunk>({
		async write(chunk) {
			const result = await window.electronAPI.writeClipOutput(outputId, chunk.position, chunk.data);
			if (!result.success) {
				throw new Error(result.error ?? "Could not write the clip.");
			}
		},
	});
}

/**
 * Turns a finished recording into the shareable MP4 in the user's save folder.
 * A recording that already matches the requested output is copied; anything that
 * needs a crop, a smaller size or a lower frame rate goes through one hardware
 * decode/encode pass, with audio passed through untouched where the codec allows.
 */
export async function finalizeQuickClip(input: FinalizeQuickClipInput): Promise<FinishedQuickClip> {
	const info = await window.electronAPI.getReadableFileInfo(input.sourcePath);
	if (!info.success || typeof info.size !== "number" || info.size <= 0) {
		throw new Error(info.message ?? "The recording is empty.");
	}

	const media = new Input({
		source: createSource(input.sourcePath, info.size),
		formats: ALL_FORMATS,
	});

	try {
		const videoTrack = await media.getPrimaryVideoTrack();
		if (!videoTrack) throw new Error("The recording has no video track.");

		const [durationSeconds, packetStats] = await Promise.all([
			media.computeDuration(),
			videoTrack.computePacketStats(FRAME_RATE_SAMPLE_PACKETS).catch(() => null),
		]);
		const sourceFrameRate = packetStats?.averagePacketRate ?? null;

		const plan = planQuickClip({
			sourceWidth: videoTrack.displayWidth,
			sourceHeight: videoTrack.displayHeight,
			sourceFrameRate,
			sourceIsMp4: input.sourcePath.toLowerCase().endsWith(".mp4"),
			quality: input.quality,
			frameRate: input.frameRate,
			region: input.region,
		});
		if (plan.mode === "copy") {
			const copied = await window.electronAPI.copyRecordingAsClip(input.sourcePath, input.title);
			if (!copied.success || !copied.path) {
				throw new Error(copied.error ?? "Could not save the clip.");
			}
			input.onProgress?.(1);
			return {
				path: copied.path,
				sizeBytes: copied.size ?? info.size,
				width: plan.width,
				height: plan.height,
				durationSeconds,
				mode: "copy",
			};
		}

		const opened = await window.electronAPI.openClipOutput(input.title);
		if (!opened.success || !opened.id) {
			throw new Error(opened.error ?? "Could not create the clip file.");
		}
		const outputId = opened.id;

		try {
			const estimatedBytes = (plan.bitrate / 8) * Math.max(1, durationSeconds);
			const output = new Output({
				format: new Mp4OutputFormat({
					fastStart: estimatedBytes <= FAST_START_MAX_BYTES ? "in-memory" : false,
				}),
				target: new StreamTarget(createClipWritable(outputId), {
					chunked: true,
					chunkSize: OUTPUT_CHUNK_BYTES,
				}),
			});

			const conversion = await Conversion.init({
				input: media,
				output,
				video: {
					...(plan.crop ? { crop: plan.crop } : {}),
					width: plan.width,
					height: plan.height,
					fit: "fill",
					codec: "avc",
					bitrate: plan.bitrate,
					keyFrameInterval: KEY_FRAME_INTERVAL_SECONDS,
					...(plan.frameRate ? { frameRate: plan.frameRate } : {}),
				},
				showWarnings: false,
			});
			// `isValid` stays true when a track is merely dropped: a conversion that lost
			// its video (no encoder for this frame size) would "succeed" as an audio-only
			// file, and the raw recording would then be deleted. Refuse it instead.
			const keepsVideo = conversion.utilizedTracks.some((track) => track.isVideoTrack());
			if (!conversion.isValid || !keepsVideo) {
				throw new Error("This recording cannot be converted on this device.");
			}

			conversion.onProgress = (progress) => input.onProgress?.(Math.min(1, progress));
			await conversion.execute();
		} catch (error) {
			await window.electronAPI.closeClipOutput(outputId, true).catch(() => undefined);
			throw error;
		}

		const closed = await window.electronAPI.closeClipOutput(outputId);
		if (!closed.success || !closed.path) {
			throw new Error(closed.error ?? "Could not save the clip.");
		}
		if (!closed.size) {
			// Nothing was written: don't present an empty file as the finished clip.
			await window.electronAPI.trashClip(closed.path).catch(() => undefined);
			throw new Error("The converted clip is empty.");
		}

		return {
			path: closed.path,
			sizeBytes: closed.size ?? 0,
			width: plan.width,
			height: plan.height,
			durationSeconds,
			mode: "transcode",
		};
	} finally {
		media.dispose();
	}
}
