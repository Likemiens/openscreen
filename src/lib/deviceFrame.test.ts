import { FillGradient } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import {
	canRotateDevice,
	computeFramedCompositeLayout,
	DEFAULT_DEVICE_FRAME,
	DEFAULT_DEVICE_ORIENTATION,
	DEVICE_FRAME_COLORS,
	DEVICE_FRAME_KINDS,
	type DeviceFrameKind,
	type DeviceFrameSettings,
	type DeviceShape,
	deviceBackShapes,
	getDeviceScreenAspect,
	hasDeviceFrame,
	isFullBleedCameraLayout,
	layoutDeviceFrame,
	normalizeDeviceFrame,
	offsetScreenForDevice,
	paintDeviceShapes,
	shrinkContentBoxForDevice,
} from "./deviceFrame";

const FRAMED_KINDS = DEVICE_FRAME_KINDS.filter(
	(kind): kind is Exclude<DeviceFrameKind, "none"> => kind !== "none",
);

function frame(patch: Partial<DeviceFrameSettings>): DeviceFrameSettings {
	return { ...DEFAULT_DEVICE_FRAME, ...patch };
}

function shapeBounds(shape: DeviceShape) {
	if (shape.type === "poly") {
		const xs = shape.points.filter((_, index) => index % 2 === 0);
		const ys = shape.points.filter((_, index) => index % 2 === 1);
		return {
			left: Math.min(...xs),
			top: Math.min(...ys),
			right: Math.max(...xs),
			bottom: Math.max(...ys),
		};
	}
	return shape.type === "circle"
		? {
				left: shape.x - shape.radius,
				top: shape.y - shape.radius,
				right: shape.x + shape.radius,
				bottom: shape.y + shape.radius,
			}
		: {
				left: shape.x,
				top: shape.y,
				right: shape.x + shape.width,
				bottom: shape.y + shape.height,
			};
}

describe("normalizeDeviceFrame", () => {
	it("falls back to no device for anything that is not a settings object", () => {
		expect(normalizeDeviceFrame(undefined)).toEqual(DEFAULT_DEVICE_FRAME);
		expect(normalizeDeviceFrame("phone")).toEqual(DEFAULT_DEVICE_FRAME);
		expect(normalizeDeviceFrame(null)).toEqual(DEFAULT_DEVICE_FRAME);
	});

	it("keeps valid fields and replaces unknown ones", () => {
		const saved = {
			kind: "laptop",
			color: "silver",
			camera: "notch",
			cameraSide: "right",
			orientation: "landscape",
			fit: "fit",
		};
		expect(normalizeDeviceFrame(saved)).toEqual(saved);
		expect(
			normalizeDeviceFrame({
				kind: "fridge",
				color: "pink",
				camera: 3,
				cameraSide: "top",
				orientation: "upside-down",
				fit: "stretch",
			}),
		).toEqual(DEFAULT_DEVICE_FRAME);
	});

	it("opens a project saved before devices had fixed screens without cropping it", () => {
		const legacy = { color: "black", camera: "hole", cameraSide: "left" };
		// It used to show the whole video, so it comes back fitted, held the usual way.
		expect(normalizeDeviceFrame({ ...legacy, kind: "phone" })).toMatchObject({
			orientation: "portrait",
			fit: "fit",
		});
		expect(normalizeDeviceFrame({ ...legacy, kind: "tablet" })).toMatchObject({
			orientation: "landscape",
			fit: "fit",
		});
		// A current project keeps exactly what it says.
		expect(
			normalizeDeviceFrame({ ...legacy, kind: "tablet", orientation: "portrait", fit: "fill" }),
		).toMatchObject({ orientation: "portrait", fit: "fill" });
	});
});

