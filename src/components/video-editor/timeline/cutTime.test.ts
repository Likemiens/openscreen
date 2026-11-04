import { describe, expect, it } from "vitest";
import {
	buildCutTimeMap,
	getCutMarks,
	toCutMs,
	toCutSpan,
	toCutSplits,
	toSourceMs,
	toSourceSpan,
	toSourceSplits,
} from "./cutTime";

// A 30 s recording with 8–10 s and 20–25 s removed: 23 s on the timeline.
const MAP = buildCutTimeMap(30_000, [
	{ id: "b", startMs: 20_000, endMs: 25_000 },
	{ id: "a", startMs: 8_000, endMs: 10_000 },
]);

describe("buildCutTimeMap", () => {
	it("orders and merges the removed parts and gives the edited length", () => {
		const map = buildCutTimeMap(10_000, [
			{ id: "x", startMs: 2_000, endMs: 4_000 },
			{ id: "y", startMs: 4_000, endMs: 5_000 },
			{ id: "z", startMs: 9_000, endMs: 12_000 },
		]);
		expect(map.removed).toEqual([
			{ start: 2_000, end: 5_000, trimIds: ["x", "y"] },
			{ start: 9_000, end: 10_000, trimIds: ["z"] },
		]);
		expect(map.cutDurationMs).toBe(6_000);
		expect(MAP.cutDurationMs).toBe(23_000);
	});
});

describe("toCutMs / toSourceMs", () => {
	it("moves what follows a removed part up by its length", () => {
		expect(toCutMs(MAP, 5_000)).toBe(5_000);
		expect(toCutMs(MAP, 12_000)).toBe(10_000);
		expect(toCutMs(MAP, 30_000)).toBe(23_000);
		expect(toSourceMs(MAP, 10_000)).toBe(12_000);
		expect(toSourceMs(MAP, 23_000)).toBe(30_000);
	});

	it("puts a moment inside a removed part at the cut", () => {
		expect(toCutMs(MAP, 9_000)).toBe(8_000);
		expect(toCutMs(MAP, 22_000)).toBe(18_000);
	});

	it("starts after a cut and ends before it", () => {
		expect(toSourceMs(MAP, 8_000, "start")).toBe(10_000);
		expect(toSourceMs(MAP, 8_000, "end")).toBe(8_000);
		expect(toSourceMs(MAP, 18_000, "start")).toBe(25_000);
	});

	it("round-trips every kept moment", () => {
		for (const sourceMs of [0, 7_999, 10_000, 15_000, 19_999, 25_000, 29_000]) {
			expect(toSourceMs(MAP, toCutMs(MAP, sourceMs))).toBe(sourceMs);
		}
	});

	it("handles the start of the recording being cut", () => {
		const map = buildCutTimeMap(10_000, [{ id: "head", startMs: 0, endMs: 3_000 }]);
		expect(toCutMs(map, 1_000)).toBe(0);
		expect(toSourceMs(map, 0)).toBe(3_000);
	});
});

describe("spans", () => {
	it("shortens a span across a cut and hides one that was cut out", () => {
		expect(toCutSpan(MAP, { start: 5_000, end: 15_000 })).toEqual({ start: 5_000, end: 13_000 });
		expect(toCutSpan(MAP, { start: 8_500, end: 9_500 })).toBeNull();
	});

	it("maps an edited span back without growing into the cut", () => {
		expect(toSourceSpan(MAP, { start: 5_000, end: 8_000 })).toEqual({ start: 5_000, end: 8_000 });
		expect(toSourceSpan(MAP, { start: 8_000, end: 13_000 })).toEqual({
			start: 10_000,
			end: 15_000,
		});
		expect(
			toSourceSpan(MAP, toCutSpan(MAP, { start: 5_000, end: 15_000 }) ?? { start: 0, end: 0 }),
		).toEqual({
			start: 5_000,
			end: 15_000,
		});
	});
});

describe("cut marks and splits", () => {
	it("marks where each removed part was", () => {
		expect(getCutMarks(MAP)).toEqual([
			{ id: "a", atMs: 8_000, trimIds: ["a"] },
			{ id: "b", atMs: 18_000, trimIds: ["b"] },
		]);
	});

	it("divides the clip at its cuts and keeps the splits", () => {
		expect(toCutSplits(MAP, [4_000, 12_000, 9_000])).toEqual([4_000, 8_000, 10_000, 18_000]);
	});

	it("stores splits back in the recording's time, without the cuts", () => {
		expect(toSourceSplits(MAP, [4_000, 8_000, 10_000, 18_000, 20_000], [9_000, 4_000])).toEqual([
			4_000, 9_000, 12_000, 27_000,
		]);
	});
});
