import {
	computeCompositeLayout,
	type RenderRect,
	type Size,
	type WebcamCompositeLayout,
	type WebcamLayoutPreset,
} from "./compositeLayout";

/**
 * Device mockups: a frame drawn around the video so a clip reads as "this is a phone
 * screen" or "this is a browser window".
 *
 * A phone, a tablet and a laptop have the screen proportions of the real thing. The
 * device never stretches to suit the video: it can only be scaled as a whole, and the
 * video either fills its screen (cropped to it) or fits inside it (with black bars).
 * A browser window has no standard size, so it alone takes the shape of the video.
 *
 * Everything here is plain geometry: the preview and the exporter both lay the frame
 * out through this module and paint the resulting shapes, which is what keeps the two
 * identical.
 */

export const DEVICE_FRAME_KINDS = ["none", "phone", "tablet", "laptop", "browser"] as const;
export type DeviceFrameKind = (typeof DEVICE_FRAME_KINDS)[number];

export const DEVICE_FRAME_COLORS = ["graphite", "silver", "black", "white"] as const;
export type DeviceFrameColor = (typeof DEVICE_FRAME_COLORS)[number];

export const DEVICE_CAMERAS = ["island", "hole", "notch", "none"] as const;
export type DeviceCamera = (typeof DEVICE_CAMERAS)[number];

export type DeviceCameraSide = "left" | "right";

export const DEVICE_ORIENTATIONS = ["portrait", "landscape"] as const;
export type DeviceOrientation = (typeof DEVICE_ORIENTATIONS)[number];

export const DEVICE_VIDEO_FITS = ["fill", "fit"] as const;
/** `fill` crops the video to the screen; `fit` shows all of it, with bars if needed. */
export type DeviceVideoFit = (typeof DEVICE_VIDEO_FITS)[number];

export interface DeviceFrameSettings {
	kind: DeviceFrameKind;
	color: DeviceFrameColor;
	/** Front-camera cutout drawn over the screen. Phones only. */
	camera: DeviceCamera;
	/** Which end of a landscape phone carries the camera. */
	cameraSide: DeviceCameraSide;
	/** How a phone or tablet is held. A laptop is always landscape. */
	orientation: DeviceOrientation;
	/** How the video is placed on a screen whose shape it does not share. */
	fit: DeviceVideoFit;
}

export const DEFAULT_DEVICE_FRAME: DeviceFrameSettings = {
	kind: "none",
	color: "graphite",
	camera: "island",
	cameraSide: "left",
	orientation: "portrait",
	fit: "fill",
};

/** The way each device is usually shown; applied when the device is picked. */
export const DEFAULT_DEVICE_ORIENTATION: Record<DeviceFrameKind, DeviceOrientation> = {
	none: "portrait",
	phone: "portrait",
	tablet: "landscape",
	laptop: "landscape",
	browser: "landscape",
};

// Screen proportions (width / height, held upright) of the devices the mockups stand for.
const PHONE_SCREEN_ASPECT = 9 / 19.5; // current iPhones and most Android flagships
const TABLET_SCREEN_ASPECT = 1640 / 2360; // 11-inch iPad
const LAPTOP_SCREEN_ASPECT = 16 / 10; // MacBook

/**
 * Width / height of the device's screen as it is held, or `null` for a device that has
 * no fixed screen and follows the video instead (a browser window).
 */
export function getDeviceScreenAspect(
	settings: Pick<DeviceFrameSettings, "kind" | "orientation">,
): number | null {
	if (settings.kind === "laptop") return LAPTOP_SCREEN_ASPECT;
	if (settings.kind !== "phone" && settings.kind !== "tablet") return null;
	const upright = settings.kind === "phone" ? PHONE_SCREEN_ASPECT : TABLET_SCREEN_ASPECT;
	return settings.orientation === "landscape" ? 1 / upright : upright;
}

/** Whether the device can be turned: a laptop and a browser window cannot. */
export function canRotateDevice(kind: DeviceFrameKind): boolean {
	return kind === "phone" || kind === "tablet";
}

export const DEVICE_FRAME_LABELS: Record<DeviceFrameKind, string> = {
	none: "No device",
	phone: "Phone",
	tablet: "Tablet",
	laptop: "Laptop",
	browser: "Browser window",
};

export const DEVICE_COLOR_LABELS: Record<DeviceFrameColor, string> = {
	graphite: "Graphite",
	silver: "Silver",
	black: "Black",
	white: "White",
};

