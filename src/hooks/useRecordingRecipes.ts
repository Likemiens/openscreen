import { useCallback, useMemo, useState } from "react";
import {
	BUILT_IN_RECORDING_RECIPES,
	createCustomRecordingRecipe,
	loadRecordingRecipeState,
	type RecordingRecipe,
	type RecordingRecipeSettings,
	saveRecordingRecipeState,
} from "@/lib/recordingRecipes";

export function useRecordingRecipes() {
	const [state, setState] = useState(loadRecordingRecipeState);
	const recipes = useMemo(
		() => [...BUILT_IN_RECORDING_RECIPES, ...state.customRecipes],
		[state.customRecipes],
	);
	const selectedRecipe = recipes.find((recipe) => recipe.id === state.selectedRecipeId) ?? null;

	const selectRecipe = useCallback((recipeId: string) => {
		setState((current) => {
			const next = { ...current, selectedRecipeId: recipeId };
			saveRecordingRecipeState(next);
			return next;
		});
	}, []);

	const saveCurrentAsRecipe = useCallback((name: string, settings: RecordingRecipeSettings) => {
		const recipe = createCustomRecordingRecipe(name, settings);
		setState((current) => {
			const next = {
				selectedRecipeId: recipe.id,
				customRecipes: [...current.customRecipes, recipe],
			};
			saveRecordingRecipeState(next);
			return next;
		});
		return recipe;
	}, []);

	const deleteRecipe = useCallback((recipeId: string) => {
		setState((current) => {
			const next = {
				selectedRecipeId: current.selectedRecipeId === recipeId ? null : current.selectedRecipeId,
				customRecipes: current.customRecipes.filter((recipe) => recipe.id !== recipeId),
			};
			saveRecordingRecipeState(next);
			return next;
		});
	}, []);

	return {
		recipes,
		selectedRecipe,
		selectRecipe,
		saveCurrentAsRecipe,
		deleteRecipe,
	} satisfies {
		recipes: RecordingRecipe[];
		selectedRecipe: RecordingRecipe | null;
		selectRecipe: (recipeId: string) => void;
		saveCurrentAsRecipe: (name: string, settings: RecordingRecipeSettings) => RecordingRecipe;
		deleteRecipe: (recipeId: string) => void;
	};
}
