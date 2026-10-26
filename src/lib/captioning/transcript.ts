import type { CaptionSegment } from "./transcribe";

/**
 * Turning raw Whisper segments into a transcript people can use: cleaned of the
 * model's known failure modes, then written as plain text and as SRT subtitles.
 * Pure functions, so they unit-test without a model.
 */

const SAMPLE_RATE = 16_000;
/** Below this RMS a stretch of 16 kHz audio is treated as silence. */
const SILENCE_RMS = 0.006;

function rms(samples: Float32Array, start: number, end: number): number {
	const from = Math.max(0, Math.floor(start));
	const to = Math.min(samples.length, Math.ceil(end));
	if (to <= from) return 0;
	let sum = 0;
	for (let i = from; i < to; i += 1) sum += samples[i] * samples[i];
	return Math.sqrt(sum / (to - from));
}

/** True when `samples[start..end)` holds no speech worth transcribing. */
export function isSilent(samples: Float32Array, start = 0, end = samples.length): boolean {
	// Judge by the loudest short window, so a few words in a long quiet stretch count.
	const window = SAMPLE_RATE / 4;
	for (let at = start; at < end; at += window) {
		if (rms(samples, at, Math.min(end, at + window)) >= SILENCE_RMS) return false;
	}
	return true;
}

/**
 * The quietest point between `from` and `to` (sample indexes): where a long recording
 * is cut into blocks, so no word is split between two of them.
 */
export function findQuietCut(samples: Float32Array, from: number, to: number): number {
	const window = Math.round(SAMPLE_RATE * 0.3);
	const step = Math.round(SAMPLE_RATE * 0.05);
	let best = to;
	let bestLevel = Number.POSITIVE_INFINITY;
	for (let at = Math.max(0, from); at + window <= Math.min(to, samples.length); at += step) {
		const level = rms(samples, at, at + window);
		if (level < bestLevel) {
			bestLevel = level;
			best = at + Math.round(window / 2);
		}
	}
	return best;
}

function normalize(text: string): string {
	return text
		.toLowerCase()
		.replace(/ё/g, "е")
		.replace(/[^\p{L}\p{N}\s]/gu, "")
		.replace(/\s+/g, " ")
		.trim();
}

/**
 * Whisper sometimes gets stuck repeating a phrase ("in principle, in principle, ...").
 * Keeps one copy of any run of 1–8 words repeated more than twice in a row.
 */
export function collapseRepeats(text: string): string {
	const words = text.split(/\s+/).filter(Boolean);
	const out: string[] = [];
	let i = 0;
	while (i < words.length) {
		let collapsed = false;
		for (let size = 1; size <= 8 && i + size * 3 <= words.length; size += 1) {
			const unit = normalize(words.slice(i, i + size).join(" "));
			if (!unit) continue;
			let repeats = 1;
			while (
				i + (repeats + 1) * size <= words.length &&
				normalize(words.slice(i + repeats * size, i + (repeats + 1) * size).join(" ")) === unit
			) {
				repeats += 1;
			}
			if (repeats >= 3) {
				out.push(...words.slice(i, i + size));
				i += repeats * size;
				collapsed = true;
				break;
			}
		}
		if (!collapsed) {
			out.push(words[i]);
			i += 1;
		}
	}
	return out.join(" ");
}

/**
 * Cleans raw segments: drops empty ones and anything "heard" over silence (Whisper
 * invents credits and sign-offs there), collapses repetition loops, and merges a
 * phrase repeated across consecutive segments. `audio` is the 16 kHz audio the
 * segment times refer to; without it the silence check is skipped.
 */
export function cleanSegments(
	segments: CaptionSegment[],
	audio?: { samples: Float32Array; offsetSec: number },
): CaptionSegment[] {
	const out: CaptionSegment[] = [];
	for (const segment of [...segments].sort((a, b) => a.startSec - b.startSec)) {
		const text = collapseRepeats(segment.text.replace(/\s+/g, " ").trim());
		if (!normalize(text)) continue;
		if (audio) {
			const start = (segment.startSec - audio.offsetSec) * SAMPLE_RATE;
			const end = (segment.endSec - audio.offsetSec) * SAMPLE_RATE;
			if (end > start && isSilent(audio.samples, start, end)) continue;
		}
		const previous = out[out.length - 1];
		if (previous && normalize(previous.text) === normalize(text)) {
			previous.endSec = Math.max(previous.endSec, segment.endSec);
			continue;
		}
		out.push({
			startSec: segment.startSec,
			endSec: Math.max(segment.endSec, segment.startSec),
			text,
		});
	}
	return out;
}

