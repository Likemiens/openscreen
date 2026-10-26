import { afterEach, describe, expect, it, vi } from "vitest";
import { toSpeechAssetUrl } from "./speechModels";
import type { TranscribeWorkerRequest } from "./transcribe";
import { transcribeMono16kToSegments, transcribeStream } from "./transcribe";
import { Resampler16k } from "./transcribeFile";

const RATE = 16_000;

function tone(seconds: number, frequency = 220, rate = RATE, amplitude = 0.3): Float32Array {
	const out = new Float32Array(Math.round(seconds * rate));
	for (let i = 0; i < out.length; i += 1)
		out[i] = amplitude * Math.sin((2 * Math.PI * frequency * i) / rate);
	return out;
}

function concat(...parts: Float32Array[]): Float32Array {
	const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
	let at = 0;
	for (const part of parts) {
		out.set(part, at);
		at += part.length;
	}
	return out;
}

/** Stands in for the Whisper worker: "hears" one phrase per block it is sent. */
class FakeWorker {
	static blocks: Array<{ offsetSec: number; durationSec: number }> = [];
	onmessage: ((event: MessageEvent) => void) | null = null;
	onerror: ((event: ErrorEvent) => void) | null = null;
	terminated = false;

	postMessage(request: TranscribeWorkerRequest) {
		if (request.type === "load") return;
		const durationSec = request.samples.length / RATE;
		FakeWorker.blocks.push({ offsetSec: request.offsetSec, durationSec });
		queueMicrotask(() => {
			this.onmessage?.({
				data: { type: "status", phase: "transcribe", kind: "gpu" },
			} as MessageEvent);
			this.onmessage?.({
				data: {
					type: "result",
					id: request.id,
					segments: [
						{
							startSec: request.offsetSec + 0.5,
							endSec: request.offsetSec + Math.min(durationSec, 3),
							text: `phrase at ${Math.round(request.offsetSec)}`,
						},
					],
				},
			} as MessageEvent);
		});
	}

	terminate() {
		this.terminated = true;
	}
}

async function* chunked(samples: Float32Array, size: number) {
	for (let at = 0; at < samples.length; at += size) yield samples.slice(at, at + size);
}

describe("transcribeStream", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		FakeWorker.blocks = [];
	});

	it("transcribes long audio a minute at a time, skipping silence, with real times", async () => {
		vi.stubGlobal("Worker", FakeWorker);
		const audio = concat(tone(70), new Float32Array(RATE * 70), tone(40));
		const progress: Array<number | null> = [];

		const segments = await transcribeStream(chunked(audio, 4096), {
			durationSec: audio.length / RATE,
			onProgress: (p) => progress.push(p.fraction),
		});

		// Blocks cover the speech; the minute of pure silence is never sent.
		const sent = FakeWorker.blocks;
		expect(sent.length).toBeGreaterThanOrEqual(2);
		expect(sent[0].offsetSec).toBe(0);
		for (const block of sent) expect(block.durationSec).toBeLessThanOrEqual(68);
		expect(
			sent.some((block) => block.offsetSec >= 75 && block.offsetSec + block.durationSec <= 135),
		).toBe(false);
		// Segment times are positions in the whole recording.
		expect(segments.map((s) => s.text)).toContain("phrase at 0");
		expect(segments.at(-1)!.startSec).toBeGreaterThan(100);
		expect(progress.at(-1)).toBe(1);
	});

	it("stops the worker when cancelled", async () => {
		vi.stubGlobal("Worker", FakeWorker);
		const controller = new AbortController();
		controller.abort();

		await expect(
			transcribeStream(chunked(tone(5), 4096), { signal: controller.signal }),
		).rejects.toThrow(/Abort/);
	});
});

describe("transcribeMono16kToSegments", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("drops what falls in removed parts of the clip", async () => {
		vi.stubGlobal("Worker", FakeWorker);
		const result = await transcribeMono16kToSegments(tone(10), {
			trimRegions: [{ id: "t1", startMs: 0, endMs: 2_000 }],
		});

		expect(result.granularity).toBe("phrase");
		expect(result.segments).toEqual([]);
	});
});

describe("Resampler16k", () => {
	function zeroCrossings(samples: Float32Array): number {
		let count = 0;
		for (let i = 1; i < samples.length; i += 1)
			if (samples[i - 1] < 0 !== samples[i] < 0) count += 1;
		return count;
	}

	function rms(samples: Float32Array): number {
		return Math.sqrt(samples.reduce((sum, v) => sum + v * v, 0) / samples.length);
	}

	it("keeps speech frequencies and the right length, across chunk boundaries", () => {
		const resampler = new Resampler16k(48_000);
		const input = tone(1, 1_000, 48_000);
		const out = concat(
			...Array.from({ length: 10 }, (_, i) =>
				resampler.push(input.subarray(i * 4_800, (i + 1) * 4_800)),
			),
		);

		expect(Math.abs(out.length - RATE)).toBeLessThanOrEqual(2);
		// 1 kHz for a second: about 2000 zero crossings at any sample rate.
		expect(Math.abs(zeroCrossings(out) - 2_000)).toBeLessThan(10);
		expect(rms(out.subarray(1_000))).toBeGreaterThan(0.18);
	});

	it("filters out what lies above the new Nyquist instead of folding it into speech", () => {
		const out = new Resampler16k(48_000).push(tone(1, 12_000, 48_000));
		expect(rms(out.subarray(1_000))).toBeLessThan(0.03);
	});

	it("passes 16 kHz audio through untouched", () => {
		const input = tone(0.1);
		expect(new Resampler16k(RATE).push(input)).toBe(input);
	});
});

describe("toSpeechAssetUrl", () => {
	it("sends our models' Hugging Face files to the app scheme", () => {
		expect(
			toSpeechAssetUrl(
				"https://huggingface.co/onnx-community/whisper-small/resolve/main/onnx/encoder_model_quantized.onnx",
			),
		).toBe(
			"openscreen-asr://models/onnx-community/whisper-small/onnx/encoder_model_quantized.onnx",
		);
	});

	it("leaves every other URL alone", () => {
		const other = "https://huggingface.co/someone/else/resolve/main/config.json";
		expect(toSpeechAssetUrl(other)).toBe(other);
		expect(toSpeechAssetUrl("https://example.com/a.json")).toBe("https://example.com/a.json");
	});
});
