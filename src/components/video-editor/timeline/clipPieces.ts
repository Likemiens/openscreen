/**
 * The clip track shows the video as one bar that can be cut into pieces. A piece is
 * either kept or removed; a removed piece is an ordinary trim region, which is what
 * playback and export already skip. Split points only say where the kept video is
 * divided, so that a part of it can be picked and removed.
 */

export interface ClipPiece {
	start: number;
	end: number;
	/** The trim region that cuts this piece out, or `null` while the piece is kept. */
	trimId: string | null;
}

interface TrimSpan {
	id: string;
	startMs: number;
	endMs: number;
}

/** Split points as stored: whole milliseconds, ascending, no duplicates. */
export function normalizeClipSplits(value: unknown): number[] {
	if (!Array.isArray(value)) return [];
	const points = value
		.filter((point): point is number => typeof point === "number" && Number.isFinite(point))
		.map((point) => Math.round(point))
		.filter((point) => point > 0);
	return [...new Set(points)].sort((a, b) => a - b);
}

/**
 * Every piece of the clip in order: the removed ones (one per trim region) and the kept
 * video between them, divided at the split points.
 */
export function computeClipPieces(
	totalMs: number,
	splits: readonly number[],
	trims: readonly TrimSpan[],
): ClipPiece[] {
	if (!(totalMs > 0)) return [];
	const pieces: ClipPiece[] = [];
	const points = normalizeClipSplits(splits);

	const pushKept = (from: number, to: number) => {
		let start = from;
		for (const point of points) {
			if (point <= start || point >= to) continue;
			pieces.push({ start, end: point, trimId: null });
			start = point;
		}
		if (to > start) pieces.push({ start, end: to, trimId: null });
	};

	const removed = trims
		.map((trim) => ({
			id: trim.id,
			start: Math.max(0, Math.min(trim.startMs, totalMs)),
			end: Math.max(0, Math.min(trim.endMs, totalMs)),
		}))
		.filter((trim) => trim.end > trim.start)
		.sort((a, b) => a.start - b.start);

	let cursor = 0;
	for (const trim of removed) {
		// Trim regions are kept apart by the timeline; an overlap is clipped, not drawn twice.
		const start = Math.max(trim.start, cursor);
		if (trim.end <= start) continue;
		pushKept(cursor, start);
		pieces.push({ start, end: trim.end, trimId: trim.id });
		cursor = trim.end;
	}
	pushKept(cursor, totalMs);
	return pieces;
}

/**
 * Cuts `span` out of the video. A removed part that touches it grows to include it, so
 * neighbouring cuts read as one block and no sliver of a region is left behind; only a
 * cut that stands alone becomes a new region, with `newId`.
 */
export function removeClipSpan<T extends TrimSpan>(
	trims: readonly T[],
	span: { start: number; end: number },
	newId: string,
): Array<T | TrimSpan> {
	const start = Math.round(Math.min(span.start, span.end));
	const end = Math.round(Math.max(span.start, span.end));
	if (end <= start) return [...trims];

	const touching = trims.filter((trim) => trim.endMs >= start && trim.startMs <= end);
	if (touching.length === 0) return [...trims, { id: newId, startMs: start, endMs: end }];

	const [first] = [...touching].sort((a, b) => a.startMs - b.startMs);
	const merged = {
		...first,
		startMs: Math.min(start, ...touching.map((trim) => trim.startMs)),
		endMs: Math.max(end, ...touching.map((trim) => trim.endMs)),
	};
	return trims
		.filter((trim) => trim === first || !touching.includes(trim))
		.map((trim) => (trim === first ? merged : trim));
}

/** The piece under `timeMs`. The very end of the clip belongs to the last piece. */
export function findClipPieceAt(pieces: readonly ClipPiece[], timeMs: number): ClipPiece | null {
	for (const piece of pieces) {
		if (timeMs >= piece.start && timeMs < piece.end) return piece;
	}
	const last = pieces.at(-1);
	return last && timeMs === last.end ? last : null;
}

export type ClipSplitProblem = "outside" | "removed" | "too-close";

/**
 * Why the clip cannot be split at `timeMs`, or `null` when it can. Both halves must be
 * at least `minPieceMs` long, so a piece never becomes too small to grab.
 */
export function getClipSplitProblem(
	pieces: readonly ClipPiece[],
	timeMs: number,
	minPieceMs: number,
): ClipSplitProblem | null {
	const piece = findClipPieceAt(pieces, timeMs);
	if (!piece) return "outside";
	if (piece.trimId) return "removed";
	if (timeMs - piece.start < minPieceMs || piece.end - timeMs < minPieceMs) return "too-close";
	return null;
}

export function addClipSplit(splits: readonly number[], timeMs: number): number[] {
	return normalizeClipSplits([...splits, timeMs]);
}

/** Whether two pieces are the same stretch of the clip. */
export function isSameClipPiece(
	a: Pick<ClipPiece, "start" | "end"> | null,
	b: Pick<ClipPiece, "start" | "end"> | null,
): boolean {
	return Boolean(a && b && a.start === b.start && a.end === b.end);
}

/** Length of the video once the removed pieces are gone. */
export function getKeptDurationMs(pieces: readonly ClipPiece[]): number {
	return pieces.reduce(
		(total, piece) => (piece.trimId ? total : total + piece.end - piece.start),
		0,
	);
}