export const DEVICE_CAMERA_LABELS: Record<DeviceCamera, string> = {
	island: "Island",
	hole: "Hole",
	notch: "Notch",
	none: "None",
};

function includes<T extends string>(values: readonly T[], value: unknown): value is T {
	return typeof value === "string" && (values as readonly string[]).includes(value);
}

export function normalizeDeviceFrame(value: unknown): DeviceFrameSettings {
	if (!value || typeof value !== "object") return { ...DEFAULT_DEVICE_FRAME };
	const raw = value as Record<string, unknown>;
	const kind = includes(DEVICE_FRAME_KINDS, raw.kind) ? raw.kind : DEFAULT_DEVICE_FRAME.kind;
	return {
		kind,
		color: includes(DEVICE_FRAME_COLORS, raw.color) ? raw.color : DEFAULT_DEVICE_FRAME.color,
		camera: includes(DEVICE_CAMERAS, raw.camera) ? raw.camera : DEFAULT_DEVICE_FRAME.camera,
		cameraSide: raw.cameraSide === "right" ? "right" : "left",
		// A project saved before devices had fixed screens has neither field. It showed
		// the whole video, so it opens the way that device is usually held, with the video
		// fitted rather than cropped.
		orientation: includes(DEVICE_ORIENTATIONS, raw.orientation)
			? raw.orientation
			: DEFAULT_DEVICE_ORIENTATION[kind],
		fit: includes(DEVICE_VIDEO_FITS, raw.fit)
			? raw.fit
			: raw.fit === undefined && kind !== "none"
				? "fit"
				: DEFAULT_DEVICE_FRAME.fit,
	};
}

export function hasDeviceFrame(settings?: DeviceFrameSettings | null): boolean {
	return Boolean(settings && settings.kind !== "none");
}

/** Camera layouts where the recording fills its slot edge to edge: no room for a frame. */
export function isFullBleedCameraLayout(preset?: WebcamLayoutPreset | null): boolean {
	return preset === "vertical-stack" || preset === "dual-frame";
}

export type DeviceShape =
	| {
			type: "roundRect";
			x: number;
			y: number;
			width: number;
			height: number;
			radius: number;
			color: number;
	  }
	| { type: "circle"; x: number; y: number; radius: number; color: number };

export interface DeviceFrameLayout {
	kind: Exclude<DeviceFrameKind, "none">;
	/** Where the video sits. */
	screen: RenderRect;
	/** Corner radius the video is clipped to so it follows the device's screen. */
	screenRadius: number;
	/** Outer bounds of everything the frame draws. */
	bounds: RenderRect;
	/** Painted behind the video, in order. */
	back: DeviceShape[];
	/** Painted over the video, in order. */
	front: DeviceShape[];
}

type FramedKind = Exclude<DeviceFrameKind, "none">;

interface Insets {
	top: number;
	right: number;
	bottom: number;
	left: number;
}

// Every measurement below is a fraction of the screen's shorter side, so a frame keeps
// its proportions at any preview or export size.
const PHONE = { band: 0.012, bezel: 0.03, screenRadius: 0.09, button: 0.006 };
const TABLET = { band: 0.01, bezel: 0.046, screenRadius: 0.03 };
const LAPTOP = {
	side: 0.03,
	top: 0.046,
	bottom: 0.04,
	rim: 0.006,
	lidRadius: 0.034,
	screenRadius: 0.012,
	baseOverhang: 0.085,
	baseHeight: 0.05,
	baseOverlap: 0.004,
};
const BROWSER = { bar: 0.085, border: 0.008, radius: 0.03 };

const INSETS: Record<FramedKind, Insets> = {
	phone: uniform(PHONE.band + PHONE.bezel + PHONE.button),
	tablet: uniform(TABLET.band + TABLET.bezel),
	laptop: {
		top: LAPTOP.top,
		right: LAPTOP.side + LAPTOP.baseOverhang,
		bottom: LAPTOP.bottom + LAPTOP.baseHeight - LAPTOP.baseOverlap,
		left: LAPTOP.side + LAPTOP.baseOverhang,
	},
	browser: {
		top: BROWSER.bar,
		right: BROWSER.border,
		bottom: BROWSER.border,
		left: BROWSER.border,
	},
};

function uniform(value: number): Insets {
	return { top: value, right: value, bottom: value, left: value };
}

interface Palette {
	/** The metal band / lid / window chrome. */
	band: number;
	/** A darker tone of the band for buttons and edges. */
	shade: number;
	/** Address field inside a browser bar. */
	field: number;
}

