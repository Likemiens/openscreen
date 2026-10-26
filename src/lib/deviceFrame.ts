import { Color, FillGradient } from "pixi.js";
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

/** A colour stop; `offset` runs 0–1 along the gradient. */
export interface GradientStop {
	offset: number;
	color: number;
	alpha?: number;
}

/**
 * A gradient laid out in the shape's own box (0–1 on both axes), so it stretches with
 * the shape at any size. A radial one is centred on the shape and reaches its edges.
 */
export type ShapeGradient =
	| { type: "linear"; from: [number, number]; to: [number, number]; stops: GradientStop[] }
	| { type: "radial"; stops: GradientStop[] };

export interface ShapePaint {
	/** The fill; with a gradient, the colour it is closest to. */
	color: number;
	alpha?: number;
	gradient?: ShapeGradient;
	stroke?: { width: number; color: number; alpha?: number };
	/** Only the outline is drawn. */
	hollow?: boolean;
	/** What the shape is (for tests and debugging). */
	part?: string;
}

export type DeviceShape =
	| ({
			type: "roundRect";
			x: number;
			y: number;
			width: number;
			height: number;
			radius: number;
	  } & ShapePaint)
	| ({ type: "circle"; x: number; y: number; radius: number } & ShapePaint)
	| ({ type: "poly"; points: number[] } & ShapePaint);

