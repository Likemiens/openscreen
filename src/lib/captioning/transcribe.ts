import type { TrimRegion } from "@/components/video-editor/types";
import type { SPEECH_MODELS } from "./speechModels";
import { cleanSegments, findQuietCut, isSilent } from "./transcript";

export interface CaptionSegment {
	startSec: number;
	endSec: number;
	text: string;
}

/** How caption layout should interpret `CaptionSegment` times from `transcribeMono16kToSegments`. */
export type CaptionTimestampGranularity = "word" | "phrase";

export interface TranscribeMono16kResult {
	segments: CaptionSegment[];
	granularity: CaptionTimestampGranularity;
}

export type SpeechModelKind = keyof typeof SPEECH_MODELS;

/** Messages to the transcription worker. */
export type TranscribeWorkerRequest =
	/** Start loading the model now, while the page is still decoding the audio. */
	| { type: "load" }
	/** A block of 16 kHz mono audio to transcribe. */
	| {
			type: "block";
			id: number;
			samples: Float32Array;
			/** Where the block starts in the whole recording; segment times include it. */
			offsetSec: number;
			/** Whisper language code ("ru"); detected from the speech when omitted. */
			language?: string | null;
	  };

/** Messages the transcription worker posts back. */
export type TranscribeWorkerResponse =
	| { type: "status"; phase: "model" | "transcribe"; kind?: SpeechModelKind }
	/** Model files arriving: a one-time download, then a quick read from disk. */
	| { type: "model"; kind: SpeechModelKind; loaded: number; total: number }
	| { type: "result"; id: number; segments: CaptionSegment[] }
	| { type: "error"; id: number; message: string };

export type TranscriptionProgress =
	| { phase: "model"; kind?: SpeechModelKind; fraction: number | null }
	| { phase: "transcribe"; kind?: SpeechModelKind; fraction: number | null };

export interface TranscribeOptions {
	/** Length of the whole recording, for progress. */
	durationSec?: number;
	onProgress?: (progress: TranscriptionProgress) => void;
	signal?: AbortSignal;
	language?: string | null;
}

const SAMPLE_RATE = 16_000;
/** Audio is transcribed a minute at a time, so a long meeting never sits in memory whole. */
const BLOCK_SEC = 60;
/** Each block ends at the quietest moment of its last seconds, never inside a word. */
const CUT_SEARCH_SEC = 8;

function abortError() {
	return new DOMException("Aborted", "AbortError");
}

/** One worker, one model load, many blocks. */
function createTranscriber(options: TranscribeOptions) {
	const worker = new Worker(new URL("./transcribe.worker.ts", import.meta.url), {
		type: "module",
	});
	const pending = new Map<
		number,
		{ resolve: (s: CaptionSegment[]) => void; reject: (e: Error) => void }
	>();
	let nextId = 0;
	let kind: SpeechModelKind | undefined;
	let failure: Error | null = null;

	const fail = (error: Error) => {
		failure ??= error;
		for (const job of pending.values()) job.reject(error);
		pending.clear();
	};

	worker.onmessage = (event: MessageEvent<TranscribeWorkerResponse>) => {
		const message = event.data;
		if (message.type === "status") {
			kind = message.kind ?? kind;
			if (message.phase === "model") options.onProgress?.({ phase: "model", kind, fraction: null });
			return;
		}
		if (message.type === "model") {
			kind = message.kind;
			options.onProgress?.({
				phase: "model",
				kind,
				fraction: message.total > 0 ? Math.min(1, message.loaded / message.total) : null,
			});
			return;
		}
		const job = pending.get(message.id);
		pending.delete(message.id);
		if (message.type === "result") job?.resolve(message.segments);
		else job?.reject(new Error(message.message));
	};
	worker.onerror = (event) =>
		fail(new Error(event.message || "Transcription stopped unexpectedly"));
	worker.postMessage({ type: "load" } satisfies TranscribeWorkerRequest);

	return {
		get kind() {
			return kind;
		},
		transcribe(samples: Float32Array, offsetSec: number): Promise<CaptionSegment[]> {
			if (failure) return Promise.reject(failure);
			const id = nextId++;
			return new Promise((resolve, reject) => {
				pending.set(id, { resolve, reject });
				const request: TranscribeWorkerRequest = {
					type: "block",
					id,
					samples,
					offsetSec,
					language: options.language,
				};
				worker.postMessage(request, [samples.buffer]);
			});
		},
		dispose() {
			worker.terminate();
			fail(abortError());
		},
	};
}