describe("getDeviceScreenAspect", () => {
	it("gives real devices the proportions of their screens", () => {
		expect(getDeviceScreenAspect({ kind: "phone", orientation: "portrait" })).toBeCloseTo(
			9 / 19.5,
			6,
		);
		expect(getDeviceScreenAspect({ kind: "tablet", orientation: "portrait" })).toBeCloseTo(
			1640 / 2360,
			6,
		);
		expect(getDeviceScreenAspect({ kind: "laptop", orientation: "portrait" })).toBeCloseTo(1.6, 6);
	});

	it("turns a phone or tablet on its side, but never a laptop", () => {
		expect(getDeviceScreenAspect({ kind: "phone", orientation: "landscape" })).toBeCloseTo(
			19.5 / 9,
			6,
		);
		expect(getDeviceScreenAspect({ kind: "tablet", orientation: "landscape" })).toBeGreaterThan(1);
		expect(getDeviceScreenAspect({ kind: "laptop", orientation: "landscape" })).toBeCloseTo(1.6, 6);
		expect(canRotateDevice("phone")).toBe(true);
		expect(canRotateDevice("tablet")).toBe(true);
		expect(canRotateDevice("laptop")).toBe(false);
		expect(canRotateDevice("browser")).toBe(false);
	});

	it("has no fixed screen for a browser window or for no device", () => {
		expect(getDeviceScreenAspect({ kind: "browser", orientation: "portrait" })).toBeNull();
		expect(getDeviceScreenAspect({ kind: "none", orientation: "portrait" })).toBeNull();
	});

	it("shows each device the way it is usually held", () => {
		expect(DEFAULT_DEVICE_ORIENTATION.phone).toBe("portrait");
		expect(DEFAULT_DEVICE_ORIENTATION.tablet).toBe("landscape");
	});
});

describe("isFullBleedCameraLayout", () => {
	it("names the layouts that leave no room for a frame", () => {
		expect(isFullBleedCameraLayout("vertical-stack")).toBe(true);
		expect(isFullBleedCameraLayout("dual-frame")).toBe(true);
		expect(isFullBleedCameraLayout("picture-in-picture")).toBe(false);
		expect(isFullBleedCameraLayout(undefined)).toBe(false);
	});
});

describe("hasDeviceFrame", () => {
	it("is false without settings or with no device", () => {
		expect(hasDeviceFrame(null)).toBe(false);
		expect(hasDeviceFrame(DEFAULT_DEVICE_FRAME)).toBe(false);
		expect(hasDeviceFrame(frame({ kind: "browser" }))).toBe(true);
	});
});

