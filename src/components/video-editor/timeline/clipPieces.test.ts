import { describe, expect, it } from "vitest";
import {
	addClipSplit,
	computeClipPieces,
	findClipPieceAt,
	getClipSplitProblem,
	getKeptDurationMs,
	isSameClipPiece,
	normalizeClipSplits,
	removeClipSpan,
} from "./clipPieces";

const trim = (id: string, startMs: number, endMs: number) => ({ id, startMs, endMs });

describe("normalizeClipSplits", () => {
	it("keeps whole, positive, ascending, unique times", () => {
		expect(normalizeClipSplits([900, 300.4, 300, 0, -20, Number.NaN, "5", null])).toEqual([
			300, 900,
		]);
	});

	it("treats anything that is not a list as no splits", () => {
		expect(normalizeClipSplits(undefined)).toEqual([]);
		expect(normalizeClipSplits({ 0: 100 })).toEqual([]);
	});
});

describe("computeClipPieces", () => {
	it("is one piece until the clip is split", () => {
		expect(computeClipPieces(2000, [], [])).toEqual([{ start: 0, end: 2000, trimId: null }]);
	});

	it("has nothing to show before the video's length is known", () => {
		expect(computeClipPieces(0, [500], [])).toEqual([]);
	});

	it("divides the clip at each split", () => {
		expect(computeClipPieces(2000, [1500, 500], [])).toEqual([
			{ start: 0, end: 500, trimId: null },
			{ start: 500, end: 1500, trimId: null },
			{ start: 1500, end: 2000, trimId: null },
		]);
	});

	it("ignores splits at or beyond the ends of the clip", () => {
		expect(computeClipPieces(2000, [2000, 5000], [])).toHaveLength(1);
	});

	it("shows a removed part as one piece, whatever splits fall inside it", () => {
		expect(computeClipPieces(2000, [500, 800, 1500], [trim("cut", 500, 1500)])).toEqual([
			{ start: 0, end: 500, trimId: null },
			{ start: 500, end: 1500, trimId: "cut" },
			{ start: 1500, end: 2000, trimId: null },
		]);
	});

	it("handles a clip trimmed at both ends", () => {
		const pieces = computeClipPieces(2000, [], [trim("tail", 1800, 2000), trim("head", 0, 200)]);
		expect(pieces).toEqual([
			{ start: 0, end: 200, trimId: "head" },
			{ start: 200, end: 1800, trimId: null },
			{ start: 1800, end: 2000, trimId: "tail" },
		]);
	});

	it("clips removed parts to the video and never draws an overlap twice", () => {
		const pieces = computeClipPieces(1000, [], [trim("a", 100, 600), trim("b", 400, 5000)]);
		expect(pieces).toEqual([
			{ start: 0, end: 100, trimId: null },
			{ start: 100, end: 600, trimId: "a" },
			{ start: 600, end: 1000, trimId: "b" },
		]);
		// Every millisecond belongs to exactly one piece.
		expect(pieces.reduce((total, piece) => total + piece.end - piece.start, 0)).toBe(1000);
	});
});

describe("findClipPieceAt", () => {
	const pieces = computeClipPieces(2000, [500], [trim("cut", 1000, 1500)]);

	it("finds the piece under a time; a boundary belongs to the piece that starts there", () => {
		expect(findClipPieceAt(pieces, 0)).toMatchObject({ start: 0, end: 500 });
		expect(findClipPieceAt(pieces, 500)).toMatchObject({ start: 500, end: 1000 });
		expect(findClipPieceAt(pieces, 1200)).toMatchObject({ trimId: "cut" });
	});

	it("gives the very end of the clip to the last piece", () => {
		expect(findClipPieceAt(pieces, 2000)).toMatchObject({ start: 1500, end: 2000 });
		expect(findClipPieceAt(pieces, 2001)).toBeNull();
		expect(findClipPieceAt(pieces, -1)).toBeNull();
	});
});

