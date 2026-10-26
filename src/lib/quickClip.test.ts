import { describe, expect, it } from "vitest";
import type { CaptureRegion } from "./captureRegion";
import {
	calculateQuickClipBitrate,
	canFinalizeQuickClip,
	formatClipDuration,
	formatFileSize,
	LONG_RECORDING_SECONDS,
	planQuickClip,
} from "./quickClip";

const REGION: CaptureRegion = {
	displayId: 1,
	x: 0,
	y: 0,
	width: 1280,
	height: 720,
	displayWidth: 2560,
	displayHeight: 1440,
	scaleFactor: 1,
};

const BASE = {
	sourceWidth: 2560,
	sourceHeight: 1440,
	sourceIsMp4: true,
	sourceFrameRate: 60,
	frameRate: 60 as const,
};

describe("canFinalizeQuickClip", () => {
	it("is a quick clip only when nothing is left for Studio to composite", () => {
		expect(canFinalizeQuickClip({ cursorCaptureMode: "system", hasWebcamTrack: false })).toBe(true);
		expect(canFinalizeQuickClip({ cursorCaptureMode: "system", hasWebcamTrack: true })).toBe(false);
		expect(
			canFinalizeQuickClip({ cursorCaptureMode: "editable-overlay", hasWebcamTrack: false }),
		).toBe(false);
	});
});

describe("planQuickClip for long recordings", () => {
	const meeting = {
		sourceWidth: 2560,
		sourceHeight: 1440,
		sourceFrameRate: 60,
		sourceIsMp4: true,
		quality: "good" as const,
		frameRate: 30 as const,
	};

	it("saves a long recording exactly as recorded instead of re-encoding it", () => {
		// A short clip from the same display is shrunk to 1080p30 for sharing...
		expect(planQuickClip({ ...meeting, durationSeconds: 40 }).mode).toBe("transcode");
		// ...but an hour-long meeting is the original file, available at once.
		expect(planQuickClip({ ...meeting, durationSeconds: 3600 })).toEqual({
			mode: "copy",
			width: 2560,
			height: 1440,
		});
		expect(planQuickClip({ ...meeting, durationSeconds: LONG_RECORDING_SECONDS }).mode).toBe(
			"copy",
		);
	});

	it("still crops a long area recording: the file holds the whole display", () => {
		const plan = planQuickClip({
			...meeting,
			durationSeconds: 3600,
			region: REGION,
		});
		expect(plan.mode).toBe("transcode");
	});
});

describe("planQuickClip", () => {
	it("copies a recording that already is the requested output", () => {
		expect(planQuickClip({ ...BASE, quality: "source" })).toEqual({
			mode: "copy",
			width: 2560,
			height: 1440,
		});
	});

	it("copies when the recording is already smaller than the quality cap", () => {
		expect(
			planQuickClip({ ...BASE, sourceWidth: 1280, sourceHeight: 720, quality: "good" }),
		).toMatchObject({ mode: "copy" });
	});

	it("scales down to the chosen quality without changing the aspect ratio", () => {
		const plan = planQuickClip({ ...BASE, quality: "good" });
		expect(plan).toMatchObject({ mode: "transcode", width: 1920, height: 1080 });
		expect(plan.mode === "transcode" && plan.crop).toBeUndefined();
	});

	it("crops an area capture and never upscales it", () => {
		const plan = planQuickClip({ ...BASE, quality: "good", region: REGION });
		expect(plan).toMatchObject({
			mode: "transcode",
			width: 1280,
			height: 720,
			crop: { left: 0, top: 0, width: 1280, height: 720 },
		});
	});

	it("caps the short side for portrait areas too", () => {
		const plan = planQuickClip({
			...BASE,
			quality: "medium",
			region: { ...REGION, width: 900, height: 1440 },
		});
		expect(plan).toMatchObject({ mode: "transcode", width: 720, height: 1152 });
	});

	it("treats an area covering the whole display as no crop", () => {
		expect(
			planQuickClip({
				...BASE,
				quality: "source",
				region: { ...REGION, width: 2560, height: 1440 },
			}),
		).toMatchObject({ mode: "copy" });
	});

	it("re-encodes recordings that are not MP4 or run faster than requested", () => {
		expect(planQuickClip({ ...BASE, quality: "source", sourceIsMp4: false })).toMatchObject({
			mode: "transcode",
		});

		const resampled = planQuickClip({ ...BASE, quality: "source", frameRate: 30 });
		expect(resampled).toMatchObject({ mode: "transcode", frameRate: 30 });

		// 59.94 fps counts as 60: no resampling for rounding noise.
		expect(planQuickClip({ ...BASE, quality: "source", sourceFrameRate: 59.94 })).toMatchObject({
			mode: "copy",
		});
	});

	it("keeps large crops within what an H.264 encoder accepts", () => {
		// A 5120 x 1440 ultrawide with a nearly full-width area at Original quality.
		const plan = planQuickClip({
			...BASE,
			sourceWidth: 5120,
			sourceHeight: 1440,
			quality: "source",
			region: { ...REGION, width: 5000, height: 1440, displayWidth: 5120, displayHeight: 1440 },
		});
		expect(plan.mode).toBe("transcode");
		expect(plan.width).toBeLessThanOrEqual(4096);
		expect(plan.width / plan.height).toBeCloseTo(5000 / 1440, 1);

		// A 5K display, cropped slightly: too many pixels in total.
		const fiveK = planQuickClip({
			...BASE,
			sourceWidth: 5120,
			sourceHeight: 2880,
			quality: "source",
			region: { ...REGION, width: 5000, height: 2800, displayWidth: 5120, displayHeight: 2880 },
		});
		expect(fiveK.width * fiveK.height).toBeLessThanOrEqual(4096 * 2304);
		expect(fiveK.width % 2).toBe(0);
		expect(fiveK.height % 2).toBe(0);
	});

	it("produces even dimensions for odd sources", () => {
		const plan = planQuickClip({
			...BASE,
			sourceWidth: 1367,
			sourceHeight: 769,
			quality: "medium",
		});
		expect(plan.width % 2).toBe(0);
		expect(plan.height % 2).toBe(0);
	});
});

describe("calculateQuickClipBitrate", () => {
	it("scales with resolution and frame rate within sane limits", () => {
		const hd60 = calculateQuickClipBitrate(1920, 1080, 60);
		const hd30 = calculateQuickClipBitrate(1920, 1080, 30);
		expect(hd60).toBeGreaterThan(hd30);
		expect(hd60).toBeGreaterThan(8_000_000);
		expect(hd60).toBeLessThan(12_000_000);
		expect(calculateQuickClipBitrate(320, 240, 30)).toBe(3_000_000);
		expect(calculateQuickClipBitrate(7680, 4320, 60)).toBe(40_000_000);
	});
});

describe("clip formatting", () => {
	it("formats file sizes", () => {
		expect(formatFileSize(0)).toBe("0 KB");
		expect(formatFileSize(512 * 1024)).toBe("512 KB");
		expect(formatFileSize(6.4 * 1024 * 1024)).toBe("6.4 MB");
		expect(formatFileSize(250 * 1024 * 1024)).toBe("250 MB");
		expect(formatFileSize(1.5 * 1024 * 1024 * 1024)).toBe("1.50 GB");
	});

	it("formats durations as m:ss", () => {
		expect(formatClipDuration(0)).toBe("0:00");
		expect(formatClipDuration(14.4)).toBe("0:14");
		expect(formatClipDuration(125)).toBe("2:05");
	});
});