const PALETTES: Record<DeviceFrameColor, Palette> = {
	graphite: { band: 0x55565b, shade: 0x38393d, field: 0x3d3e43 },
	silver: { band: 0xdcdde0, shade: 0xb7b8bc, field: 0xf6f6f7 },
	black: { band: 0x1f1f22, shade: 0x101012, field: 0x2f2f33 },
	white: { band: 0xf5f3ef, shade: 0xd8d5cf, field: 0xe6e3de },
};

/** Glass and bezels are black whatever the body colour, as on real devices. */
const BEZEL_COLOR = 0x060607;
const LENS_COLOR = 0x1b1b22;
const TRAFFIC_LIGHTS = [0xff5f57, 0xfebc2e, 0x28c840];

/**
 * Shrinks the box the video may occupy so that the frame around it still fits in the
 * original box. Insets scale with the screen, so the reduction is a per-axis factor.
 */
export function shrinkContentBoxForDevice(
	maxContentSize: Size,
	screenSize: Size,
	kind: FramedKind,
): Size {
	const insets = INSETS[kind];
	const shortSide = Math.min(screenSize.width, screenSize.height);
	if (shortSide <= 0) return maxContentSize;
	return {
		width:
			(maxContentSize.width * screenSize.width) /
			(screenSize.width + (insets.left + insets.right) * shortSide),
		height:
			(maxContentSize.height * screenSize.height) /
			(screenSize.height + (insets.top + insets.bottom) * shortSide),
	};
}

/**
 * Moves the screen so the device as a whole — not just its screen — is centred. Only
 * asymmetric frames (a browser bar on top, a laptop base below) shift anything.
 */
export function offsetScreenForDevice(screen: RenderRect, kind: FramedKind): RenderRect {
	const insets = INSETS[kind];
	const shortSide = Math.min(screen.width, screen.height);
	return {
		...screen,
		x: screen.x + Math.round(((insets.left - insets.right) / 2) * shortSide),
		y: screen.y + Math.round(((insets.top - insets.bottom) / 2) * shortSide),
	};
}

function roundRect(
	x: number,
	y: number,
	width: number,
	height: number,
	radius: number,
	color: number,
): DeviceShape {
	return {
		type: "roundRect",
		x,
		y,
		width,
		height,
		radius: Math.max(0, Math.min(radius, width / 2, height / 2)),
		color,
	};
}

function circle(x: number, y: number, radius: number, color: number): DeviceShape {
	return { type: "circle", x, y, radius, color };
}

function expand(rect: RenderRect, by: number): RenderRect {
	return {
		x: rect.x - by,
		y: rect.y - by,
		width: rect.width + by * 2,
		height: rect.height + by * 2,
	};
}