describe("layoutDeviceFrame", () => {
	const screen = { x: 400, y: 200, width: 800, height: 450 };

	it("draws nothing when no device is selected or the screen is empty", () => {
		expect(layoutDeviceFrame(screen, DEFAULT_DEVICE_FRAME)).toBeNull();
		expect(layoutDeviceFrame({ ...screen, width: 0 }, frame({ kind: "phone" }))).toBeNull();
	});

	it.each(FRAMED_KINDS)("keeps every %s shape inside the reported bounds", (kind) => {
		const layout = layoutDeviceFrame(screen, frame({ kind, camera: "notch" }));
		expect(layout).not.toBeNull();
		const { bounds } = layout!;
		for (const shape of [...layout!.back, ...layout!.front]) {
			const box = shapeBounds(shape);
			expect(box.left).toBeGreaterThanOrEqual(bounds.x - 0.001);
			expect(box.top).toBeGreaterThanOrEqual(bounds.y - 0.001);
			expect(box.right).toBeLessThanOrEqual(bounds.x + bounds.width + 0.001);
			expect(box.bottom).toBeLessThanOrEqual(bounds.y + bounds.height + 0.001);
		}
	});

	it.each(FRAMED_KINDS)("leaves the %s screen exactly where the video is", (kind) => {
		const layout = layoutDeviceFrame(screen, frame({ kind }));
		expect(layout!.screen).toEqual(screen);
		// The last shape behind the video is the dark screen itself.
		expect(layout!.back.at(-1)).toMatchObject({ type: "roundRect", ...screen });
	});

	it("scales with the screen, so preview and export frames are proportional", () => {
		const small = layoutDeviceFrame(screen, frame({ kind: "phone" }))!;
		const large = layoutDeviceFrame(
			{ x: 800, y: 400, width: 1600, height: 900 },
			frame({ kind: "phone" }),
		)!;
		expect(large.bounds.width).toBeCloseTo(small.bounds.width * 2, 6);
		expect(large.screenRadius).toBeCloseTo(small.screenRadius * 2, 6);
		expect(large.back).toHaveLength(small.back.length);
	});

	it("puts a landscape phone's camera on the chosen end", () => {
		const left = layoutDeviceFrame(screen, frame({ kind: "phone", cameraSide: "left" }))!;
		const right = layoutDeviceFrame(screen, frame({ kind: "phone", cameraSide: "right" }))!;
		const middle = screen.x + screen.width / 2;
		expect(shapeBounds(left.front[0]).right).toBeLessThan(middle);
		expect(shapeBounds(right.front[0]).left).toBeGreaterThan(middle);
	});

	it("centres a portrait phone's camera at the top", () => {
		const portrait = { x: 100, y: 100, width: 390, height: 844 };
		const layout = layoutDeviceFrame(portrait, frame({ kind: "phone", camera: "hole" }))!;
		const hole = layout.front[0];
		expect(hole.type).toBe("circle");
		expect(hole.x).toBeCloseTo(portrait.x + portrait.width / 2, 6);
		expect(hole.y).toBeLessThan(portrait.y + portrait.height * 0.2);
	});

	it("holds the phone the way it is told, whatever rounding did to the screen", () => {
		// A 1080 × 1079 video is landscape; its rounded preview rectangle may come out square.
		const square = { x: 100, y: 100, width: 400, height: 400 };
		const middle = square.x + square.width / 2;
		const landscape = layoutDeviceFrame(square, frame({ kind: "phone" }), false)!;
		const portrait = layoutDeviceFrame(square, frame({ kind: "phone" }), true)!;
		expect(shapeBounds(landscape.front[0]).right).toBeLessThan(middle);
		expect(shapeBounds(portrait.front[0]).left).toBeLessThan(middle);
		expect(shapeBounds(portrait.front[0]).right).toBeGreaterThan(middle);
	});

	it("draws no cutout when the camera is turned off, and none on other devices", () => {
		expect(layoutDeviceFrame(screen, frame({ kind: "phone", camera: "none" }))!.front).toEqual([]);
		expect(layoutDeviceFrame(screen, frame({ kind: "tablet" }))!.front).toEqual([]);
		expect(layoutDeviceFrame(screen, frame({ kind: "browser" }))!.front).toEqual([]);
	});

	it("uses the body colour for the frame but keeps the glass black", () => {
		const silver = layoutDeviceFrame(screen, frame({ kind: "tablet", color: "silver" }))!;
		const black = layoutDeviceFrame(screen, frame({ kind: "tablet", color: "black" }))!;
		expect(silver.back[0].color).not.toBe(black.back[0].color);
		expect(silver.back.at(-1)!.color).toBe(black.back.at(-1)!.color);
	});

	it("keeps the browser address field clear of the window buttons on a narrow window", () => {
		const narrow = layoutDeviceFrame(
			{ x: 0, y: 0, width: 300, height: 900 },
			frame({ kind: "browser" }),
		)!;
		const lights = narrow.back.filter((shape) => shape.part === "window-button");
		const field = narrow.back.find((shape) => shape.part === "address-field")!;
		expect(lights).toHaveLength(3);
		expect(shapeBounds(field).left).toBeGreaterThan(shapeBounds(lights[2]).right);
	});

	it("gives a wide browser window its toolbar, clear of the buttons and the address", () => {
		const wide = layoutDeviceFrame(screen, frame({ kind: "browser" }))!;
		const field = shapeBounds(wide.back.find((shape) => shape.part === "address-field")!);
		const arrows = wide.back.filter((shape) => shape.type === "poly").map(shapeBounds);
		const lights = wide.back.filter((shape) => shape.part === "window-button").map(shapeBounds);
		expect(arrows).toHaveLength(2);
		for (const arrow of arrows) {
			expect(arrow.left).toBeGreaterThan(lights[2].right);
			expect(arrow.right).toBeLessThan(field.left);
		}
	});

	it("draws a light browser for the light colours and a dark one for the dark", () => {
		const bar = (color: DeviceFrameSettings["color"]) =>
			layoutDeviceFrame(screen, frame({ kind: "browser", color }))!.back.find(
				(shape) => shape.part === "bar",
			)!.color;
		const brightness = (rgb: number) => (rgb >> 16) + ((rgb >> 8) & 0xff) + (rgb & 0xff);
		expect(brightness(bar("silver"))).toBeGreaterThan(600);
		expect(brightness(bar("white"))).toBeGreaterThan(600);
		expect(brightness(bar("graphite"))).toBeLessThan(200);
		expect(brightness(bar("black"))).toBeLessThan(200);
	});

	it.each(FRAMED_KINDS)("casts a soft %s shadow that is painted before the device", (kind) => {
		const layout = layoutDeviceFrame(screen, frame({ kind }))!;
		expect(layout.shadow.length).toBeGreaterThan(0);
		for (const shape of layout.shadow) expect(shape.color).toBe(0x000000);
		const painted = deviceBackShapes({ deviceFrame: layout })!;
		expect(painted.slice(0, layout.shadow.length)).toEqual(layout.shadow);
		expect(painted.slice(layout.shadow.length)).toEqual(layout.back);
		expect(deviceBackShapes({ deviceFrame: null })).toBeUndefined();
		expect(deviceBackShapes(null)).toBeUndefined();
	});

	it.each(DEVICE_FRAME_COLORS)("lights the %s metal and keeps every gradient in order", (color) => {
		const layout = layoutDeviceFrame(screen, frame({ kind: "phone", color }))!;
		const graded = [...layout.shadow, ...layout.back, ...layout.front].filter((s) => s.gradient);
		expect(graded.length).toBeGreaterThan(3);
		for (const shape of graded) {
			const offsets = shape.gradient!.stops.map((stop) => stop.offset);
			expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
			expect(offsets[0]).toBe(0);
			expect(offsets.at(-1)).toBe(1);
		}
	});
});

