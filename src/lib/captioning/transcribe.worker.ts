/**
 * Web Worker running Whisper (transformers.js + ONNX Runtime) off the page's main
 * thread. On the first request it picks a model — Whisper large-v3-turbo on the GPU
 * where WebGPU runs, Whisper small on the processor elsewhere — and loads it (the main
 * process downloads it once and serves it from disk after that). Then it transcribes
 * blocks of 16 kHz mono audio as the page sends them.
 *
 * The page terminates the worker to cancel; model loading and inference can't be
 * interrupted from inside.
 */

import { env, pipeline, Tensor } from "@huggingface/transformers";
import {
	SPEECH_MODELS,
	SPEECH_RUNTIME_FILES,
	type SpeechModel,
	toSpeechAssetUrl,
} from "./speechModels";
import type {
	CaptionSegment,
	TranscribeWorkerRequest,
	TranscribeWorkerResponse,
} from "./transcribe";

type ModelKind = keyof typeof SPEECH_MODELS;
/** The transformers.js speech pipeline, and the parts language detection needs. */
type Transcriber = ((audio: Float32Array, options: Record<string, unknown>) => Promise<unknown>) & {
	processor: (audio: Float32Array) => Promise<{ input_features: Tensor }>;
	model: ((inputs: Record<string, Tensor>) => Promise<{ logits: Tensor }>) & {
		generation_config: { decoder_start_token_id: number; lang_to_id: Record<string, number> };
	};
};

env.allowLocalModels = false;
env.allowRemoteModels = true;
// The library keeps addressing Hugging Face (its existence/size probes only work for
// http(s) URLs); every request for our models is answered by the main process, which
// downloads the file once and serves it from disk afterwards.
const browserFetch = globalThis.fetch.bind(globalThis);
env.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
	browserFetch(
		typeof input === "string" || input instanceof URL ? toSpeechAssetUrl(String(input)) : input,
		init,
	)) as typeof fetch;
// The files already live on disk; a second copy in the browser cache would only
// double the space they take.
env.useBrowserCache = false;
env.useWasmCache = false;
const wasm = env.backends.onnx.wasm;
if (wasm) {
	// transformers.js points ONNX Runtime at a CDN; the app serves the runtime itself.
	wasm.wasmPaths = { ...SPEECH_RUNTIME_FILES };
	// The main process enables SharedArrayBuffer. Half the cores: fast, while the
	// computer stays usable.
	wasm.numThreads =
		typeof SharedArrayBuffer === "undefined"
			? 1
			: Math.max(1, Math.min(6, Math.floor((navigator.hardwareConcurrency || 2) / 2)));
}

function post(message: TranscribeWorkerResponse): void {
	(self as unknown as Worker).postMessage(message);
}

/** WebGPU with half-precision shaders: what the GPU model's weights need. */
async function canUseGpu(): Promise<boolean> {
	const gpu = (
		navigator as Navigator & {
			gpu?: { requestAdapter(): Promise<{ features: ReadonlySet<string> } | null> };
		}
	).gpu;
	if (!gpu) return false;
	try {
		const adapter = await gpu.requestAdapter();
		return Boolean(adapter?.features.has("shader-f16"));
	} catch {
		return false;
	}
}

let loading: Promise<{ transcribe: Transcriber; kind: ModelKind }> | null = null;

function loadModel(): Promise<{ transcribe: Transcriber; kind: ModelKind }> {
	loading ??= (async () => {
		const kinds: ModelKind[] = (await canUseGpu()) ? ["gpu", "cpu"] : ["cpu"];
		let lastError: unknown = null;
		for (const kind of kinds) {
			const model: SpeechModel = SPEECH_MODELS[kind];
			// Bytes per file, for one overall download figure.
			const files = new Map<string, { loaded: number; total: number }>();
			try {
				const transcribe = (await pipeline("automatic-speech-recognition", model.id, {
					device: model.device,
					dtype: model.dtype as never,
					progress_callback: (event: {
						status: string;
						file?: string;
						loaded?: number;
						total?: number;
					}) => {
						if (event.status !== "progress" || !event.file || !event.total) return;
						files.set(event.file, { loaded: event.loaded ?? 0, total: event.total });
						let loaded = 0;
						let total = 0;
						for (const file of files.values()) {
							loaded += file.loaded;
							total += file.total;
						}
						post({ type: "model", kind, loaded, total });
					},
				})) as unknown as Transcriber;
				return { transcribe, kind };
			} catch (error) {
				// A GPU that refuses the model (driver, memory) falls back to the processor.
				console.warn(`[transcribe] ${model.id} on ${model.device} failed:`, error);
				lastError = error;
			}
		}
		loading = null;
		throw lastError instanceof Error ? lastError : new Error(String(lastError));
	})();
	return loading;
}

