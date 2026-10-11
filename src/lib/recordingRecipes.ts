import type { ExportQuality, Mp4FrameRate } from "@/lib/exporter";
import type { CursorCaptureMode } from "@/lib/recordingSession";

const RECORDING_RECIPES_KEY = "openscreen_recording_recipes_v1";

export type RecordingCountdownSeconds = 0 | 3 | 5;

export interface RecordingRecipeSource {
	id: string;
	name: string;
	displayId: string;
	kind: "screen" | "window";
}

export interface RecordingRecipeSettings {
	microphone: {
		enabled: boolean;
		deviceId?: string;
		deviceName?: string;
	};
	webcam: {
		enabled: boolean;
		deviceId?: string;
		deviceName?: string;
	};
	systemAudioEnabled: boolean;
	cursorCaptureMode: CursorCaptureMode;
	countdownSeconds: RecordingCountdownSeconds;
	exportQuality: ExportQuality;
	frameRate: Mp4FrameRate;
	source?: RecordingRecipeSource;
}

export interface RecordingRecipe {
	id: string;
	name: string;
	builtIn: boolean;
	settings: RecordingRecipeSettings;
}

export interface RecordingRecipeState {
	selectedRecipeId: string | null;
	customRecipes: RecordingRecipe[];
}

const BASE_SETTINGS: RecordingRecipeSettings = {
	microphone: { enabled: true },
	webcam: { enabled: false },
	systemAudioEnabled: false,
	cursorCaptureMode: "editable-overlay",
	countdownSeconds: 3,
	exportQuality: "good",
	frameRate: 60,
};

export const BUILT_IN_RECORDING_RECIPES: readonly RecordingRecipe[] = [
	{
		id: "product-demo",
		name: "Product Demo",
		builtIn: true,
		settings: {
			...BASE_SETTINGS,
			webcam: { enabled: true },
		},
	},
	{
		id: "quick-update",
		name: "Quick Update",
		builtIn: true,
		settings: {
			...BASE_SETTINGS,
			frameRate: 30,
		},
	},
	{
		id: "tutorial",
		name: "Tutorial",
		builtIn: true,
		settings: {
			...BASE_SETTINGS,
			systemAudioEnabled: true,
			exportQuality: "source",
		},
	},
] as const;

export const DEFAULT_RECORDING_RECIPE_STATE: RecordingRecipeState = {
	selectedRecipeId: null,
	customRecipes: [],
};

function isBoolean(value: unknown): value is boolean {
	return typeof value === "boolean";
}

function isOptionalString(value: unknown): value is string | undefined {
	return value === undefined || (typeof value === "string" && value.length > 0);
}

function parseSource(value: unknown): RecordingRecipeSource | undefined {
	if (!value || typeof value !== "object") return undefined;
	const candidate = value as Record<string, unknown>;
	if (
		typeof candidate.id !== "string" ||
		typeof candidate.name !== "string" ||
		typeof candidate.displayId !== "string" ||
		(candidate.kind !== "screen" && candidate.kind !== "window")
	) {
		return undefined;
	}

	return {
		id: candidate.id,
		name: candidate.name,
		displayId: candidate.displayId,
		kind: candidate.kind,
	};
}

function parseSettings(value: unknown): RecordingRecipeSettings | null {
	if (!value || typeof value !== "object") return null;
	const candidate = value as Record<string, unknown>;
	const microphone = candidate.microphone as Record<string, unknown> | undefined;
	const webcam = candidate.webcam as Record<string, unknown> | undefined;

	if (
		!microphone ||
		!webcam ||
		!isBoolean(microphone.enabled) ||
		!isOptionalString(microphone.deviceId) ||
		!isOptionalString(microphone.deviceName) ||
		!isBoolean(webcam.enabled) ||
		!isOptionalString(webcam.deviceId) ||
		!isOptionalString(webcam.deviceName) ||
		!isBoolean(candidate.systemAudioEnabled) ||
		(candidate.cursorCaptureMode !== "system" &&
			candidate.cursorCaptureMode !== "editable-overlay") ||
		(candidate.countdownSeconds !== 0 &&
			candidate.countdownSeconds !== 3 &&
			candidate.countdownSeconds !== 5) ||
		(candidate.exportQuality !== "medium" &&
			candidate.exportQuality !== "good" &&
			candidate.exportQuality !== "source") ||
		(candidate.frameRate !== 30 && candidate.frameRate !== 60)
	) {
		return null;
	}

	const source = parseSource(candidate.source);
	return {
		microphone: {
			enabled: microphone.enabled,
			...(microphone.deviceId ? { deviceId: microphone.deviceId as string } : {}),
			...(microphone.deviceName ? { deviceName: microphone.deviceName as string } : {}),
		},
		webcam: {
			enabled: webcam.enabled,
			...(webcam.deviceId ? { deviceId: webcam.deviceId as string } : {}),
			...(webcam.deviceName ? { deviceName: webcam.deviceName as string } : {}),
		},
		systemAudioEnabled: candidate.systemAudioEnabled,
		cursorCaptureMode: candidate.cursorCaptureMode,
		countdownSeconds: candidate.countdownSeconds,
		exportQuality: candidate.exportQuality,
		frameRate: candidate.frameRate,
		...(source ? { source } : {}),
	};
}