function layoutPhone(
	screen: RenderRect,
	settings: DeviceFrameSettings,
	palette: Palette,
	portrait: boolean,
): Pick<DeviceFrameLayout, "back" | "front" | "screenRadius"> {
	const u = Math.min(screen.width, screen.height);
	const screenRadius = PHONE.screenRadius * u;
	const bezel = expand(screen, PHONE.bezel * u);
	const band = expand(bezel, PHONE.band * u);
	const buttonDepth = (PHONE.button + PHONE.band) * u;
	const back: DeviceShape[] = [];

	// Side buttons sit on the long edges and peek out from behind the band.
	const longSide = portrait ? band.height : band.width;
	const buttons: Array<{ start: number; length: number; far: boolean }> = [
		{ start: 0.2, length: 0.07, far: false },
		{ start: 0.29, length: 0.07, far: false },
		{ start: 0.27, length: 0.11, far: true },
	];
	for (const button of buttons) {
		const along = button.start * longSide;
		const length = button.length * longSide;
		back.push(
			portrait
				? roundRect(
						button.far ? band.x + band.width - PHONE.band * u : band.x - PHONE.button * u,
						band.y + along,
						buttonDepth,
						length,
						buttonDepth / 2,
						palette.shade,
					)
				: roundRect(
						band.x + along,
						button.far ? band.y - PHONE.button * u : band.y + band.height - PHONE.band * u,
						length,
						buttonDepth,
						buttonDepth / 2,
						palette.shade,
					),
		);
	}

	back.push(
		roundRect(
			band.x,
			band.y,
			band.width,
			band.height,
			screenRadius + (PHONE.bezel + PHONE.band) * u,
			palette.band,
		),
		roundRect(
			bezel.x,
			bezel.y,
			bezel.width,
			bezel.height,
			screenRadius + PHONE.bezel * u,
			BEZEL_COLOR,
		),
	);

	const front: DeviceShape[] = [];
	const centerX = screen.x + screen.width / 2;
	const centerY = screen.y + screen.height / 2;
	// In landscape the camera end is the left or right short edge.
	const nearLeft = settings.cameraSide === "left";

	if (settings.camera === "island") {
		const long = 0.27 * u;
		const short = 0.078 * u;
		const gap = 0.028 * u;
		if (portrait) {
			front.push(
				roundRect(centerX - long / 2, screen.y + gap, long, short, short / 2, BEZEL_COLOR),
			);
			front.push(circle(centerX + long * 0.3, screen.y + gap + short / 2, 0.012 * u, LENS_COLOR));
		} else {
			const x = nearLeft ? screen.x + gap : screen.x + screen.width - gap - short;
			front.push(roundRect(x, centerY - long / 2, short, long, short / 2, BEZEL_COLOR));
			front.push(circle(x + short / 2, centerY - long * 0.3, 0.012 * u, LENS_COLOR));
		}
	} else if (settings.camera === "hole") {
		const radius = 0.021 * u;
		const offset = 0.052 * u;
		const x = portrait ? centerX : nearLeft ? screen.x + offset : screen.x + screen.width - offset;
		const y = portrait ? screen.y + offset : centerY;
		front.push(circle(x, y, radius, BEZEL_COLOR), circle(x, y, radius * 0.45, LENS_COLOR));
	} else if (settings.camera === "notch") {
		const long = 0.42 * u;
		const depth = 0.072 * u;
		const radius = 0.036 * u;
		// The notch starts a radius outside the screen so only its inner corners round.
		if (portrait) {
			front.push(
				roundRect(centerX - long / 2, screen.y - radius, long, depth + radius, radius, BEZEL_COLOR),
			);
		} else {
			const x = nearLeft ? screen.x - radius : screen.x + screen.width - depth;
			front.push(roundRect(x, centerY - long / 2, depth + radius, long, radius, BEZEL_COLOR));
		}
	}

	return { back, front, screenRadius };
}

function layoutTablet(
	screen: RenderRect,
	palette: Palette,
): Pick<DeviceFrameLayout, "back" | "front" | "screenRadius"> {
	const u = Math.min(screen.width, screen.height);
	const screenRadius = TABLET.screenRadius * u;
	const bezel = expand(screen, TABLET.bezel * u);
	const band = expand(bezel, TABLET.band * u);
	return {
		screenRadius,
		back: [
			roundRect(
				band.x,
				band.y,
				band.width,
				band.height,
				screenRadius + (TABLET.bezel + TABLET.band) * u,
				palette.band,
			),
			roundRect(
				bezel.x,
				bezel.y,
				bezel.width,
				bezel.height,
				screenRadius + TABLET.bezel * u,
				BEZEL_COLOR,
			),
			// The camera lives in the bezel, so it never covers the picture.
			circle(screen.x + screen.width / 2, screen.y - (TABLET.bezel * u) / 2, 0.008 * u, LENS_COLOR),
		],
		front: [],
	};
}

function layoutLaptop(
	screen: RenderRect,
	palette: Palette,
): Pick<DeviceFrameLayout, "back" | "front" | "screenRadius"> {
	const u = Math.min(screen.width, screen.height);
	const lid: RenderRect = {
		x: screen.x - LAPTOP.side * u,
		y: screen.y - LAPTOP.top * u,
		width: screen.width + LAPTOP.side * u * 2,
		height: screen.height + (LAPTOP.top + LAPTOP.bottom) * u,
	};
	const glass = expand(lid, -LAPTOP.rim * u);
	const base: RenderRect = {
		x: lid.x - LAPTOP.baseOverhang * u,
		y: lid.y + lid.height - LAPTOP.baseOverlap * u,
		width: lid.width + LAPTOP.baseOverhang * u * 2,
		height: LAPTOP.baseHeight * u,
	};
	const scoopWidth = lid.width * 0.16;
	return {
		screenRadius: LAPTOP.screenRadius * u,
		back: [
			roundRect(lid.x, lid.y, lid.width, lid.height, LAPTOP.lidRadius * u, palette.band),
			roundRect(
				glass.x,
				glass.y,
				glass.width,
				glass.height,
				(LAPTOP.lidRadius - LAPTOP.rim) * u,
				BEZEL_COLOR,
			),
			circle(screen.x + screen.width / 2, screen.y - (LAPTOP.top * u) / 2, 0.006 * u, LENS_COLOR),
			roundRect(base.x, base.y, base.width, base.height, base.height * 0.45, palette.band),
			// Lower lip in a darker tone gives the base its thickness.
			roundRect(
				base.x,
				base.y + base.height * 0.58,
				base.width,
				base.height * 0.42,
				base.height * 0.42,
				palette.shade,
			),
			// The thumb scoop for opening the lid.
			roundRect(
				screen.x + screen.width / 2 - scoopWidth / 2,
				base.y,
				scoopWidth,
				0.014 * u,
				0.007 * u,
				palette.shade,
			),
		],
		front: [],
	};
}