/**
 * Transcribes a stream of 16 kHz mono audio (any chunk sizes) block by block: blocks
 * are cut at quiet moments, silent ones are skipped (Whisper invents text over
 * silence), and each block's segments are cleaned before the next one starts.
 */
export async function transcribeStream(
	chunks: AsyncIterable<Float32Array>,
	options: TranscribeOptions = {},
): Promise<CaptionSegment[]> {
	if (options.signal?.aborted) throw abortError();
	const transcriber = createTranscriber(options);
	const onAbort = () => transcriber.dispose();
	options.signal?.addEventListener("abort", onAbort, { once: true });

	const capacity = (BLOCK_SEC + CUT_SEARCH_SEC) * SAMPLE_RATE;
	const buffer = new Float32Array(capacity);
	let fill = 0;
	let startSec = 0;
	const segments: CaptionSegment[] = [];

	const report = (doneSec: number) => {
		const total = options.durationSec;
		options.onProgress?.({
			phase: "transcribe",
			kind: transcriber.kind,
			fraction: total && total > 0 ? Math.min(1, doneSec / total) : null,
		});
	};

	const runBlock = async (length: number) => {
		const block = buffer.subarray(0, length);
		if (!isSilent(block)) {
			const raw = await transcriber.transcribe(block.slice(), startSec);
			segments.push(...cleanSegments(raw, { samples: block, offsetSec: startSec }));
		}
		if (options.signal?.aborted) throw abortError();
		buffer.copyWithin(0, length, fill);
		fill -= length;
		startSec += length / SAMPLE_RATE;
		report(startSec);
	};

	try {
		for await (const chunk of chunks) {
			if (options.signal?.aborted) throw abortError();
			let offset = 0;
			while (offset < chunk.length) {
				const count = Math.min(chunk.length - offset, capacity - fill);
				buffer.set(chunk.subarray(offset, offset + count), fill);
				fill += count;
				offset += count;
				if (fill === capacity) {
					await runBlock(
						findQuietCut(buffer, capacity - CUT_SEARCH_SEC * SAMPLE_RATE * 2, capacity),
					);
				}
			}
		}
		if (fill > 0) await runBlock(fill);
		// Phrases repeated across a block boundary.
		return cleanSegments(segments);
	} finally {
		options.signal?.removeEventListener("abort", onAbort);
		transcriber.dispose();
	}
}

function overlapsTrim(segment: CaptionSegment, trims: TrimRegion[]): boolean {
	const startMs = segment.startSec * 1000;
	const endMs = segment.endSec * 1000;
	return trims.some((trim) => startMs < trim.endMs && endMs > trim.startMs);
}

/**
 * Transcribes mono 16 kHz audio into timed caption segments (Studio's auto captions).
 * Segments in removed parts of the clip are dropped.
 */
export async function transcribeMono16kToSegments(
	samples: Float32Array,
	options?: {
		trimRegions?: TrimRegion[];
		onStatus?: (phase: "model" | "transcribe") => void;
		signal?: AbortSignal;
	},
): Promise<TranscribeMono16kResult> {
	let lastPhase: string | null = null;
	const segments = await transcribeStream(
		(async function* () {
			yield samples;
		})(),
		{
			durationSec: samples.length / SAMPLE_RATE,
			signal: options?.signal,
			onProgress: (progress) => {
				if (progress.phase === lastPhase) return;
				lastPhase = progress.phase;
				options?.onStatus?.(progress.phase);
			},
		},
	);
	const trims = options?.trimRegions ?? [];
	return {
		segments: trims.length ? segments.filter((segment) => !overlapsTrim(segment, trims)) : segments,
		granularity: "phrase",
	};
}