function parseCustomRecipe(value: unknown): RecordingRecipe | null {
	if (!value || typeof value !== "object") return null;
	const candidate = value as Record<string, unknown>;
	const settings = parseSettings(candidate.settings);
	if (
		typeof candidate.id !== "string" ||
		candidate.id.length === 0 ||
		typeof candidate.name !== "string" ||
		candidate.name.trim().length === 0 ||
		!settings
	) {
		return null;
	}

	return {
		id: candidate.id,
		name: candidate.name.trim().slice(0, 40),
		builtIn: false,
		settings,
	};
}

export function loadRecordingRecipeState(): RecordingRecipeState {
	try {
		const raw = localStorage.getItem(RECORDING_RECIPES_KEY);
		if (!raw) return { ...DEFAULT_RECORDING_RECIPE_STATE };
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		const customRecipes = Array.isArray(parsed.customRecipes)
			? parsed.customRecipes
					.map(parseCustomRecipe)
					.filter((recipe): recipe is RecordingRecipe => recipe !== null)
			: [];
		const allIds = new Set([
			...BUILT_IN_RECORDING_RECIPES.map((recipe) => recipe.id),
			...customRecipes.map((recipe) => recipe.id),
		]);
		const selectedRecipeId =
			typeof parsed.selectedRecipeId === "string" && allIds.has(parsed.selectedRecipeId)
				? parsed.selectedRecipeId
				: null;
		return { selectedRecipeId, customRecipes };
	} catch {
		return { ...DEFAULT_RECORDING_RECIPE_STATE };
	}
}

export function saveRecordingRecipeState(state: RecordingRecipeState): void {
	try {
		localStorage.setItem(RECORDING_RECIPES_KEY, JSON.stringify(state));
	} catch {
		// A recipe is a convenience. Recording must still work if storage is unavailable.
	}
}

export function createCustomRecordingRecipe(
	name: string,
	settings: RecordingRecipeSettings,
): RecordingRecipe {
	const trimmedName = name.trim().slice(0, 40) || "My Recipe";
	const randomId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
	return {
		id: `custom-${randomId}`,
		name: trimmedName,
		builtIn: false,
		settings,
	};
}

export function getRecordingRecipeSummary(settings: RecordingRecipeSettings): string {
	const parts = [
		settings.microphone.enabled ? "Mic" : "No mic",
		settings.webcam.enabled ? "Camera" : null,
		settings.systemAudioEnabled ? "System audio" : null,
		settings.exportQuality === "medium"
			? "720p"
			: settings.exportQuality === "good"
				? "1080p"
				: "Source",
		`${settings.frameRate} FPS`,
		settings.countdownSeconds === 0 ? "No countdown" : `${settings.countdownSeconds}s countdown`,
	];
	return parts.filter(Boolean).join(" · ");
}

export function createRecordingCountdownSequence(seconds: RecordingCountdownSeconds): number[] {
	return Array.from({ length: seconds }, (_, index) => seconds - index);
}

export function recordingRecipeMatchesSettings(
	recipe: RecordingRecipe,
	current: RecordingRecipeSettings,
): boolean {
	const expected = recipe.settings;
	const microphoneDeviceMatches =
		!expected.microphone.deviceId || expected.microphone.deviceId === current.microphone.deviceId;
	const webcamDeviceMatches =
		!expected.webcam.deviceId || expected.webcam.deviceId === current.webcam.deviceId;
	const sourceMatches =
		!expected.source ||
		expected.source.id === current.source?.id ||
		(expected.source.kind === current.source?.kind && expected.source.name === current.source.name);

	return (
		expected.microphone.enabled === current.microphone.enabled &&
		microphoneDeviceMatches &&
		expected.webcam.enabled === current.webcam.enabled &&
		webcamDeviceMatches &&
		expected.systemAudioEnabled === current.systemAudioEnabled &&
		expected.cursorCaptureMode === current.cursorCaptureMode &&
		expected.countdownSeconds === current.countdownSeconds &&
		expected.exportQuality === current.exportQuality &&
		expected.frameRate === current.frameRate &&
		sourceMatches
	);
}
