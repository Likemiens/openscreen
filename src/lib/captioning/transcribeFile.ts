import { ALL_FORMATS, type AudioSample, AudioSampleSink, Input } from "mediabunny";
import { createRecordingSource } from "@/lib/quickClipRunner";
import { type CaptionSegment, type TranscribeOptions, transcribeStream } from "./transcribe";

const TARGET_RATE = 16_000;

/** Second-order low-pass (RBJ cookbook), state kept across chunks. */
class Biquad {
	private x1 = 0;
	private x2 = 0;
	private y1 = 0;
	private y2 = 0;
	private readonly b0: number;
	private readonly b1: number;
	private readonly b2: number;
	private readonly a1: number;
	private readonly a2: number;

	constructor(sampleRate: number, cutoff: number) {
		const w0 = (2 * Math.PI * cutoff) / sampleRate;
		const alpha = Math.sin(w0) / (2 * Math.SQRT1_2);
		const cos = Math.cos(w0);
		const a0 = 1 + alpha;
		this.b0 = (1 - cos) / 2 / a0;
		this.b1 = (1 - cos) / a0;
		this.b2 = (1 - cos) / 2 / a0;
		this.a1 = (-2 * cos) / a0;
		this.a2 = (1 - alpha) / a0;
	}

	process(samples: Float32Array): void {
		for (let i = 0; i < samples.length; i += 1) {
			const x = samples[i];
			const y =
				this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
			this.x2 = this.x1;
			this.x1 = x;
			this.y2 = this.y1;
			this.y1 = y;
			samples[i] = y;
		}
	}
}

/**
 * Streams mono audio down to 16 kHz as it is decoded: a 4th-order low-pass keeps
 * frequencies above the new Nyquist from folding into speech, then linear
 * interpolation picks the output samples. State carries over between chunks.
 */
export class Resampler16k {
	private readonly step: number;
	private readonly filters: Biquad[];
	/** Position of the next output sample, relative to the start of the next chunk. */
	private position = 0;
	private previous = 0;

	constructor(private readonly fromRate: number) {
		this.step = fromRate / TARGET_RATE;
		const cutoff = TARGET_RATE * 0.45;
		this.filters =
			fromRate > TARGET_RATE ? [new Biquad(fromRate, cutoff), new Biquad(fromRate, cutoff)] : [];
	}

	push(chunk: Float32Array): Float32Array {
		if (this.fromRate === TARGET_RATE) return chunk;
		const samples = Float32Array.from(chunk);
		for (const filter of this.filters) filter.process(samples);
		const length = samples.length;
		if (length === 0) return samples;
		const count = Math.max(0, Math.ceil((length - 1 - this.position) / this.step));
		const out = new Float32Array(count);
		let at = this.position;
		for (let k = 0; k < count; k += 1) {
			const index = Math.floor(at);
			const fraction = at - index;
			const a = index < 0 ? this.previous : samples[index];
			const b = samples[index + 1];
			out[k] = a + (b - a) * fraction;
			at += this.step;
		}
		this.position = at - length;
		this.previous = samples[length - 1];
		return out;
	}
}

function downmix(sample: AudioSample): Float32Array {
	const frames = sample.numberOfFrames;
	const channels = Math.max(1, sample.numberOfChannels);
	const mono = new Float32Array(frames);
	const plane = new Float32Array(frames);
	for (let channel = 0; channel < channels; channel += 1) {
		sample.copyTo(plane, { planeIndex: channel, format: "f32-planar" });
		for (let i = 0; i < frames; i += 1) mono[i] += plane[i] / channels;
	}
	return mono;
}

export const NO_AUDIO_MESSAGE = "This recording has no sound to transcribe.";

/**
 * Decodes a recording's sound as 16 kHz mono, a decoded packet at a time, reading the
 * file through the main process in chunks — so an hour-long meeting never has to fit
 * in memory.
 */
export async function* decodeSpeechAudio(
	filePath: string,
	onDuration?: (seconds: number) => void,
): AsyncGenerator<Float32Array> {
	const info = await window.electronAPI.getReadableFileInfo(filePath);
	if (!info.success || typeof info.size !== "number" || info.size <= 0) {
		throw new Error(info.message ?? "Could not read the recording.");
	}
	const input = new Input({
		source: createRecordingSource(filePath, info.size),
		formats: ALL_FORMATS,
	});
	try {
		const track = await input.getPrimaryAudioTrack();
		if (!track) throw new Error(NO_AUDIO_MESSAGE);
		onDuration?.(await input.computeDuration());
		let resampler: Resampler16k | null = null;
		for await (const sample of new AudioSampleSink(track).samples()) {
			try {
				resampler ??= new Resampler16k(sample.sampleRate);
				yield resampler.push(downmix(sample));
			} finally {
				sample.close();
			}
		}
	} finally {
		input.dispose();
	}
}

/** Transcribes a recording on disk into timed segments. */
export function transcribeVideoFile(
	filePath: string,
	options: TranscribeOptions = {},
): Promise<CaptionSegment[]> {
	const settings: TranscribeOptions = { ...options };
	return transcribeStream(
		decodeSpeechAudio(filePath, (seconds) => {
			settings.durationSec = seconds;
		}),
		settings,
	);
}
