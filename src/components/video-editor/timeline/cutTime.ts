/**
 * The timeline shows the video as edited, the way other editors do: a removed part takes no
 * room and what follows it moves up. Everything stays stored in the recording's own
 * ("source") time — trims, zooms, captions — so playback and export are unchanged; these
 * map between that and the "cut" time the timeline and the player show.
 */

export interface TimeSpan {
	start: number;
	end: number;
}

interface TrimLike {
	id: string;
	startMs: number;
	endMs: number;
}

/** A removed part of the recording: where it was cut out, and the trims that remove it. */
export interface RemovedPart extends TimeSpan {
	trimIds: string[];
}

export interface CutTimeMap {
	/** Removed parts of the source, merged and in order, in ms. */
	removed: readonly RemovedPart[];
	sourceDurationMs: number;
	cutDurationMs: number;
}

/** The point on the timeline where a removed part used to be. */
export interface CutMark {
	id: string;
	atMs: number;
	trimIds: string[];
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function buildCutTimeMap(sourceDurationMs: number, trims: readonly TrimLike[]): CutTimeMap {
	const total = Math.max(0, sourceDurationMs);
	const parts = trims
		.map((trim) => ({
			start: clamp(Math.min(trim.startMs, trim.endMs), 0, total),
			end: clamp(Math.max(trim.startMs, trim.endMs), 0, total),
			trimIds: [trim.id],
		}))
		.filter((part) => part.end > part.start)
		.sort((a, b) => a.start - b.start);

	const removed: RemovedPart[] = [];
	for (const part of parts) {
		const last = removed.at(-1);
		if (last && part.start <= last.end) {
			last.end = Math.max(last.end, part.end);
			last.trimIds.push(...part.trimIds);
		} else {
			removed.push({ ...part, trimIds: [...part.trimIds] });
		}
	}
	const removedMs = removed.reduce((sum, part) => sum + part.end - part.start, 0);
	return { removed, sourceDurationMs: total, cutDurationMs: total - removedMs };
}

/** Where a moment of the recording is on the timeline; inside a removed part, at the cut. */
export function toCutMs(map: CutTimeMap, sourceMs: number): number {
	let removedBefore = 0;
	for (const part of map.removed) {
		if (sourceMs >= part.end) {
			removedBefore += part.end - part.start;
		} else {
			if (sourceMs > part.start) return part.start - removedBefore;
			break;
		}
	}
	return clamp(sourceMs - removedBefore, 0, map.cutDurationMs);
}

/**
 * The moment of the recording at a point of the timeline. At a cut both sides meet: what
 * starts there starts after the removed part, what ends there ends before it.
 */
export function toSourceMs(
	map: CutTimeMap,
	cutMs: number,
	side: "start" | "end" = "start",
): number {
	let sourceMs = clamp(cutMs, 0, map.cutDurationMs);
	for (const part of map.removed) {
		if (sourceMs > part.start || (side === "start" && sourceMs === part.start)) {
			sourceMs += part.end - part.start;
		} else {
			break;
		}
	}
	return sourceMs;
}

/** A span of the recording on the timeline, or null when all of it was cut out. */
export function toCutSpan(map: CutTimeMap, span: TimeSpan): TimeSpan | null {
	const start = toCutMs(map, span.start);
	const end = toCutMs(map, span.end);
	return end > start ? { start, end } : null;
}

export function toSourceSpan(map: CutTimeMap, span: TimeSpan): TimeSpan {
	const start = toSourceMs(map, span.start, "start");
	return { start, end: Math.max(start, toSourceMs(map, span.end, "end")) };
}

/** Where the removed parts were cut out, on the timeline. */
export function getCutMarks(map: CutTimeMap): CutMark[] {
	return map.removed.map((part) => ({
		id: part.trimIds.join("+"),
		atMs: toCutMs(map, part.start),
		trimIds: part.trimIds,
	}));
}

/**
 * Split points as the timeline shows them. A cut also divides the clip, so the pieces either
 * side of it stay separate, as clips do in other editors.
 */
export function toCutSplits(map: CutTimeMap, sourceSplits: readonly number[]): number[] {
	const points = [
		...sourceSplits.map((point) => toCutMs(map, point)),
		...getCutMarks(map).map((mark) => mark.atMs),
	].filter((point) => point > 0 && point < map.cutDurationMs);
	return [...new Set(points.map((point) => Math.round(point)))].sort((a, b) => a - b);
}

/**
 * Split points from the timeline back in the recording's time. Points at a cut are the cut
 * itself and are not stored; splits inside removed parts are kept for when a part comes back.
 */
export function toSourceSplits(
	map: CutTimeMap,
	cutSplits: readonly number[],
	sourceSplits: readonly number[],
): number[] {
	const cutPoints = new Set(getCutMarks(map).map((mark) => Math.round(mark.atMs)));
	const hidden = sourceSplits.filter((point) =>
		map.removed.some((part) => point > part.start && point < part.end),
	);
	const visible = cutSplits
		.filter((point) => !cutPoints.has(Math.round(point)))
		.map((point) => Math.round(toSourceMs(map, point, "start")));
	return [...new Set([...hidden, ...visible])].sort((a, b) => a - b);
}