describe("getClipSplitProblem", () => {
	const pieces = computeClipPieces(2000, [500], [trim("cut", 1000, 1500)]);

	it("allows a split in the middle of kept video", () => {
		expect(getClipSplitProblem(pieces, 250, 100)).toBeNull();
		expect(getClipSplitProblem(pieces, 1750, 100)).toBeNull();
	});

	it("refuses to split a part that is already removed", () => {
		expect(getClipSplitProblem(pieces, 1200, 100)).toBe("removed");
	});

	it("refuses to leave a piece too short to grab", () => {
		expect(getClipSplitProblem(pieces, 50, 100)).toBe("too-close");
		expect(getClipSplitProblem(pieces, 450, 100)).toBe("too-close");
		expect(getClipSplitProblem(pieces, 500, 100)).toBe("too-close");
		expect(getClipSplitProblem(pieces, 100, 100)).toBeNull();
	});

	it("refuses a time outside the clip", () => {
		expect(getClipSplitProblem(pieces, 9000, 100)).toBe("outside");
	});
});

describe("splitting and removing", () => {
	it("cuts a section out of the middle: split twice, remove what is between", () => {
		let splits: number[] = [];
		splits = addClipSplit(splits, 1200);
		splits = addClipSplit(splits, 400);
		expect(splits).toEqual([400, 1200]);

		const before = computeClipPieces(2000, splits, []);
		const middle = before[1];
		expect(middle).toEqual({ start: 400, end: 1200, trimId: null });

		const after = computeClipPieces(2000, splits, [trim("cut", middle.start, middle.end)]);
		expect(after.map((piece) => Boolean(piece.trimId))).toEqual([false, true, false]);
		expect(getKeptDurationMs(after)).toBe(1200);

		// Restoring it (dropping the trim) brings the three pieces back.
		expect(computeClipPieces(2000, splits, [])).toEqual(before);
	});

	it("does not add the same split twice", () => {
		expect(addClipSplit([400], 400)).toEqual([400]);
	});
});

describe("removeClipSpan", () => {
	it("adds a region for a cut that stands alone", () => {
		expect(removeClipSpan([trim("a", 0, 100)], { start: 400.4, end: 900 }, "new")).toEqual([
			trim("a", 0, 100),
			trim("new", 400, 900),
		]);
	});

	it("grows the removed part it touches instead of adding a second region", () => {
		expect(removeClipSpan([trim("a", 0, 400)], { start: 400, end: 900 }, "new")).toEqual([
			trim("a", 0, 900),
		]);
		expect(removeClipSpan([trim("b", 900, 1200)], { start: 400, end: 900 }, "new")).toEqual([
			trim("b", 400, 1200),
		]);
	});

	it("joins the removed parts on both sides into one", () => {
		const result = removeClipSpan(
			[trim("late", 900, 1200), trim("far", 1800, 2000), trim("early", 0, 400)],
			{ start: 400, end: 900 },
			"new",
		);
		expect(result).toEqual([trim("far", 1800, 2000), trim("early", 0, 1200)]);
	});

	it("swallows a sliver left between a removed part and the cut", () => {
		// A 50 ms sliver kept after dragging a removed part's edge: removing it leaves no
		// region shorter than the timeline's minimum.
		const result = removeClipSpan([trim("a", 0, 450)], { start: 450, end: 500 }, "new");
		expect(result).toEqual([trim("a", 0, 500)]);
	});

	it("keeps whatever else a region carries, and ignores an empty span", () => {
		const regions = [{ id: "a", startMs: 0, endMs: 400, note: "kept" }];
		expect(removeClipSpan(regions, { start: 400, end: 600 }, "new")).toEqual([
			{ id: "a", startMs: 0, endMs: 600, note: "kept" },
		]);
		expect(removeClipSpan(regions, { start: 700, end: 700 }, "new")).toEqual(regions);
	});
});

describe("isSameClipPiece", () => {
	it("compares pieces by the stretch of video they cover", () => {
		expect(isSameClipPiece({ start: 0, end: 5 }, { start: 0, end: 5 })).toBe(true);
		expect(isSameClipPiece({ start: 0, end: 5 }, { start: 0, end: 6 })).toBe(false);
		expect(isSameClipPiece(null, { start: 0, end: 5 })).toBe(false);
	});
});
