import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BUILT_IN_RECORDING_RECIPES, type RecordingRecipeSettings } from "@/lib/recordingRecipes";
import { RecordingRecipePanel } from "./RecordingRecipePanel";

const currentSettings: RecordingRecipeSettings = {
	microphone: { enabled: true },
	webcam: { enabled: false },
	systemAudioEnabled: false,
	cursorCaptureMode: "editable-overlay",
	countdownSeconds: 3,
	exportQuality: "good",
	frameRate: 60,
};

const baseProps = {
	recipes: [...BUILT_IN_RECORDING_RECIPES],
	selectedRecipe: null,
	modified: false,
	currentSettings,
	onApply: vi.fn(),
	onSave: vi.fn(),
	onDelete: vi.fn(),
	onChangeCountdown: vi.fn(),
	onChangeExportQuality: vi.fn(),
	onChangeFrameRate: vi.fn(),
	onClose: vi.fn(),
};

describe("RecordingRecipePanel", () => {
	it("applies a built-in recipe", async () => {
		const user = userEvent.setup();
		const onApply = vi.fn();
		render(<RecordingRecipePanel {...baseProps} onApply={onApply} />);

		await user.click(screen.getByRole("button", { name: /Product Demo/ }));

		expect(onApply).toHaveBeenCalledWith(BUILT_IN_RECORDING_RECIPES[0]);
	});

	it("updates recipe options and saves the current setup", async () => {
		const user = userEvent.setup();
		const onSave = vi.fn();
		const onChangeCountdown = vi.fn();
		const onChangeExportQuality = vi.fn();
		const onChangeFrameRate = vi.fn();
		render(
			<RecordingRecipePanel
				{...baseProps}
				onSave={onSave}
				onChangeCountdown={onChangeCountdown}
				onChangeExportQuality={onChangeExportQuality}
				onChangeFrameRate={onChangeFrameRate}
			/>,
		);

		await user.click(screen.getByRole("button", { name: "5s" }));
		await user.click(screen.getByRole("button", { name: "Source" }));
		await user.click(screen.getByRole("button", { name: "30" }));
		await user.type(screen.getByRole("textbox", { name: "Recipe name" }), "Weekly demo");
		await user.click(screen.getByRole("button", { name: /Save current/ }));

		expect(onChangeCountdown).toHaveBeenCalledWith(5);
		expect(onChangeExportQuality).toHaveBeenCalledWith("source");
		expect(onChangeFrameRate).toHaveBeenCalledWith(30);
		expect(onSave).toHaveBeenCalledWith("Weekly demo");
	});

	it("allows custom recipes to be deleted", async () => {
		const user = userEvent.setup();
		const onDelete = vi.fn();
		const custom = {
			id: "custom-weekly",
			name: "Weekly demo",
			builtIn: false,
			settings: currentSettings,
		};
		render(
			<RecordingRecipePanel
				{...baseProps}
				recipes={[...baseProps.recipes, custom]}
				onDelete={onDelete}
			/>,
		);

		await user.click(screen.getByRole("button", { name: "Delete Weekly demo" }));

		expect(onDelete).toHaveBeenCalledWith("custom-weekly");
	});

	it("closes with Escape", async () => {
		const user = userEvent.setup();
		const onClose = vi.fn();
		render(<RecordingRecipePanel {...baseProps} onClose={onClose} />);

		await user.keyboard("{Escape}");

		expect(onClose).toHaveBeenCalledOnce();
	});
});