describe("shrinkContentBoxForDevice / offsetScreenForDevice", () => {
	it("returns the box unchanged for an empty screen", () => {
		const box = { width: 1000, height: 500 };
		expect(shrinkContentBoxForDevice(box, { width: 0, height: 0 }, "phone")).toBe(box);
	});

	it("only shifts frames that are heavier on one side", () => {
		const screen = { x: 100, y: 100, width: 800, height: 450 };
		expect(offsetScreenForDevice(screen, "phone")).toEqual(screen);
		expect(offsetScreenForDevice(screen, "tablet")).toEqual(screen);
		// A browser bar on top pushes the page down; a laptop base pushes the lid up.
		expect(offsetScreenForDevice(screen, "browser").y).toBeGreaterThan(screen.y);
		expect(offsetScreenForDevice(screen, "laptop").y).toBeLessThan(screen.y);
		expect(offsetScreenForDevice(screen, "browser").x).toBe(screen.x);
	});
});

describe("computeFramedCompositeLayout", () => {
	const base = {
		canvasSize: { width: 1920, height: 1080 },
		maxContentSize: { width: 1536, height: 864 },
		screenSize: { width: 1280, height: 720 },
		layoutPreset: "no-webcam" as const,
	};

	it("matches the plain layout when there is no device", () => {
		const layout = computeFramedCompositeLayout({ ...base, deviceFrame: DEFAULT_DEVICE_FRAME });
		expect(layout!.deviceFrame).toBeNull();
		expect(layout!.screenRect).toEqual({ x: 192, y: 108, width: 1536, height: 864 });
		expect(computeFramedCompositeLayout(base)!.screenRect).toEqual(layout!.screenRect);
	});

	it.each(FRAMED_KINDS)("fits the whole %s inside the box the video had", (kind) => {
		const layout = computeFramedCompositeLayout({ ...base, deviceFrame: frame({ kind }) })!;
		const bounds = layout.deviceFrame!.bounds;
		const boxLeft = (1920 - 1536) / 2;
		const boxTop = (1080 - 864) / 2;
		// One pixel of slack: the screen rectangle is rounded to whole pixels.
		expect(bounds.x).toBeGreaterThanOrEqual(boxLeft - 1);
		expect(bounds.y).toBeGreaterThanOrEqual(boxTop - 1);
		expect(bounds.x + bounds.width).toBeLessThanOrEqual(boxLeft + 1536 + 1);
		expect(bounds.y + bounds.height).toBeLessThanOrEqual(boxTop + 864 + 1);
	});

	it.each(FRAMED_KINDS)("centres the %s as a whole on the canvas", (kind) => {
		const layout = computeFramedCompositeLayout({ ...base, deviceFrame: frame({ kind }) })!;
		const bounds = layout.deviceFrame!.bounds;
		// Within a pixel: the screen rectangle sits on whole pixels.
		expect(Math.abs(bounds.x + bounds.width / 2 - 960)).toBeLessThanOrEqual(1);
		expect(Math.abs(bounds.y + bounds.height / 2 - 540)).toBeLessThanOrEqual(1);
	});

	it.each([
		["phone", "portrait", 9 / 19.5],
		["phone", "landscape", 19.5 / 9],
		["tablet", "portrait", 1640 / 2360],
		["laptop", "portrait", 16 / 10],
	] as const)("keeps a %s (%s) at its own proportions whatever the video is", (kind, orientation, aspect) => {
		for (const screenSize of [
			{ width: 1280, height: 720 },
			{ width: 390, height: 844 },
			{ width: 1000, height: 1000 },
		]) {
			const layout = computeFramedCompositeLayout({
				...base,
				screenSize,
				deviceFrame: frame({ kind, orientation }),
			})!;
			const screen = layout.deviceFrame!.screen;
			expect(screen.width / screen.height).toBeCloseTo(aspect, 1);
		}
	});

	it("draws the same device for any video, so only Scale changes its size", () => {
		const wide = computeFramedCompositeLayout({ ...base, deviceFrame: frame({ kind: "phone" }) })!;
		const tall = computeFramedCompositeLayout({
			...base,
			screenSize: { width: 390, height: 844 },
			deviceFrame: frame({ kind: "phone" }),
		})!;
		expect(tall.deviceFrame!.bounds).toEqual(wide.deviceFrame!.bounds);

		const smaller = computeFramedCompositeLayout({
			...base,
			maxContentSize: { width: 768, height: 432 },
			deviceFrame: frame({ kind: "phone" }),
		})!;
		expect(smaller.deviceFrame!.bounds.height).toBeCloseTo(wide.deviceFrame!.bounds.height / 2, -1);
	});

	it("fills the screen with the video and lets the mask crop the overflow", () => {
		const layout = computeFramedCompositeLayout({
			...base,
			deviceFrame: frame({ kind: "phone", fit: "fill" }),
		})!;
		expect(layout.screenCover).toBe(true);
		expect(layout.screenRect).toEqual(layout.deviceFrame!.screen);
		expect(layout.videoRadius).toBe(layout.deviceFrame!.screenRadius);
	});

	it("fits the whole video inside the screen when asked to", () => {
		const layout = computeFramedCompositeLayout({
			...base,
			deviceFrame: frame({ kind: "phone", fit: "fit" }),
		})!;
		const screen = layout.deviceFrame!.screen;
		const video = layout.screenRect;
		expect(layout.screenCover).toBeUndefined();
		// The landscape video spans the phone's width and is centred with bars above and below.
		expect(video.width / video.height).toBeCloseTo(1280 / 720, 1);
		expect(Math.abs(video.width - screen.width)).toBeLessThanOrEqual(1);
		expect(video.height).toBeLessThan(screen.height);
		expect(
			Math.abs(video.y + video.height / 2 - (screen.y + screen.height / 2)),
		).toBeLessThanOrEqual(1);
		// Far from the rounded corners, so it needs no rounding of its own.
		expect(layout.videoRadius).toBe(0);
	});

	it("keeps a fitted video inside the rounded glass when it nearly fills the screen", () => {
		const exact = computeFramedCompositeLayout({
			...base,
			screenSize: { width: 900, height: 1950 },
			deviceFrame: frame({ kind: "phone", fit: "fit" }),
		})!;
		expect(exact.videoRadius).toBeCloseTo(exact.deviceFrame!.screenRadius, 0);

		const slightlyWide = computeFramedCompositeLayout({
			...base,
			screenSize: { width: 900, height: 1900 },
			deviceFrame: frame({ kind: "phone", fit: "fit" }),
		})!;
		expect(slightlyWide.videoRadius!).toBeGreaterThan(0);
		expect(slightlyWide.videoRadius!).toBeLessThan(slightlyWide.deviceFrame!.screenRadius);
	});

	it("lets a browser window take the shape of the video", () => {
		const layout = computeFramedCompositeLayout({
			...base,
			screenSize: { width: 390, height: 844 },
			deviceFrame: frame({ kind: "browser" }),
		})!;
		expect(layout.screenRect.width / layout.screenRect.height).toBeCloseTo(390 / 844, 2);
		expect(layout.deviceFrame!.screen).toEqual(layout.screenRect);
		expect(layout.screenCover).toBeUndefined();
	});

	it("leaves full-bleed camera layouts unframed", () => {
		const stacked = computeFramedCompositeLayout({
			canvasSize: { width: 1080, height: 1920 },
			screenSize: { width: 1920, height: 1080 },
			webcamSize: { width: 1280, height: 720 },
			layoutPreset: "vertical-stack",
			deviceFrame: frame({ kind: "phone" }),
		});
		expect(stacked).not.toBeNull();
		expect(stacked!.deviceFrame).toBeNull();
	});

	it("keeps a full-bleed layout unframed on frames where the camera has no picture", () => {
		const params = {
			canvasSize: { width: 1920, height: 1080 },
			screenSize: { width: 1920, height: 1080 },
			webcamSize: null,
			layoutPreset: "dual-frame" as const,
			deviceFrame: frame({ kind: "phone" }),
		};
		// The exporter lays such frames out without the camera, yet the project has one.
		expect(
			computeFramedCompositeLayout({ ...params, webcamPresent: true })!.deviceFrame,
		).toBeNull();
		// With no camera track at all the preset means nothing, and the device is drawn.
		expect(
			computeFramedCompositeLayout({ ...params, webcamPresent: false })!.deviceFrame,
		).not.toBeNull();
		expect(computeFramedCompositeLayout(params)!.deviceFrame).not.toBeNull();
	});

	it("holds the phone as its orientation says, not as the video happens to be shaped", () => {
		const cameraOf = (orientation: "portrait" | "landscape") =>
			computeFramedCompositeLayout({
				...base,
				// A landscape video: the phone used to turn to follow it.
				deviceFrame: frame({ kind: "phone", orientation, cameraSide: "left" }),
			})!.deviceFrame!.front[0];
		const upright = cameraOf("portrait");
		const sideways = cameraOf("landscape");
		expect(upright.type).toBe("roundRect");
		expect(sideways.type).toBe("roundRect");
		if (upright.type === "roundRect") expect(upright.width).toBeGreaterThan(upright.height);
		if (sideways.type === "roundRect") expect(sideways.height).toBeGreaterThan(sideways.width);
	});

	it("returns null when the layout itself cannot be computed", () => {
		expect(
			computeFramedCompositeLayout({
				canvasSize: { width: 0, height: 0 },
				screenSize: { width: 1280, height: 720 },
				webcamSize: { width: 1280, height: 720 },
				deviceFrame: frame({ kind: "tablet" }),
			}),
		).toBeNull();
	});
});

