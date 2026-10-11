import { describe, expect, it } from "vitest";
import {
	cropToInsets,
	getCroppedSize,
	getMaxCropInset,
	insetsToCrop,
	isFullCrop,
	MIN_CROP_PIXELS,
	setCropInset,
} from "./cropInsets";

const FULL = { x: 0, y: 0, width: 1, height: 1 };

describe("cropToInsets / insetsToCrop", () => {
	it("reads a full crop as no insets", () => {
		expect(cropToInsets(FULL, 1920, 1080)).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
	});

	it("round-trips whole pixels exactly on awkward source sizes", () => {
		// 1366 and 853 do not divide evenly, which is where a normalised crop would drift.
		for (const [width, height] of [
			[1920, 1080],
			[1366, 853],
			[3840, 2160],
			[641, 479],
		]) {
			const insets = { top: 5, right: 13, bottom: 7, left: 3 };
			expect(cropToInsets(insetsToCrop(insets, width, height), width, height)).toEqual(insets);
		}
	});

	it("falls back to a full crop for an unknown source size", () => {
		expect(insetsToCrop({ top: 5, right: 0, bottom: 0, left: 0 }, 0, 0)).toEqual(FULL);
	});

	it("treats negative and fractional insets as whole, non-negative pixels", () => {
		expect(
			cropToInsets(insetsToCrop({ top: -4, right: 2.6, bottom: 0, left: 0 }, 100, 100), 100, 100),
		).toEqual({ top: 0, right: 3, bottom: 0, left: 0 });
	});
});

describe("setCropInset", () => {
	it("takes exactly five pixels off the top and nothing else", () => {
		const crop = setCropInset(FULL, "top", 5, 1920, 1080);
		expect(cropToInsets(crop, 1920, 1080)).toEqual({ top: 5, right: 0, bottom: 0, left: 0 });
		expect(getCroppedSize(crop, 1920, 1080)).toEqual({ width: 1920, height: 1075 });
		expect(crop.y * 1080).toBeCloseTo(5, 9);
		expect((crop.y + crop.height) * 1080).toBeCloseTo(1080, 9);
	});

	it("keeps the other three sides when one changes", () => {
		let crop = setCropInset(FULL, "left", 10, 800, 600);
		crop = setCropInset(crop, "bottom", 20, 800, 600);
		crop = setCropInset(crop, "top", 30, 800, 600);
		crop = setCropInset(crop, "right", 40, 800, 600);
		expect(cropToInsets(crop, 800, 600)).toEqual({ top: 30, right: 40, bottom: 20, left: 10 });
		crop = setCropInset(crop, "top", 0, 800, 600);
		expect(cropToInsets(crop, 800, 600)).toEqual({ top: 0, right: 40, bottom: 20, left: 10 });
	});

	it("always leaves a strip of picture, respecting the opposite inset", () => {
		const crop = setCropInset(setCropInset(FULL, "bottom", 100, 800, 600), "top", 9999, 800, 600);
		const insets = cropToInsets(crop, 800, 600);
		expect(insets.bottom).toBe(100);
		expect(insets.top).toBe(600 - 100 - MIN_CROP_PIXELS);
		expect(getCroppedSize(crop, 800, 600).height).toBe(MIN_CROP_PIXELS);
	});

	it("does not go negative on a source smaller than the minimum strip", () => {
		const crop = setCropInset(FULL, "left", 50, 10, 10);
		expect(cropToInsets(crop, 10, 10).left).toBe(0);
	});
});

describe("getMaxCropInset", () => {
	it("is what setCropInset will actually accept", () => {
		const crop = setCropInset(FULL, "bottom", 100, 800, 600);
		const max = getMaxCropInset(crop, "top", 800, 600);
		expect(max).toBe(600 - 100 - MIN_CROP_PIXELS);
		expect(cropToInsets(setCropInset(crop, "top", max, 800, 600), 800, 600).top).toBe(max);
		expect(cropToInsets(setCropInset(crop, "top", max + 1, 800, 600), 800, 600).top).toBe(max);
		expect(getMaxCropInset(crop, "left", 800, 600)).toBe(800 - MIN_CROP_PIXELS);
	});

	it("is zero while the source size is unknown", () => {
		expect(getMaxCropInset(FULL, "top", 0, 0)).toBe(0);
	});
});

describe("isFullCrop", () => {
	it("tells an untouched crop from a trimmed one", () => {
		expect(isFullCrop(FULL)).toBe(true);
		expect(isFullCrop(setCropInset(FULL, "top", 1, 1920, 1080))).toBe(false);
		expect(
			isFullCrop(setCropInset(setCropInset(FULL, "top", 5, 640, 480), "top", 0, 640, 480)),
		).toBe(true);
	});
});
