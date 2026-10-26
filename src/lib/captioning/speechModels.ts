/**
 * The speech-to-text models transcription can use, shared by the main process (which
 * downloads them, and nothing else) and the transcription worker (which picks one).
 * Neither ships with the app: the chosen one is downloaded once, on first use.
 */

/** Private scheme the main process serves speech models and the ONNX runtime on. */
export const SPEECH_SCHEME = "openscreen-asr";

export interface SpeechModel {
	id: string;
	device: "webgpu" | "wasm";
	/** Weights to load for each part of the model (transformers.js `dtype`). */
	dtype: Record<string, string>;
	/** One-time download, for the UI. */
	downloadMb: number;
}

export const SPEECH_MODELS = {
	/** Whisper large-v3-turbo on the GPU: the most accurate, and fast where WebGPU runs. */
	gpu: {
		id: "onnx-community/whisper-large-v3-turbo",
		device: "webgpu",
		dtype: { encoder_model: "q4f16", decoder_model_merged: "q4f16" },
		downloadMb: 564,
	},
	/** Whisper small on the processor, for machines without WebGPU. */
	cpu: {
		id: "onnx-community/whisper-small",
		device: "wasm",
		dtype: { encoder_model: "q8", decoder_model_merged: "q8" },
		downloadMb: 249,
	},
} as const satisfies Record<string, SpeechModel>;

export const SPEECH_MODEL_IDS: ReadonlySet<string> = new Set(
	Object.values(SPEECH_MODELS).map((model) => model.id),
);

const HUB_FILE = /^https:\/\/huggingface\.co\/([^/]+\/[^/]+)\/resolve\/[^/]+\/(.+)$/;

/**
 * Hugging Face file URLs for our models, rewritten to the app's own scheme: the main
 * process downloads each file once and serves it from disk afterwards. Anything else
 * is returned unchanged.
 */
export function toSpeechAssetUrl(url: string): string {
	const match = HUB_FILE.exec(url);
	if (!match || !SPEECH_MODEL_IDS.has(match[1])) return url;
	return `${SPEECH_SCHEME}://models/${match[1]}/${match[2].split("?")[0]}`;
}

/**
 * The ONNX Runtime build transcription runs on (its threads load the `.mjs` glue
 * themselves), served by the main process from the app's resources.
 */
export const SPEECH_RUNTIME_FILES = {
	mjs: `${SPEECH_SCHEME}://runtime/ort-wasm-simd-threaded.asyncify.mjs`,
	wasm: `${SPEECH_SCHEME}://runtime/ort-wasm-simd-threaded.asyncify.wasm`,
};
