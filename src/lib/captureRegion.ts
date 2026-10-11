/**
 * A user-selected rectangle of one display. Coordinates are DIP relative to the
 * display's top-left corner, so the same region maps onto any capture
 * resolution of that display through simple fractions.
 */
export interface CaptureRegion {
	/** Electron display id the region belongs to. */
	displayId: number;
	x: number;
	y: number;
	width: number;
	height: number;
	/** Display size in DIP when the region was selected. */
	displayWidth: number;
	displayHeight: number;
	/** Device scale factor when the region was selected. */
	scaleFactor: number;
}

export interface RegionRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface PixelCropRect {
	left: number;
	top: number;
	width: number;
	height: number;
}

export interface RegionAspectPreset {
	id: string;
	label: string;
	/** Width / height. `null` leaves the selection unconstrained. */
	ratio: number | null;
}

/** Smallest selection (DIP) that still yields a usable video. */
export const MIN_REGION_SIZE = 48;

export const REGION_ASPECT_PRESETS: readonly RegionAspectPreset[] = [
	{ id: "free", label: "Free", ratio: null },
	{ id: "16:9", label: "16:9", ratio: 16 / 9 },
	{ id: "4:3", label: "4:3", ratio: 4 / 3 },
	{ id: "1:1", label: "1:1", ratio: 1 },
	{ id: "9:16", label: "9:16", ratio: 9 / 16 },
];

/** Output sizes in physical pixels offered as one-click selections. */
export const REGION_SIZE_PRESETS: ReadonlyArray<{ width: number; height: number }> = [
	{ width: 1280, height: 720 },
	{ width: 1920, height: 1080 },
	{ width: 1080, height: 1080 },
	{ width: 1080, height: 1920 },
];

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function toEven(value: number): number {
	return Math.max(2, Math.floor(value / 2) * 2);
}

export function normalizeCaptureRegion(value: unknown): CaptureRegion | null {
	if (!value || typeof value !== "object") return null;
	const raw = value as Record<string, unknown>;
	if (
		!isFiniteNumber(raw.displayId) ||
		!isFiniteNumber(raw.x) ||
		!isFiniteNumber(raw.y) ||
		!isFiniteNumber(raw.width) ||
		!isFiniteNumber(raw.height) ||
		!isFiniteNumber(raw.displayWidth) ||
		!isFiniteNumber(raw.displayHeight) ||
		raw.displayWidth <= 0 ||
		raw.displayHeight <= 0
	) {
		return null;
	}

	const rect = clampRegionRect(
		{ x: raw.x, y: raw.y, width: raw.width, height: raw.height },
		{ width: raw.displayWidth, height: raw.displayHeight },
	);
	if (rect.width < MIN_REGION_SIZE || rect.height < MIN_REGION_SIZE) return null;

	return {
		displayId: raw.displayId,
		...rect,
		displayWidth: raw.displayWidth,
		displayHeight: raw.displayHeight,
		scaleFactor: isFiniteNumber(raw.scaleFactor) && raw.scaleFactor > 0 ? raw.scaleFactor : 1,
	};
}

/** Builds a rectangle from two drag points, in any order. */
export function rectFromPoints(
	a: { x: number; y: number },
	b: { x: number; y: number },
): RegionRect {
	return {
		x: Math.min(a.x, b.x),
		y: Math.min(a.y, b.y),
		width: Math.abs(a.x - b.x),
		height: Math.abs(a.y - b.y),
	};
}

/** Keeps a rectangle inside the display, shrinking it only when it cannot fit. */
export function clampRegionRect(
	rect: RegionRect,
	bounds: { width: number; height: number },
): RegionRect {
	const width = Math.min(Math.max(0, rect.width), bounds.width);
	const height = Math.min(Math.max(0, rect.height), bounds.height);
	const x = Math.min(Math.max(0, rect.x), bounds.width - width);
	const y = Math.min(Math.max(0, rect.y), bounds.height - height);
	return {
		x: Math.round(x),
		y: Math.round(y),
		width: Math.round(width),
		height: Math.round(height),
	};
}