function layoutBrowser(
	screen: RenderRect,
	palette: Palette,
): Pick<DeviceFrameLayout, "back" | "front" | "screenRadius"> {
	const u = Math.min(screen.width, screen.height);
	const bar = BROWSER.bar * u;
	const border = BROWSER.border * u;
	const windowRect: RenderRect = {
		x: screen.x - border,
		y: screen.y - bar,
		width: screen.width + border * 2,
		height: screen.height + bar + border,
	};
	const barCenterY = windowRect.y + bar / 2;
	const lightsStart = windowRect.x + 0.05 * u;
	const lightsStep = 0.04 * u;
	// The address field stays centred but never runs into the window buttons.
	const centerX = windowRect.x + windowRect.width / 2;
	const lightsEnd = lightsStart + lightsStep * 2 + 0.05 * u;
	const fieldWidth = Math.min(windowRect.width * 0.46, (centerX - lightsEnd) * 2);
	const fieldHeight = 0.046 * u;
	const back: DeviceShape[] = [
		roundRect(
			windowRect.x,
			windowRect.y,
			windowRect.width,
			windowRect.height,
			BROWSER.radius * u,
			palette.band,
		),
		...TRAFFIC_LIGHTS.map((color, index) =>
			circle(lightsStart + index * lightsStep, barCenterY, 0.0125 * u, color),
		),
		roundRect(
			centerX - fieldWidth / 2,
			barCenterY - fieldHeight / 2,
			fieldWidth,
			fieldHeight,
			fieldHeight / 2,
			palette.field,
		),
	];

	return { back, front: [], screenRadius: Math.max(0, (BROWSER.radius - BROWSER.border) * u) };
}

/**
 * Lays a frame out around `screen`. Returns `null` when no device is selected.
 *
 * `portrait` says which way a phone is held. Pass it from the video's own size: the
 * screen rectangle is rounded to whole pixels, so for a nearly square video the preview
 * and the export could otherwise disagree about where the camera goes.
 */
export function layoutDeviceFrame(
	screen: RenderRect,
	settings: DeviceFrameSettings,
	portrait: boolean = screen.height >= screen.width,
): DeviceFrameLayout | null {
	if (settings.kind === "none" || screen.width <= 0 || screen.height <= 0) return null;
	const kind = settings.kind;
	const palette = PALETTES[settings.color];
	const parts =
		kind === "phone"
			? layoutPhone(screen, settings, palette, portrait)
			: kind === "tablet"
				? layoutTablet(screen, palette)
				: kind === "laptop"
					? layoutLaptop(screen, palette)
					: layoutBrowser(screen, palette);

	const insets = INSETS[kind];
	const u = Math.min(screen.width, screen.height);
	return {
		kind,
		screen,
		bounds: {
			x: screen.x - insets.left * u,
			y: screen.y - insets.top * u,
			width: screen.width + (insets.left + insets.right) * u,
			height: screen.height + (insets.top + insets.bottom) * u,
		},
		...parts,
		// Behind the picture the screen is black, like a display that is switched off.
		back: [
			...parts.back,
			roundRect(screen.x, screen.y, screen.width, screen.height, parts.screenRadius, BEZEL_COLOR),
		],
	};
}

export interface FramedCompositeLayout extends WebcamCompositeLayout {
	deviceFrame: DeviceFrameLayout | null;
	/**
	 * Corner radius for the video when a device is drawn; replaces the user's own
	 * rounding. On a filled screen it is the screen's radius; a video that only fits
	 * the screen gets what is left of that radius where it reaches the corners.
	 */
	videoRadius?: number;
}

