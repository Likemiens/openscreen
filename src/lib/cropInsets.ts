/**
 * Crop expressed the way people think about it — "take 5 px off the top" — on top of
 * the editor's stored crop, which is a normalised rectangle of the source video.
 * Converting through source pixels keeps the numbers exact: an inset typed as 5 reads
 * back as 5, not 4.98.
 */

export interface NormalizedCrop {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface CropInsets {
	top: number;
	right: number;
	bottom: number;
	left: number;
}

export type CropSide = keyof CropInsets;

/** The picture that remains must stay at least this many source pixels on each axis. */
export const MIN_CROP_PIXELS = 16;

function toWholePixels(value: number): number {
	return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

export function cropToInsets(
	crop: NormalizedCrop,
	sourceWidth: number,
	sourceHeight: number,
): CropInsets {
	return {
		top: toWholePixels(crop.y * sourceHeight),
		left: toWholePixels(crop.x * sourceWidth),
		right: toWholePixels((1 - crop.x - crop.width) * sourceWidth),
		bottom: toWholePixels((1 - crop.y - crop.height) * sourceHeight),
	};
}

export function insetsToCrop(
	insets: CropInsets,
	sourceWidth: number,
	sourceHeight: number,
): NormalizedCrop {
	if (sourceWidth <= 0 || sourceHeight <= 0) return { x: 0, y: 0, width: 1, height: 1 };
	const left = toWholePixels(insets.left);
	const right = toWholePixels(insets.right);
	const top = toWholePixels(insets.top);
	const bottom = toWholePixels(insets.bottom);
	return {
		x: left / sourceWidth,
		y: top / sourceHeight,
		width: (sourceWidth - left - right) / sourceWidth,
		height: (sourceHeight - top - bottom) / sourceHeight,
	};
}

const OPPOSITE_SIDE: Record<CropSide, CropSide> = {
	top: "bottom",
	bottom: "top",
	left: "right",
	right: "left",
};

/**
 * The most that can be taken off `side`: the opposite inset is respected and a strip of
 * picture is always left. Fields use it as their limit, so what they show is what applies.
 */
export function getMaxCropInset(
	crop: NormalizedCrop,
	side: CropSide,
	sourceWidth: number,
	sourceHeight: number,
): number {
	const insets = cropToInsets(crop, sourceWidth, sourceHeight);
	const dimension = Math.round(side === "left" || side === "right" ? sourceWidth : sourceHeight);
	const minimumLeft = Math.min(MIN_CROP_PIXELS, dimension);
	return Math.max(0, dimension - insets[OPPOSITE_SIDE[side]] - minimumLeft);
}

/** Sets one inset, leaving the other three as they are, within `getMaxCropInset`. */
export function setCropInset(
	crop: NormalizedCrop,
	side: CropSide,
	pixels: number,
	sourceWidth: number,
	sourceHeight: number,
): NormalizedCrop {
	const insets = cropToInsets(crop, sourceWidth, sourceHeight);
	const max = getMaxCropInset(crop, side, sourceWidth, sourceHeight);
	return insetsToCrop(
		{ ...insets, [side]: Math.min(toWholePixels(pixels), max) },
		sourceWidth,
		sourceHeight,
	);
}

/** Size of the cropped picture in source pixels. */
export function getCroppedSize(crop: NormalizedCrop, sourceWidth: number, sourceHeight: number) {
	const insets = cropToInsets(crop, sourceWidth, sourceHeight);
	return {
		width: Math.max(0, Math.round(sourceWidth) - insets.left - insets.right),
		height: Math.max(0, Math.round(sourceHeight) - insets.top - insets.bottom),
	};
}

export function isFullCrop(crop: NormalizedCrop): boolean {
	return crop.x <= 0 && crop.y <= 0 && crop.width >= 1 && crop.height >= 1;
}