/**
 * Fits a rectangle of the given aspect ratio around the centre of `rect`,
 * preserving its area as closely as the display allows.
 */
export function applyAspectRatio(
	rect: RegionRect,
	ratio: number,
	bounds: { width: number; height: number },
): RegionRect {
	const area = Math.max(1, rect.width * rect.height);
	let width = Math.sqrt(area * ratio);
	let height = width / ratio;

	const fit = Math.min(1, bounds.width / width, bounds.height / height);
	width *= fit;
	height *= fit;

	return clampRegionRect(
		{
			x: rect.x + rect.width / 2 - width / 2,
			y: rect.y + rect.height / 2 - height / 2,
			width,
			height,
		},
		bounds,
	);
}

/**
 * Resizes a rectangle so the captured video is exactly `pixelWidth` x
 * `pixelHeight` physical pixels, keeping its centre. Falls back to the largest
 * same-ratio rectangle when the display is too small.
 */
export function resizeRectToPixelSize(
	rect: RegionRect,
	pixelWidth: number,
	pixelHeight: number,
	bounds: { width: number; height: number },
	scaleFactor: number,
): RegionRect {
	const scale = scaleFactor > 0 ? scaleFactor : 1;
	let width = pixelWidth / scale;
	let height = pixelHeight / scale;
	const fit = Math.min(1, bounds.width / width, bounds.height / height);
	width *= fit;
	height *= fit;

	return clampRegionRect(
		{
			x: rect.x + rect.width / 2 - width / 2,
			y: rect.y + rect.height / 2 - height / 2,
			width,
			height,
		},
		bounds,
	);
}

/** Physical pixel size the region produces at its recorded scale factor. */
export function getRegionPixelSize(
	region: Pick<CaptureRegion, "width" | "height" | "scaleFactor">,
): { width: number; height: number } {
	return {
		width: toEven(Math.round(region.width * region.scaleFactor)),
		height: toEven(Math.round(region.height * region.scaleFactor)),
	};
}

export function isFullDisplayRegion(region: CaptureRegion): boolean {
	return (
		region.x <= 0 &&
		region.y <= 0 &&
		region.width >= region.displayWidth &&
		region.height >= region.displayHeight
	);
}

/**
 * Maps a region onto a recorded video of the whole display. Uses fractions of
 * the display so it stays correct whatever resolution the recorder produced.
 * Returns even dimensions because H.264 4:2:0 needs them.
 */
export function regionToPixelCrop(
	region: CaptureRegion,
	videoWidth: number,
	videoHeight: number,
): PixelCropRect {
	const scaleX = videoWidth / region.displayWidth;
	const scaleY = videoHeight / region.displayHeight;

	const width = Math.min(toEven(Math.round(region.width * scaleX)), toEven(videoWidth));
	const height = Math.min(toEven(Math.round(region.height * scaleY)), toEven(videoHeight));
	const left = Math.min(Math.max(0, Math.round(region.x * scaleX)), videoWidth - width);
	const top = Math.min(Math.max(0, Math.round(region.y * scaleY)), videoHeight - height);

	return { left, top, width, height };
}

export function formatRegionSize(
	region: Pick<CaptureRegion, "width" | "height" | "scaleFactor">,
): string {
	const { width, height } = getRegionPixelSize(region);
	return `${width} × ${height}`;
}

export type RegionResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export const REGION_RESIZE_HANDLES: readonly RegionResizeHandle[] = [
	"nw",
	"n",
	"ne",
	"e",
	"se",
	"s",
	"sw",
	"w",
];