function toSegments(result: unknown, offsetSec: number, durationSec: number): CaptionSegment[] {
	const chunks = (
		result as { chunks?: Array<{ timestamp?: [number | null, number | null]; text?: string }> }
	)?.chunks;
	if (!Array.isArray(chunks)) {
		const text = String((result as { text?: unknown })?.text ?? "").trim();
		return text ? [{ startSec: offsetSec, endSec: offsetSec + durationSec, text }] : [];
	}
	return chunks.flatMap((chunk, index) => {
		const text = String(chunk.text ?? "").trim();
		if (!text) return [];
		const start = Math.max(0, chunk.timestamp?.[0] ?? 0);
		const next = chunks[index + 1]?.timestamp?.[0];
		const end = Math.min(durationSec, chunk.timestamp?.[1] ?? next ?? durationSec);
		return [{ startSec: offsetSec + start, endSec: offsetSec + Math.max(end, start), text }];
	});
}

/**
 * The language spoken, as Whisper hears it: after the start-of-transcript token the
 * model predicts a language token. Left to itself, transformers.js would assume
 * English, and Whisper would then translate rather than transcribe.
 */
async function detectLanguage(transcribe: Transcriber, samples: Float32Array): Promise<string> {
	const { model } = transcribe;
	const config = model.generation_config;
	const { input_features } = await transcribe.processor(samples.subarray(0, 30 * 16_000));
	const { logits } = await model({
		input_features,
		decoder_input_ids: new Tensor(
			"int64",
			BigInt64Array.from([BigInt(config.decoder_start_token_id)]),
			[1, 1],
		),
	});
	const vocab = logits.dims[logits.dims.length - 1];
	const data = logits.data as Float32Array;
	const scores = data.subarray(data.length - vocab);
	let best: { token: string; score: number } | null = null;
	for (const [token, tokenId] of Object.entries(config.lang_to_id)) {
		if (!best || scores[tokenId] > best.score) best = { token, score: scores[tokenId] };
	}
	// "<|ru|>" -> "ru"
	return best ? best.token.slice(2, -2) : "en";
}

// Decided once, on the first block with speech, and kept: a meeting does not switch
// languages because one stretch is ambiguous.
let spokenLanguage: string | null = null;

self.onmessage = async (event: MessageEvent<TranscribeWorkerRequest>) => {
	const request = event.data;
	if (request.type === "load") {
		post({ type: "status", phase: "model" });
		// A failure here surfaces with the first block, which loads again.
		loadModel().catch(() => undefined);
		return;
	}
	const { id, samples, offsetSec, language } = request;
	try {
		const { transcribe, kind } = await loadModel();
		post({ type: "status", phase: "transcribe", kind });
		spokenLanguage ??= language ?? (await detectLanguage(transcribe, samples));
		const durationSec = samples.length / 16_000;
		const result = await transcribe(samples, {
			task: "transcribe",
			language: spokenLanguage,
			return_timestamps: true,
			// Long blocks are read in overlapping 30 s windows, as Whisper was trained.
			...(durationSec > 30 ? { chunk_length_s: 30, stride_length_s: 5 } : {}),
		});
		post({ type: "result", id, segments: toSegments(result, offsetSec, durationSec) });
	} catch (error) {
		post({ type: "error", id, message: error instanceof Error ? error.message : String(error) });
	}
};