function pad(value: number, size = 2): string {
	return String(value).padStart(size, "0");
}

/** `01:02:03,456` (SRT) or `1:02:03` / `02:03` (readable). */
export function formatTimestamp(seconds: number, style: "srt" | "short"): string {
	const totalMs = Math.max(0, Math.round(seconds * 1000));
	const h = Math.floor(totalMs / 3_600_000);
	const m = Math.floor((totalMs % 3_600_000) / 60_000);
	const s = Math.floor((totalMs % 60_000) / 1000);
	const ms = totalMs % 1000;
	if (style === "srt") return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
	return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Subtitle convention: lines of at most 42 characters, at most two lines on screen. */
const MAX_LINE_CHARS = 42;
const MAX_CUE_LINES = 2;

/** Greedy word wrap; a single word longer than a line gets a line of its own. */
function wrapLines(text: string): string[] {
	const lines: string[] = [];
	let current = "";
	for (const word of text.split(" ").filter(Boolean)) {
		if (current && `${current} ${word}`.length > MAX_LINE_CHARS) {
			lines.push(current);
			current = word;
		} else {
			current = current ? `${current} ${word}` : word;
		}
	}
	if (current) lines.push(current);
	return lines;
}

/**
 * Lays a caption out as subtitle cues of up to two lines each; a caption too long for
 * one cue is shown over several, each on screen for its share of the words.
 */
function splitCue(segment: CaptionSegment): CaptionSegment[] {
	const lines = wrapLines(segment.text);
	const cues: string[] = [];
	for (let i = 0; i < lines.length; i += MAX_CUE_LINES) {
		cues.push(lines.slice(i, i + MAX_CUE_LINES).join("\n"));
	}
	if (cues.length <= 1) return [{ ...segment, text: cues[0] ?? segment.text }];
	const total = cues.reduce((sum, cue) => sum + cue.length, 0);
	const span = segment.endSec - segment.startSec;
	let at = segment.startSec;
	return cues.map((text, index) => {
		const end = index === cues.length - 1 ? segment.endSec : at + (span * text.length) / total;
		const cue = { startSec: at, endSec: end, text };
		at = end;
		return cue;
	});
}

/** SubRip subtitles; players pick up `<video name>.srt` next to the video by themselves. */
export function formatSrt(segments: CaptionSegment[]): string {
	return segments
		.flatMap(splitCue)
		.map(
			(cue, index) =>
				`${index + 1}\n${formatTimestamp(cue.startSec, "srt")} --> ${formatTimestamp(
					Math.max(cue.endSec, cue.startSec + 0.3),
					"srt",
				)}\n${cue.text}\n`,
		)
		.join("\n");
}

/** A pause this long starts a new paragraph in the text transcript. */
const PARAGRAPH_GAP_SEC = 2.5;
/** A paragraph this long ends at the next full stop, so the text stays readable. */
const PARAGRAPH_SOFT_CHARS = 450;

/** The transcript as text: paragraphs split at pauses, each opened with its time. */
export function formatTranscriptText(segments: CaptionSegment[]): string {
	const paragraphs: string[] = [];
	let current: { start: number; end: number; parts: string[]; length: number } | null = null;
	for (const segment of segments) {
		const sentenceEnded = /[.!?…]["»”)]?$/.test(current?.parts.at(-1) ?? "");
		if (
			!current ||
			segment.startSec - current.end >= PARAGRAPH_GAP_SEC ||
			(current.length >= PARAGRAPH_SOFT_CHARS && sentenceEnded)
		) {
			if (current)
				paragraphs.push(`[${formatTimestamp(current.start, "short")}] ${current.parts.join(" ")}`);
			current = { start: segment.startSec, end: segment.endSec, parts: [], length: 0 };
		}
		current.parts.push(segment.text);
		current.length += segment.text.length + 1;
		current.end = segment.endSec;
	}
	if (current)
		paragraphs.push(`[${formatTimestamp(current.start, "short")}] ${current.parts.join(" ")}`);
	return paragraphs.join("\n\n");
}
