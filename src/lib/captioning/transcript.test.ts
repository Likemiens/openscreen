import { describe, expect, it } from "vitest";
import {
	cleanSegments,
	collapseRepeats,
	findQuietCut,
	formatSrt,
	formatTimestamp,
	formatTranscriptText,
	isSilent,
} from "./transcript";

const RATE = 16_000;

function tone(seconds: number, amplitude: number): Float32Array {
	const out = new Float32Array(Math.round(seconds * RATE));
	for (let i = 0; i < out.length; i += 1)
		out[i] = amplitude * Math.sin((2 * Math.PI * 220 * i) / RATE);
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

describe("collapseRepeats", () => {
	it("keeps one copy of a phrase Whisper got stuck on", () => {
		expect(collapseRepeats("и в принципе, в принципе, в принципе, в принципе, всё")).toBe(
			"и в принципе, всё",
		);
		expect(collapseRepeats("ок ок ок ок")).toBe("ок");
	});

	it("leaves ordinary text and a single repeat alone", () => {
		const text = "Мы выпустили новую версию, новую версию приложения.";
		expect(collapseRepeats(text)).toBe(text);
	});
});

describe("isSilent / findQuietCut", () => {
	it("tells silence from speech, even a short burst in a long quiet stretch", () => {
		expect(isSilent(new Float32Array(RATE * 3))).toBe(true);
		expect(isSilent(concat(new Float32Array(RATE * 3), tone(0.4, 0.2)))).toBe(false);
	});

	it("cuts long audio at its quietest point", () => {
		const audio = concat(tone(2, 0.3), new Float32Array(RATE), tone(2, 0.3));
		const cut = findQuietCut(audio, 0, audio.length);
		expect(cut / RATE).toBeGreaterThan(2);
		expect(cut / RATE).toBeLessThan(3);
	});
});

describe("cleanSegments", () => {
	it("drops what was 'heard' over silence and merges a repeated phrase", () => {
		const samples = concat(tone(2, 0.3), new Float32Array(RATE * 4));
		const cleaned = cleanSegments(
			[
				{ startSec: 10, endSec: 11, text: " Добрый день. " },
				{ startSec: 11, endSec: 12, text: "Добрый день" },
				{ startSec: 13, endSec: 15, text: "Продолжение следует..." },
				{ startSec: 15, endSec: 15.5, text: " ... " },
			],
			{ samples, offsetSec: 10 },
		);
		expect(cleaned).toEqual([{ startSec: 10, endSec: 12, text: "Добрый день." }]);
	});
});

describe("formatTimestamp", () => {
	it("writes SRT and short times", () => {
		expect(formatTimestamp(3723.4567, "srt")).toBe("01:02:03,457");
		expect(formatTimestamp(83.2, "short")).toBe("01:23");
		expect(formatTimestamp(3723, "short")).toBe("1:02:03");
	});
});

describe("formatSrt", () => {
	it("numbers cues and keeps each to two lines of at most 42 characters", () => {
		const long = "слово ".repeat(40).trim();
		const srt = formatSrt([
			{ startSec: 0, endSec: 1.5, text: "Коллеги, добрый день." },
			{ startSec: 2, endSec: 10, text: long },
		]);
		const cues = srt.trim().split(/\n\n/);
		expect(cues[0]).toBe("1\n00:00:00,000 --> 00:00:01,500\nКоллеги, добрый день.");
		expect(cues.length).toBeGreaterThan(2);
		for (const cue of cues) {
			const lines = cue.split("\n").slice(2);
			expect(lines.length).toBeLessThanOrEqual(2);
			for (const line of lines) expect(line.length).toBeLessThanOrEqual(42);
		}
		expect(cues.at(-1)).toContain("--> 00:00:10,000");
	});

	it("wraps a caption that fits one cue onto two lines", () => {
		const srt = formatSrt([
			{ startSec: 0, endSec: 4, text: "Мы выпустили новую версию приложения для записи экрана." },
		]);
		expect(srt).toBe(
			"1\n00:00:00,000 --> 00:00:04,000\nМы выпустили новую версию приложения для\nзаписи экрана.\n",
		);
	});
});

describe("formatTranscriptText", () => {
	it("starts a timed paragraph after each pause", () => {
		const text = formatTranscriptText([
			{ startSec: 1, endSec: 3, text: "Коллеги, добрый день." },
			{ startSec: 3.2, endSec: 5, text: "Начнём с итогов." },
			{ startSec: 70, endSec: 72, text: "Второй вопрос." },
		]);
		expect(text).toBe("[00:01] Коллеги, добрый день. Начнём с итогов.\n\n[01:10] Второй вопрос.");
	});

	it("ends a long paragraph at a full stop even without a pause", () => {
		const sentence = "Это довольно длинное предложение о том, что мы сделали за неделю.";
		const segments = Array.from({ length: 12 }, (_, i) => ({
			startSec: i * 5,
			endSec: i * 5 + 4.5,
			text: sentence,
		}));
		const paragraphs = formatTranscriptText(segments).split("\n\n");
		expect(paragraphs.length).toBeGreaterThan(1);
		expect(paragraphs[1]).toMatch(/^\[00:\d\d\] Это/);
	});
});
