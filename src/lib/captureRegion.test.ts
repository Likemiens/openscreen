import { describe, expect, it } from "vitest";
import {
	applyAspectRatio,
	type CaptureRegion,
	clampRegionRect,
	formatRegionSize,
	getRegionPixelSize,
	isFullDisplayRegion,
	moveRect,
	normalizeCaptureRegion,
	rectFromDrag,
	regionToPixelCrop,
	resizeRect,
	resizeRectToPixelSize,
} from "./captureRegion";

const DISPLAY = { width: 1920, height: 1080 };

function region(overrides: Partial<CaptureRegion> = {}): CaptureRegion {
	return {
		displayId: 1,
		x: 100,
		y: 50,
		width: 640,
		height: 360,
		displayWidth: 1920,
		displayHeight: 1080,
		scaleFactor: 1,
		...overrides,
	};
}

describe("normalizeCaptureRegion", () => {
	it("accepts a well-formed region and defaults a missing scale factor", () => {
		const { scaleFactor: _scaleFactor, ...withoutScale } = region();
		expect(normalizeCaptureRegion(withoutScale)).toEqual(region());
	});

	it("rejects malformed and unusably small regions", () => {
		expect(normalizeCaptureRegion(null)).toBeNull();
		expect(normalizeCaptureRegion({ ...region(), width: "640" })).toBeNull();
		expect(normalizeCaptureRegion({ ...region(), displayWidth: 0 })).toBeNull();
		expect(normalizeCaptureRegion(region({ width: 10, height: 10 }))).toBeNull();
	});

	it("pulls a region that hangs off the display back inside it", () => {
		expect(normalizeCaptureRegion(region({ x: 1800, y: 1000 }))).toMatchObject({
			x: 1280,
			y: 720,
			width: 640,
			height: 360,
		});
	});
});

describe("region geometry", () => {
	it("clamps position before size", () => {
		expect(clampRegionRect({ x: -20, y: -5, width: 300, height: 200 }, DISPLAY)).toEqual({
			x: 0,
			y: 0,
			width: 300,
			height: 200,
		});
		expect(clampRegionRect({ x: 0, y: 0, width: 4000, height: 3000 }, DISPLAY)).toEqual({
			x: 0,
			y: 0,
			width: 1920,
			height: 1080,
		});
	});

	it("builds a rectangle from a drag in any direction", () => {
		expect(rectFromDrag({ x: 500, y: 400 }, { x: 200, y: 100 }, DISPLAY)).toEqual({
			x: 200,
			y: 100,
			width: 300,
			height: 300,
		});
	});

	it("keeps the aspect ratio while dragging and stops at the display edge", () => {
		const dragged = rectFromDrag({ x: 100, y: 100 }, { x: 500, y: 150 }, DISPLAY, 16 / 9);
		expect(dragged).toEqual({ x: 100, y: 100, width: 400, height: 225 });

		// Dragging far past the bottom edge: height is capped by the room below the anchor.
		const capped = rectFromDrag({ x: 100, y: 900 }, { x: 1900, y: 5000 }, DISPLAY, 16 / 9);
		expect(capped.height).toBe(180);
		expect(capped.width).toBe(320);
	});

	it("moves without leaving the display", () => {
		const start = { x: 1200, y: 600, width: 640, height: 360 };
		expect(moveRect(start, 500, 500, DISPLAY)).toEqual({ ...start, x: 1280, y: 720 });
	});

	it("resizes from an edge and never below the minimum size", () => {
		const start = { x: 100, y: 100, width: 400, height: 300 };
		expect(resizeRect(start, "e", { x: 700, y: 0 }, DISPLAY)).toEqual({ ...start, width: 600 });
		expect(resizeRect(start, "w", { x: 490, y: 0 }, DISPLAY)).toEqual({
			...start,
			x: 452,
			width: 48,
		});
	});

	it("keeps the opposite corner fixed when resizing with a locked ratio", () => {
		const start = { x: 100, y: 100, width: 320, height: 180 };
		const resized = resizeRect(start, "se", { x: 740, y: 300 }, DISPLAY, 16 / 9);
		expect(resized).toEqual({ x: 100, y: 100, width: 640, height: 360 });

		const fromTopLeft = resizeRect(start, "nw", { x: 20, y: 90 }, DISPLAY, 16 / 9);
		expect(fromTopLeft.x + fromTopLeft.width).toBe(420);
		expect(fromTopLeft.y + fromTopLeft.height).toBe(280);
		expect(fromTopLeft.width / fromTopLeft.height).toBeCloseTo(16 / 9, 1);
	});

	it("applies an aspect ratio around the centre of the selection", () => {
		const squared = applyAspectRatio({ x: 100, y: 100, width: 800, height: 200 }, 1, DISPLAY);
		expect(squared.width).toBe(squared.height);
		expect(squared.x + squared.width / 2).toBe(500);
		expect(squared.y + squared.height / 2).toBe(200);
	});

	it("resizes to an exact pixel size, accounting for display scaling", () => {
		const resized = resizeRectToPixelSize(
			{ x: 0, y: 0, width: 400, height: 400 },
			1280,
			720,
			DISPLAY,
			2,
		);
		expect(resized).toMatchObject({ width: 640, height: 360 });
		expect(getRegionPixelSize({ ...resized, scaleFactor: 2 })).toEqual({
			width: 1280,
			height: 720,
		});
	});
});

describe("regionToPixelCrop", () => {
	it("maps DIP coordinates onto the recorded resolution", () => {
		// 150% scaling: the 1920x1080 DIP display records at 2880x1620.
		expect(regionToPixelCrop(region({ scaleFactor: 1.5 }), 2880, 1620)).toEqual({
			left: 150,
			top: 75,
			width: 960,
			height: 540,
		});
	});

	it("always returns even dimensions inside the video", () => {
		const crop = regionToPixelCrop(
			region({ x: 1279, y: 719, width: 641, height: 361 }),
			1920,
			1080,
		);
		expect(crop.width % 2).toBe(0);
		expect(crop.height % 2).toBe(0);
		expect(crop.left + crop.width).toBeLessThanOrEqual(1920);
		expect(crop.top + crop.height).toBeLessThanOrEqual(1080);
	});
});

describe("region labels", () => {
	it("reports the size in physical pixels", () => {
		expect(formatRegionSize(region({ scaleFactor: 1.5 }))).toBe("960 × 540");
	});

	it("recognises a region covering the whole display", () => {
		expect(isFullDisplayRegion(region({ x: 0, y: 0, width: 1920, height: 1080 }))).toBe(true);
		expect(isFullDisplayRegion(region())).toBe(false);
	});
});