interface Bounds {
	width: number;
	height: number;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

/**
 * The rectangle dragged out from `anchor` to `pointer`. With a `ratio` the rectangle
 * keeps that aspect and grows in the drag direction for as far as the display allows.
 */
export function rectFromDrag(
	anchor: { x: number; y: number },
	pointer: { x: number; y: number },
	bounds: Bounds,
	ratio: number | null = null,
): RegionRect {
	const px = clamp(pointer.x, 0, bounds.width);
	const py = clamp(pointer.y, 0, bounds.height);
	if (!ratio) return clampRegionRect(rectFromPoints(anchor, { x: px, y: py }), bounds);

	const directionX = px >= anchor.x ? 1 : -1;
	const directionY = py >= anchor.y ? 1 : -1;
	const roomX = directionX > 0 ? bounds.width - anchor.x : anchor.x;
	const roomY = directionY > 0 ? bounds.height - anchor.y : anchor.y;

	let width = Math.max(Math.abs(px - anchor.x), Math.abs(py - anchor.y) * ratio);
	width = Math.min(width, roomX, roomY * ratio);
	const height = width / ratio;

	return {
		x: Math.round(directionX > 0 ? anchor.x : anchor.x - width),
		y: Math.round(directionY > 0 ? anchor.y : anchor.y - height),
		width: Math.round(width),
		height: Math.round(height),
	};
}

/** Moves a rectangle by a delta, stopping at the display edges. */
export function moveRect(rect: RegionRect, deltaX: number, deltaY: number, bounds: Bounds) {
	return clampRegionRect({ ...rect, x: rect.x + deltaX, y: rect.y + deltaY }, bounds);
}

/**
 * Resizes a rectangle by dragging one of its handles to `pointer`. The opposite
 * edge or corner stays put. With a `ratio` the aspect is preserved: corners resize
 * from the opposite corner, edges resize around the centre of the other axis.
 */
export function resizeRect(
	rect: RegionRect,
	handle: RegionResizeHandle,
	pointer: { x: number; y: number },
	bounds: Bounds,
	ratio: number | null = null,
	minSize = MIN_REGION_SIZE,
): RegionRect {
	const right = rect.x + rect.width;
	const bottom = rect.y + rect.height;
	const movesWest = handle.includes("w");
	const movesEast = handle.includes("e");
	const movesNorth = handle.includes("n");
	const movesSouth = handle.includes("s");

	if (ratio && handle.length === 2) {
		const anchor = { x: movesWest ? right : rect.x, y: movesNorth ? bottom : rect.y };
		// Keep the drag on the handle's own side of the anchor so the box cannot flip.
		const constrained = {
			x: movesWest
				? Math.min(pointer.x, anchor.x - minSize)
				: Math.max(pointer.x, anchor.x + minSize),
			y: movesNorth
				? Math.min(pointer.y, anchor.y - minSize)
				: Math.max(pointer.y, anchor.y + minSize),
		};
		return rectFromDrag(anchor, constrained, bounds, ratio);
	}

	let left = rect.x;
	let top = rect.y;
	let nextRight = right;
	let nextBottom = bottom;
	if (movesWest) left = clamp(pointer.x, 0, right - minSize);
	if (movesEast) nextRight = clamp(pointer.x, rect.x + minSize, bounds.width);
	if (movesNorth) top = clamp(pointer.y, 0, bottom - minSize);
	if (movesSouth) nextBottom = clamp(pointer.y, rect.y + minSize, bounds.height);

	let width = nextRight - left;
	let height = nextBottom - top;

	if (ratio) {
		// Edge handle: derive the other axis from the dragged one, centred on the old box.
		if (movesWest || movesEast) {
			const centerY = rect.y + rect.height / 2;
			const maxHeight = 2 * Math.min(centerY, bounds.height - centerY);
			height = Math.min(width / ratio, maxHeight);
			width = height * ratio;
			top = centerY - height / 2;
			if (movesWest) left = right - width;
		} else {
			const centerX = rect.x + rect.width / 2;
			const maxWidth = 2 * Math.min(centerX, bounds.width - centerX);
			width = Math.min(height * ratio, maxWidth);
			height = width / ratio;
			left = centerX - width / 2;
			if (movesNorth) top = bottom - height;
		}
	}

	return {
		x: Math.round(left),
		y: Math.round(top),
		width: Math.round(width),
		height: Math.round(height),
	};
}