export interface DeviceFrameLayout {
	kind: Exclude<DeviceFrameKind, "none">;
	/** Where the video sits. */
	screen: RenderRect;
	/** Corner radius the video is clipped to so it follows the device's screen. */
	screenRadius: number;
	/** Outer bounds of the device itself (its shadow may reach past them). */
	bounds: RenderRect;
	/** Soft shadow the device casts on the background; painted first. */
	shadow: DeviceShape[];
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
const PHONE = { band: 0.014, bezel: 0.03, screenRadius: 0.09, button: 0.006 };
const TABLET = { band: 0.011, bezel: 0.046, screenRadius: 0.03 };
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
const BROWSER = { bar: 0.085, border: 0.003, radius: 0.03 };

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

/** A metal body: its darkest edge, its lit face, the shade it falls into, its glint. */
interface Material {
	edge: number;
	dark: number;
	base: number;
	light: number;
}

const MATERIALS: Record<DeviceFrameColor, Material> = {
	graphite: { edge: 0x1d1e21, dark: 0x3a3b3f, base: 0x5b5c61, light: 0xa3a4aa },
	silver: { edge: 0x8c8d92, dark: 0xb0b1b6, base: 0xdcdde0, light: 0xffffff },
	black: { edge: 0x080809, dark: 0x19191b, base: 0x2e2e31, light: 0x6c6d73 },
	white: { edge: 0xa7a39c, dark: 0xcfcbc4, base: 0xf1eee9, light: 0xffffff },
};

/** Browser window chrome, light or dark like the system appearance. */
interface Chrome {
	barTop: number;
	barBottom: number;
	line: number;
	field: number;
	fieldLine: number;
	icon: number;
	text: number;
}

const LIGHT_CHROME: Chrome = {
	barTop: 0xf6f6f8,
	barBottom: 0xebebee,
	line: 0xd2d2d7,
	field: 0xffffff,
	fieldLine: 0xdddde2,
	icon: 0x86868b,
	text: 0xbdbdc2,
};
const DARK_CHROME: Chrome = {
	barTop: 0x3a3a3d,
	barBottom: 0x2f2f32,
	line: 0x141416,
	field: 0x48484b,
	fieldLine: 0x525256,
	icon: 0x9a9a9f,
	text: 0x76767b,
};
const CHROMES: Record<DeviceFrameColor, Chrome> = {
	silver: LIGHT_CHROME,
	white: { ...LIGHT_CHROME, barTop: 0xfcfbf9, barBottom: 0xf1efec },
	graphite: DARK_CHROME,
	black: {
		...DARK_CHROME,
		barTop: 0x262628,
		barBottom: 0x1e1e20,
		field: 0x38383b,
		fieldLine: 0x414145,
	},
};

/** Glass and bezels are black whatever the body colour, as on real devices. */
const BEZEL_COLOR = 0x060607;
const CUTOUT_COLOR = 0x000000;
const LENS_COLOR = 0x1b1b22;
const TRAFFIC_LIGHTS: Array<[fill: number, rim: number]> = [
	[0xff5f57, 0xe0443e],
	[0xfebc2e, 0xdea123],
	[0x28c840, 0x1aab29],
];

const DOWN: [[number, number], [number, number]] = [
	[0.5, 0],
	[0.5, 1],
];
const ACROSS: [[number, number], [number, number]] = [
	[0, 0.5],
	[1, 0.5],
];
const DIAGONAL: [[number, number], [number, number]] = [
	[0, 0],
	[1, 1],
];

function linear(
	[from, to]: [[number, number], [number, number]],
	stops: Array<[offset: number, color: number, alpha?: number]>,
): ShapeGradient {
	return {
		type: "linear",
		from,
		to,
		stops: stops.map(([offset, color, alpha]) =>
			alpha === undefined ? { offset, color } : { offset, color, alpha },
		),
	};
}

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

function roundRect(rect: RenderRect, radius: number, paint: ShapePaint): DeviceShape {
	return {
		type: "roundRect",
		x: rect.x,
		y: rect.y,
		width: rect.width,
		height: rect.height,
		radius: Math.max(0, Math.min(radius, rect.width / 2, rect.height / 2)),
		...paint,
	};
}

function circle(x: number, y: number, radius: number, paint: ShapePaint): DeviceShape {
	return { type: "circle", x, y, radius, ...paint };
}

function expand(rect: RenderRect, by: number): RenderRect {
	return {
		x: rect.x - by,
		y: rect.y - by,
		width: rect.width + by * 2,
		height: rect.height + by * 2,
	};
}

/**
 * A polished metal rim of `width`: a dark outer edge, the band catching the light, and
 * a shaded lip where it turns in to meet the glass.
 */
function metalRim(outer: RenderRect, radius: number, width: number, m: Material): DeviceShape[] {
	const edge = width * 0.14;
	const lip = width * 0.62;
	return [
		roundRect(outer, radius, { color: m.edge, part: "body" }),
		roundRect(expand(outer, -edge), radius - edge, {
			color: m.base,
			gradient: linear(DIAGONAL, [
				[0, m.light],
				[0.22, m.base],
				[0.5, m.dark],
				[0.78, m.base],
				[1, m.light],
			]),
		}),
		roundRect(expand(outer, -lip), radius - lip, {
			color: m.dark,
			gradient: linear(DIAGONAL, [
				[0, m.dark],
				[0.5, m.base],
				[1, m.dark],
			]),
		}),
	];
}

/** Black glass with a faint reflection where it meets the rim. */
function glass(rect: RenderRect, radius: number, u: number): DeviceShape {
	return roundRect(rect, radius, {
		color: BEZEL_COLOR,
		gradient: linear(DOWN, [
			[0, 0x141416],
			[1, BEZEL_COLOR],
		]),
		stroke: { width: 0.0016 * u, color: 0x3c3c41, alpha: 0.9 },
		part: "glass",
	});
}

/** A camera lens: a dark well with a bluish glint. */
function lens(x: number, y: number, radius: number): DeviceShape[] {
	return [
		circle(x, y, radius, { color: 0x0a0a0e }),
		circle(x, y, radius * 0.62, {
			color: LENS_COLOR,
			gradient: {
				type: "radial",
				stops: [
					{ offset: 0, color: 0x46577a },
					{ offset: 0.5, color: 0x161c2c },
					{ offset: 1, color: 0x07070b },
				],
			},
		}),
	];
}

/** A metal key on the side of a phone, rounded across its width. */
function sideButton(rect: RenderRect, onLongEdgeX: boolean, m: Material): DeviceShape {
	const across = onLongEdgeX ? ACROSS : DOWN;
	return roundRect(rect, Math.min(rect.width, rect.height) / 2, {
		color: m.base,
		gradient: linear(across, [
			[0, m.dark],
			[0.35, m.light],
			[0.7, m.base],
			[1, m.dark],
		]),
		stroke: {
			width: Math.min(rect.width, rect.height) * 0.12,
			color: m.edge,
			alpha: 0.6,
		},
	});
}

/** A soft shadow under `rect`, built from faint layers that spread further each time. */
function softShadow(rect: RenderRect, radius: number, u: number, strength = 1): DeviceShape[] {
	const shapes: DeviceShape[] = [];
	const lowered = { ...rect, y: rect.y + 0.03 * u };
	for (let i = 0; i < 10; i += 1) {
		const spread = (i + 1) * 0.008 * u;
		shapes.push(
			roundRect(expand(lowered, spread - 0.02 * u), radius + spread, {
				color: 0x000000,
				alpha: 0.032 * strength,
				part: "shadow",
			}),
		);
	}
	return shapes;
}

type FrameParts = Pick<DeviceFrameLayout, "back" | "front" | "screenRadius" | "shadow">;

function layoutPhone(
	screen: RenderRect,
	settings: DeviceFrameSettings,
	m: Material,
	portrait: boolean,
): FrameParts {
	const u = Math.min(screen.width, screen.height);
	const screenRadius = PHONE.screenRadius * u;
	const bezel = expand(screen, PHONE.bezel * u);
	const body = expand(bezel, PHONE.band * u);
	const bodyRadius = screenRadius + (PHONE.bezel + PHONE.band) * u;
	const buttonDepth = (PHONE.button + PHONE.band) * u;
	const back: DeviceShape[] = [];

	// Side buttons sit on the long edges and peek out from behind the band: the action
	// button and the volume keys on one side, the side button on the other.
	const longSide = portrait ? body.height : body.width;
	const buttons: Array<{ start: number; length: number; far: boolean }> = [
		{ start: 0.165, length: 0.045, far: false },
		{ start: 0.235, length: 0.075, far: false },
		{ start: 0.33, length: 0.075, far: false },
		{ start: 0.27, length: 0.11, far: true },
	];
	for (const button of buttons) {
		const along = button.start * longSide;
		const length = button.length * longSide;
		back.push(
			portrait
				? sideButton(
						{
							x: button.far ? body.x + body.width - PHONE.band * u : body.x - PHONE.button * u,
							y: body.y + along,
							width: buttonDepth,
							height: length,
						},
						true,
						m,
					)
				: sideButton(
						{
							x: body.x + along,
							y: button.far ? body.y - PHONE.button * u : body.y + body.height - PHONE.band * u,
							width: length,
							height: buttonDepth,
						},
						false,
						m,
					),
		);
	}

	back.push(
		...metalRim(body, bodyRadius, PHONE.band * u, m),
		glass(bezel, screenRadius + PHONE.bezel * u, u),
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
		const lensRadius = 0.017 * u;
		if (portrait) {
			const y = screen.y + gap;
			front.push(
				roundRect({ x: centerX - long / 2, y, width: long, height: short }, short / 2, {
					color: CUTOUT_COLOR,
					part: "camera",
				}),
				...lens(centerX + long * 0.3, y + short / 2, lensRadius),
			);
		} else {
			const x = nearLeft ? screen.x + gap : screen.x + screen.width - gap - short;
			front.push(
				roundRect({ x, y: centerY - long / 2, width: short, height: long }, short / 2, {
					color: CUTOUT_COLOR,
					part: "camera",
				}),
				...lens(x + short / 2, centerY - long * 0.3, lensRadius),
			);
		}
	} else if (settings.camera === "hole") {
		const radius = 0.021 * u;
		const offset = 0.052 * u;
		const x = portrait ? centerX : nearLeft ? screen.x + offset : screen.x + screen.width - offset;
		const y = portrait ? screen.y + offset : centerY;
		front.push(
			circle(x, y, radius, { color: CUTOUT_COLOR, part: "camera" }),
			...lens(x, y, radius * 0.6),
		);
	} else if (settings.camera === "notch") {
		const long = 0.42 * u;
		const depth = 0.072 * u;
		const radius = 0.036 * u;
		// The notch starts a radius outside the screen so only its inner corners round.
		if (portrait) {
			front.push(
				roundRect(
					{ x: centerX - long / 2, y: screen.y - radius, width: long, height: depth + radius },
					radius,
					{ color: CUTOUT_COLOR, part: "camera" },
				),
				...lens(centerX + long * 0.22, screen.y + depth * 0.45, 0.014 * u),
			);
		} else {
			const x = nearLeft ? screen.x - radius : screen.x + screen.width - depth;
			front.push(
				roundRect({ x, y: centerY - long / 2, width: depth + radius, height: long }, radius, {
					color: CUTOUT_COLOR,
					part: "camera",
				}),
				...lens(
					nearLeft ? screen.x + depth * 0.45 : screen.x + screen.width - depth * 0.45,
					centerY - long * 0.22,
					0.014 * u,
				),
			);
		}
	}

	return { back, front, screenRadius, shadow: softShadow(body, bodyRadius, u) };
}

function layoutTablet(screen: RenderRect, m: Material): FrameParts {
	const u = Math.min(screen.width, screen.height);
	const screenRadius = TABLET.screenRadius * u;
	const bezel = expand(screen, TABLET.bezel * u);
	const body = expand(bezel, TABLET.band * u);
	const bodyRadius = screenRadius + (TABLET.bezel + TABLET.band) * u;
	return {
		screenRadius,
		shadow: softShadow(body, bodyRadius, u),
		back: [
			...metalRim(body, bodyRadius, TABLET.band * u, m),
			glass(bezel, screenRadius + TABLET.bezel * u, u),
			// The camera lives in the bezel, so it never covers the picture.
			...lens(screen.x + screen.width / 2, screen.y - (TABLET.bezel * u) / 2, 0.009 * u),
		],
		front: [],
	};
}

function layoutLaptop(screen: RenderRect, m: Material): FrameParts {
	const u = Math.min(screen.width, screen.height);
	const lid: RenderRect = {
		x: screen.x - LAPTOP.side * u,
		y: screen.y - LAPTOP.top * u,
		width: screen.width + LAPTOP.side * u * 2,
		height: screen.height + (LAPTOP.top + LAPTOP.bottom) * u,
	};
	const base: RenderRect = {
		x: lid.x - LAPTOP.baseOverhang * u,
		y: lid.y + lid.height - LAPTOP.baseOverlap * u,
		width: lid.width + LAPTOP.baseOverhang * u * 2,
		height: LAPTOP.baseHeight * u,
	};
	const scoopWidth = lid.width * 0.16;
	return {
		screenRadius: LAPTOP.screenRadius * u,
		// Where the base rests on the desk.
		shadow: [
			roundRect(
				{
					x: base.x + base.width * 0.03,
					y: base.y + base.height * 0.35,
					width: base.width * 0.94,
					height: base.height * 1.3,
				},
				base.height,
				{
					color: 0x000000,
					gradient: {
						type: "radial",
						stops: [
							{ offset: 0, color: 0x000000, alpha: 0.62 },
							{ offset: 0.55, color: 0x000000, alpha: 0.24 },
							{ offset: 1, color: 0x000000, alpha: 0 },
						],
					},
					part: "shadow",
				},
			),
		],
		back: [
			...metalRim(lid, LAPTOP.lidRadius * u, LAPTOP.rim * u, m),
			glass(expand(lid, -LAPTOP.rim * u), (LAPTOP.lidRadius - LAPTOP.rim) * u, u),
			...lens(screen.x + screen.width / 2, screen.y - (LAPTOP.top * u) / 2, 0.007 * u),
			// The base, seen edge-on: lit along its top, falling into shade toward the desk.
			roundRect(base, base.height * 0.3, {
				color: m.base,
				gradient: linear(DOWN, [
					[0, m.light],
					[0.18, m.base],
					[0.55, m.base],
					[0.82, m.dark],
					[1, m.edge],
				]),
				stroke: { width: 0.0012 * u, color: m.edge, alpha: 0.7 },
				part: "base",
			}),
			// The thumb scoop for opening the lid.
			roundRect(
				{
					x: screen.x + screen.width / 2 - scoopWidth / 2,
					y: base.y,
					width: scoopWidth,
					height: 0.016 * u,
				},
				0.008 * u,
				{
					color: m.dark,
					gradient: linear(DOWN, [
						[0, m.edge],
						[1, m.base],
					]),
				},
			),
		],
		front: [],
	};
}

function chevron(x: number, y: number, size: number, pointsLeft: boolean, c: Chrome, u: number) {
	const dx = pointsLeft ? size * 0.5 : -size * 0.5;
	return {
		type: "poly" as const,
		points: [x + dx, y - size, x - dx, y, x + dx, y + size],
		color: c.icon,
		hollow: true,
		stroke: { width: 0.0042 * u, color: c.icon },
	};
}

function layoutBrowser(screen: RenderRect, color: DeviceFrameColor): FrameParts {
	const c = CHROMES[color];
	const u = Math.min(screen.width, screen.height);
	const bar = BROWSER.bar * u;
	const border = BROWSER.border * u;
	const radius = BROWSER.radius * u;
	const windowRect: RenderRect = {
		x: screen.x - border,
		y: screen.y - bar,
		width: screen.width + border * 2,
		height: screen.height + bar + border,
	};
	const barCenterY = windowRect.y + bar / 2;
	const lightsStart = windowRect.x + 0.05 * u;
	const lightsStep = 0.04 * u;
	const lightRadius = 0.0125 * u;
	const centerX = windowRect.x + windowRect.width / 2;

	// The sidebar button and back/forward arrows follow the window buttons when the
	// window is wide enough for them; the address field never runs into either.
	const sidebarX = lightsStart + lightsStep * 2 + 0.05 * u;
	const sidebar = { x: sidebarX, y: barCenterY - 0.013 * u, width: 0.036 * u, height: 0.026 * u };
	const arrowsEnd = sidebar.x + sidebar.width + 0.09 * u;
	const withTools = (centerX - arrowsEnd) * 2 >= windowRect.width * 0.3;
	const leftEnd = withTools ? arrowsEnd + 0.02 * u : lightsStart + lightsStep * 2 + 0.05 * u;
	const fieldWidth = Math.max(0, Math.min(windowRect.width * 0.46, (centerX - leftEnd) * 2));
	const fieldHeight = 0.05 * u;

	const back: DeviceShape[] = [
		roundRect(windowRect, radius, {
			color: c.barBottom,
			stroke: { width: 0.0015 * u, color: c.line },
			part: "window",
		}),
		roundRect({ x: windowRect.x, y: windowRect.y, width: windowRect.width, height: bar }, radius, {
			color: c.barBottom,
			gradient: linear(DOWN, [
				[0, c.barTop],
				[1, c.barBottom],
			]),
			part: "bar",
		}),
		roundRect(
			{ x: windowRect.x, y: screen.y - 0.0018 * u, width: windowRect.width, height: 0.0018 * u },
			0,
			{ color: c.line },
		),
		...TRAFFIC_LIGHTS.map(([fill, rim], index) =>
			circle(lightsStart + index * lightsStep, barCenterY, lightRadius, {
				color: fill,
				stroke: { width: 0.0018 * u, color: rim },
				part: "window-button",
			}),
		),
	];

	if (withTools) {
		const icon = { width: 0.0036 * u, color: c.icon };
		back.push(
			roundRect(sidebar, 0.006 * u, { color: c.icon, hollow: true, stroke: icon }),
			roundRect(
				{
					x: sidebar.x + sidebar.width * 0.34,
					y: sidebar.y,
					width: 0.0036 * u,
					height: sidebar.height,
				},
				0,
				{ color: c.icon },
			),
			chevron(sidebar.x + sidebar.width + 0.035 * u, barCenterY, 0.011 * u, true, c, u),
			chevron(sidebar.x + sidebar.width + 0.075 * u, barCenterY, 0.011 * u, false, c, u),
		);
		// New tab and the tab overview, at the right end of the bar.
		const right = windowRect.x + windowRect.width - 0.05 * u;
		const plus = 0.026 * u;
		back.push(
			roundRect(
				{
					x: right - 0.06 * u - plus / 2,
					y: barCenterY - 0.0018 * u,
					width: plus,
					height: 0.0036 * u,
				},
				0,
				{ color: c.icon },
			),
			roundRect(
				{
					x: right - 0.06 * u - 0.0018 * u,
					y: barCenterY - plus / 2,
					width: 0.0036 * u,
					height: plus,
				},
				0,
				{ color: c.icon },
			),
			roundRect(
				{ x: right - 0.014 * u, y: barCenterY - 0.016 * u, width: 0.024 * u, height: 0.024 * u },
				0.005 * u,
				{ color: c.icon, hollow: true, stroke: icon },
			),
			roundRect(
				{ x: right - 0.02 * u, y: barCenterY - 0.009 * u, width: 0.024 * u, height: 0.024 * u },
				0.005 * u,
				{ color: c.barBottom, stroke: icon },
			),
		);
	}

	back.push(
		roundRect(
			{
				x: centerX - fieldWidth / 2,
				y: barCenterY - fieldHeight / 2,
				width: fieldWidth,
				height: fieldHeight,
			},
			fieldHeight * 0.3,
			{ color: c.field, stroke: { width: 0.0015 * u, color: c.fieldLine }, part: "address-field" },
		),
		// The address itself, as a soft line of text.
		roundRect(
			{
				x: centerX - fieldWidth * 0.17,
				y: barCenterY - 0.0065 * u,
				width: fieldWidth * 0.34,
				height: 0.013 * u,
			},
			0.0065 * u,
			{ color: c.text, part: "address" },
		),
	);

	return {
		back,
		front: [],
		screenRadius: Math.max(0, radius - border),
		shadow: softShadow(windowRect, radius, u, 1.1),
	};
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
	const material = MATERIALS[settings.color];
	const parts =
		kind === "phone"
			? layoutPhone(screen, settings, material, portrait)
			: kind === "tablet"
				? layoutTablet(screen, material)
				: kind === "laptop"
					? layoutLaptop(screen, material)
					: layoutBrowser(screen, settings.color);

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
			roundRect(screen, parts.screenRadius, { color: BEZEL_COLOR, part: "screen" }),
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

/** Everything painted behind the video: the device's shadow, then the device. */
export function deviceBackShapes(layout: { deviceFrame: DeviceFrameLayout | null } | null) {
	const frame = layout?.deviceFrame;
	return frame ? [...frame.shadow, ...frame.back] : undefined;
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
	poly(points: number[], close?: boolean): unknown;
	fill(style: { color: number; alpha?: number } | FillGradient): unknown;
	stroke(style: { width: number; color: number; alpha?: number }): unknown;
}

// Gradients are laid out in each shape's own box, so one gradient serves every shape
// that uses it at any size. They are built once: the exporter repaints every frame.
const gradients = new Map<string, FillGradient>();

function toFillGradient(gradient: ShapeGradient): FillGradient {
	const key = JSON.stringify(gradient);
	const cached = gradients.get(key);
	if (cached) return cached;
	const colorStops = gradient.stops.map((stop) => ({
		offset: stop.offset,
		color: new Color(stop.color).setAlpha(stop.alpha ?? 1),
	}));
	const fill =
		gradient.type === "linear"
			? new FillGradient({
					type: "linear",
					start: { x: gradient.from[0], y: gradient.from[1] },
					end: { x: gradient.to[0], y: gradient.to[1] },
					colorStops,
					textureSpace: "local",
				})
			: new FillGradient({
					type: "radial",
					center: { x: 0.5, y: 0.5 },
					innerRadius: 0,
					outerCenter: { x: 0.5, y: 0.5 },
					outerRadius: 0.5,
					colorStops,
					textureSpace: "local",
				});
	gradients.set(key, fill);
	return fill;
}

export function paintDeviceShapes(graphics: FrameGraphics, shapes: DeviceShape[] | undefined) {
	graphics.clear();
	for (const shape of shapes ?? []) {
		if (shape.type === "circle") {
			graphics.circle(shape.x, shape.y, shape.radius);
		} else if (shape.type === "poly") {
			graphics.poly(shape.points, false);
		} else {
			graphics.roundRect(shape.x, shape.y, shape.width, shape.height, shape.radius);
		}
		if (!shape.hollow) {
			graphics.fill(
				shape.gradient
					? toFillGradient(shape.gradient)
					: shape.alpha === undefined
						? { color: shape.color }
						: { color: shape.color, alpha: shape.alpha },
			);
		}
		if (shape.stroke) graphics.stroke(shape.stroke);
	}
}