describe("paintDeviceShapes", () => {
	function fakeGraphics() {
		return {
			clear: vi.fn(),
			roundRect: vi.fn(),
			circle: vi.fn(),
			poly: vi.fn(),
			fill: vi.fn(),
			stroke: vi.fn(),
		};
	}

	it("clears the layer even when there is nothing to draw", () => {
		const graphics = fakeGraphics();
		paintDeviceShapes(graphics, undefined);
		expect(graphics.clear).toHaveBeenCalledTimes(1);
		expect(graphics.fill).not.toHaveBeenCalled();
	});

	it("fills each shape with its own colour, in order", () => {
		const graphics = fakeGraphics();
		paintDeviceShapes(graphics, [
			{ type: "roundRect", x: 1, y: 2, width: 30, height: 40, radius: 5, color: 0x111111 },
			{ type: "circle", x: 9, y: 8, radius: 7, color: 0x222222 },
		]);
		expect(graphics.roundRect).toHaveBeenCalledWith(1, 2, 30, 40, 5);
		expect(graphics.circle).toHaveBeenCalledWith(9, 8, 7);
		expect(graphics.fill.mock.calls).toEqual([[{ color: 0x111111 }], [{ color: 0x222222 }]]);
	});

	it("fills with a gradient, a see-through colour, or only an outline as asked", () => {
		const graphics = fakeGraphics();
		const gradient = {
			type: "linear" as const,
			from: [0, 0] as [number, number],
			to: [0, 1] as [number, number],
			stops: [
				{ offset: 0, color: 0xffffff },
				{ offset: 1, color: 0x000000 },
			],
		};
		paintDeviceShapes(graphics, [
			{
				type: "roundRect",
				x: 0,
				y: 0,
				width: 10,
				height: 10,
				radius: 2,
				color: 0x888888,
				gradient,
			},
			{ type: "circle", x: 5, y: 5, radius: 3, color: 0x000000, alpha: 0.25 },
			{
				type: "poly",
				points: [0, 0, 4, 4, 0, 8],
				color: 0x555555,
				hollow: true,
				stroke: { width: 1, color: 0x555555 },
			},
		]);
		expect(graphics.fill).toHaveBeenCalledTimes(2);
		expect(graphics.fill.mock.calls[0][0]).toBeInstanceOf(FillGradient);
		expect(graphics.fill.mock.calls[1][0]).toEqual({ color: 0x000000, alpha: 0.25 });
		expect(graphics.poly).toHaveBeenCalledWith([0, 0, 4, 4, 0, 8], false);
		expect(graphics.stroke).toHaveBeenCalledWith({ width: 1, color: 0x555555 });
	});

	it("builds each gradient once, however often the frame is repainted", () => {
		const graphics = fakeGraphics();
		const layout = layoutDeviceFrame(
			{ x: 0, y: 0, width: 390, height: 844 },
			frame({ kind: "phone" }),
		)!;
		paintDeviceShapes(graphics, layout.back);
		const first = graphics.fill.mock.calls.map(([style]) => style);
		graphics.fill.mockClear();
		paintDeviceShapes(graphics, layout.back);
		const second = graphics.fill.mock.calls.map(([style]) => style);
		const gradients = first.filter((style) => style instanceof FillGradient);
		expect(gradients.length).toBeGreaterThan(0);
		first.forEach((style, index) => {
			if (style instanceof FillGradient) expect(second[index]).toBe(style);
		});
	});
});