/** The largest rectangle of `size`'s proportions that fits inside `box`, centred. */
function containRect(size: Size, box: RenderRect): RenderRect {
	const scale = Math.min(box.width / size.width, box.height / size.height);
	const width = Math.round(size.width * scale);
	const height = Math.round(size.height * scale);
	return {
		x: Math.round(box.x + (box.width - width) / 2),
		y: Math.round(box.y + (box.height - height) / 2),
		width,
		height,
	};
}

/**
 * `computeCompositeLayout` plus a device frame. The device takes the room the video
 * had (so Scale sizes the device as a whole) and keeps its own screen proportions; the
 * video is then placed on that screen. Full-bleed webcam layouts (stacked, dual frame)
 * fill their slot edge to edge, so they keep their normal layout and get no frame.
 */
export function computeFramedCompositeLayout(
	params: Parameters<typeof computeCompositeLayout>[0] & {
		deviceFrame?: DeviceFrameSettings | null;
		/**
		 * The project has a camera track, whether or not this frame has a picture from
		 * it. The exporter lays camera-less frames out without the camera; a full-bleed
		 * layout must stay unframed on those too, or the device would flash in and out.
		 */
		webcamPresent?: boolean;
	},
): FramedCompositeLayout | null {
	const { deviceFrame, webcamPresent, ...layoutParams } = params;
	const unframed = () => {
		const layout = computeCompositeLayout(layoutParams);
		return layout ? { ...layout, deviceFrame: null } : null;
	};
	if (!deviceFrame || deviceFrame.kind === "none") return unframed();
	const hasCamera = webcamPresent ?? Boolean(layoutParams.webcamSize);
	if (hasCamera && isFullBleedCameraLayout(layoutParams.layoutPreset)) return unframed();

	const kind = deviceFrame.kind;
	const videoSize = layoutParams.screenSize;
	const screenAspect = getDeviceScreenAspect(deviceFrame);
	// A fixed screen is laid out in place of the video; only its proportions matter here.
	const deviceScreenSize: Size = screenAspect
		? { width: 1000 * screenAspect, height: 1000 }
		: videoSize;
	const layout = computeCompositeLayout({
		...layoutParams,
		screenSize: deviceScreenSize,
		maxContentSize: shrinkContentBoxForDevice(
			layoutParams.maxContentSize ?? layoutParams.canvasSize,
			deviceScreenSize,
			kind,
		),
	});
	if (!layout || layout.screenCover || layout.screenBorderRadius != null) return unframed();

	const deviceScreen = offsetScreenForDevice(layout.screenRect, kind);
	// Orientation comes from the device (or, for a window, from the video itself), never
	// from the rounded rectangle, so preview and export cannot disagree near a square.
	const portrait = screenAspect ? screenAspect <= 1 : videoSize.height >= videoSize.width;
	const frame = layoutDeviceFrame(deviceScreen, deviceFrame, portrait);
	if (!frame) return unframed();

	if (!screenAspect || deviceFrame.fit === "fill") {
		// The video covers the whole screen; whatever does not fit is cropped by the mask.
		return {
			...layout,
			screenRect: deviceScreen,
			screenCover: screenAspect ? true : undefined,
			videoRadius: frame.screenRadius,
			deviceFrame: frame,
		};
	}

	// Fit: all of the video, centred, on the dark screen. Its corners keep only the part
	// of the screen's rounding they actually reach, which keeps them inside the glass.
	if (videoSize.width <= 0 || videoSize.height <= 0) return unframed();
	const videoRect = containRect(videoSize, deviceScreen);
	const inset = Math.max(videoRect.x - deviceScreen.x, videoRect.y - deviceScreen.y);
	return {
		...layout,
		screenRect: videoRect,
		videoRadius: Math.max(0, frame.screenRadius - inset),
		deviceFrame: frame,
	};
}

/** The slice of Pixi's `Graphics` the frame painter needs; lets tests pass a fake. */
interface FrameGraphics {
	clear(): unknown;
	roundRect(x: number, y: number, width: number, height: number, radius: number): unknown;
	circle(x: number, y: number, radius: number): unknown;
	fill(style: { color: number }): unknown;
}

export function paintDeviceShapes(graphics: FrameGraphics, shapes: DeviceShape[] | undefined) {
	graphics.clear();
	for (const shape of shapes ?? []) {
		if (shape.type === "circle") {
			graphics.circle(shape.x, shape.y, shape.radius);
		} else {
			graphics.roundRect(shape.x, shape.y, shape.width, shape.height, shape.radius);
		}
		graphics.fill({ color: shape.color });
	}
}
