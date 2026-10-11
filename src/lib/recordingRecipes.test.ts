import { beforeEach, describe, expect, it } from "vitest";
import {
	BUILT_IN_RECORDING_RECIPES,
	createCustomRecordingRecipe,
	createRecordingCountdownSequence,
	DEFAULT_RECORDING_RECIPE_STATE,
	loadRecordingRecipeState,
	recordingRecipeMatchesSettings,
	saveRecordingRecipeState,
} from "./recordingRecipes";

describe("recording recipes", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it("starts without forcing a recipe on new users", () => {
		expect(loadRecordingRecipeState()).toEqual(DEFAULT_RECORDING_RECIPE_STATE);
	});

	it("builds countdown sequences for recipe timing", () => {
		expect(createRecordingCountdownSequence(0)).toEqual([]);
		expect(createRecordingCountdownSequence(3)).toEqual([3, 2, 1]);
		expect(createRecordingCountdownSequence(5)).toEqual([5, 4, 3, 2, 1]);
	});

	it("round-trips a custom recipe and selected id", () => {
		const recipe = createCustomRecordingRecipe("My demo", {
			microphone: { enabled: true, deviceId: "mic-1", deviceName: "Desk mic" },
			webcam: { enabled: false },
			systemAudioEnabled: true,
			cursorCaptureMode: "editable-overlay",
			countdownSeconds: 5,
			exportQuality: "source",
			frameRate: 60,
			source: {
				id: "screen:1:0",
				name: "Display 1",
				displayId: "1",
				kind: "screen",
			},
		});

		saveRecordingRecipeState({ selectedRecipeId: recipe.id, customRecipes: [recipe] });

		expect(loadRecordingRecipeState()).toEqual({
			selectedRecipeId: recipe.id,
			customRecipes: [recipe],
		});
	});

	it("ignores malformed stored recipes and unknown selections", () => {
		localStorage.setItem(
			"openscreen_recording_recipes_v1",
			JSON.stringify({
				selectedRecipeId: "missing",
				customRecipes: [{ id: "broken", name: "Broken", settings: { frameRate: 120 } }],
			}),
		);

		expect(loadRecordingRecipeState()).toEqual(DEFAULT_RECORDING_RECIPE_STATE);
	});

	it("treats unspecified built-in devices and sources as flexible", () => {
		const productDemo = BUILT_IN_RECORDING_RECIPES.find((recipe) => recipe.id === "product-demo");
		expect(productDemo).toBeDefined();
		if (!productDemo) return;

		expect(
			recordingRecipeMatchesSettings(productDemo, {
				...productDemo.settings,
				microphone: { enabled: true, deviceId: "mic-2" },
				webcam: { enabled: true, deviceId: "camera-2" },
				source: {
					id: "window:42:0",
					name: "Browser",
					displayId: "1",
					kind: "window",
				},
			}),
		).toBe(true);
	});
});
