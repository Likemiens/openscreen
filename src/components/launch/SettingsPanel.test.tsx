import "@testing-library/jest-dom";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettingsView } from "@/lib/appSettings";
import { SettingsPanel } from "./SettingsPanel";

const SETTINGS: AppSettingsView = {
	saveFolder: null,
	quickRecordShortcut: null,
	launchAtLogin: false,
	trayHintShown: false,
	resolvedSaveFolder: "C:\\Users\\me\\Videos\\OpenScreen",
	activeQuickRecordShortcut: "Control+Alt+R",
	platform: "win32",
	canLaunchAtLogin: true,
};

function renderPanel(settings: AppSettingsView | null = SETTINGS) {
	const props = {
		settings,
		yandexConnected: false,
		onSettingsChange: vi.fn(),
		onOpenYandexDisk: vi.fn(),
		onOpenPresets: vi.fn(),
		onOpenStudio: vi.fn(),
		onOpenVideo: vi.fn(),
		onQuit: vi.fn(),
	};
	render(<SettingsPanel {...props} />);
	return props;
}

describe("SettingsPanel", () => {
	beforeEach(() => {
		window.electronAPI = {
			updateAppSettings: vi.fn(async (patch) => ({
				success: true,
				settings: { ...SETTINGS, ...patch },
			})),
			setShortcutCaptureActive: vi.fn(),
			pickSaveFolder: vi.fn(async () => ({
				success: true,
				settings: { ...SETTINGS, saveFolder: "D:\\Clips", resolvedSaveFolder: "D:\\Clips" },
			})),
			openSaveFolder: vi.fn(async () => ({ success: true })),
		} as unknown as Window["electronAPI"];
	});

	afterEach(cleanup);

	it("shows the shortcut that is actually registered", () => {
		renderPanel();

		expect(screen.getByTestId("hud-shortcut-field")).toHaveTextContent("Ctrl + Alt + R");
	});

	it("captures a new shortcut and releases the global hotkey while typing", async () => {
		const props = renderPanel();
		const field = screen.getByTestId("hud-shortcut-field");

		fireEvent.click(field);
		expect(field).toHaveTextContent("Press keys…");
		expect(window.electronAPI.setShortcutCaptureActive).toHaveBeenLastCalledWith(true);

		// Holding only modifiers is not a shortcut yet.
		fireEvent.keyDown(window, { key: "Control", ctrlKey: true });
		expect(window.electronAPI.updateAppSettings).not.toHaveBeenCalled();

		fireEvent.keyDown(window, { key: "k", ctrlKey: true, altKey: true });

		await waitFor(() => {
			expect(window.electronAPI.updateAppSettings).toHaveBeenCalledWith({
				quickRecordShortcut: "Control+Alt+K",
			});
			expect(props.onSettingsChange).toHaveBeenCalled();
		});
		expect(window.electronAPI.setShortcutCaptureActive).toHaveBeenLastCalledWith(false);
	});

	it("explains why a shortcut could not be used", async () => {
		window.electronAPI.updateAppSettings = vi.fn(async () => ({
			success: false,
			error: "That shortcut is already used by Windows or another app.",
			settings: SETTINGS,
		}));
		renderPanel();

		fireEvent.click(screen.getByTestId("hud-shortcut-field"));
		fireEvent.keyDown(window, { key: "r", metaKey: true, shiftKey: true });

		expect(
			await screen.findByText("That shortcut is already used by Windows or another app."),
		).toBeInTheDocument();
	});

	it("cancels capturing with Escape without changing anything", () => {
		renderPanel();
		const field = screen.getByTestId("hud-shortcut-field");

		fireEvent.click(field);
		fireEvent.keyDown(window, { key: "Escape" });

		expect(field).toHaveTextContent("Ctrl + Alt + R");
		expect(window.electronAPI.updateAppSettings).not.toHaveBeenCalled();
	});

	it("warns when no shortcut could be registered", () => {
		renderPanel({ ...SETTINGS, activeQuickRecordShortcut: null });

		expect(screen.getByTestId("hud-shortcut-field")).toHaveTextContent("Not set");
		expect(screen.getByText(/No free shortcut was found/)).toBeInTheDocument();
	});

	it("toggles launch at login, and disables it outside the installed app", async () => {
		const props = renderPanel();

		fireEvent.click(screen.getByRole("switch", { name: "Launch at login" }));
		await waitFor(() => {
			expect(window.electronAPI.updateAppSettings).toHaveBeenCalledWith({ launchAtLogin: true });
			expect(props.onSettingsChange).toHaveBeenCalled();
		});

		cleanup();
		renderPanel({ ...SETTINGS, canLaunchAtLogin: false });
		expect(screen.getByRole("switch", { name: "Launch at login" })).toBeDisabled();
	});

	it("changes and opens the clips folder", async () => {
		const props = renderPanel();

		fireEvent.click(screen.getByRole("button", { name: "Change…" }));
		await waitFor(() => {
			expect(props.onSettingsChange).toHaveBeenCalledWith(
				expect.objectContaining({ resolvedSaveFolder: "D:\\Clips" }),
			);
		});

		fireEvent.click(screen.getByTitle("Open C:\\Users\\me\\Videos\\OpenScreen"));
		expect(window.electronAPI.openSaveFolder).toHaveBeenCalledTimes(1);
	});

	it("leads to the less frequent destinations", () => {
		const props = renderPanel();

		fireEvent.click(screen.getByRole("button", { name: /Yandex Disk/ }));
		fireEvent.click(screen.getByRole("button", { name: "Recording presets" }));
		fireEvent.click(screen.getByRole("button", { name: "Open Studio" }));
		fireEvent.click(screen.getByRole("button", { name: "Edit a video file…" }));
		fireEvent.click(screen.getByRole("button", { name: "Quit OpenScreen" }));

		expect(props.onOpenYandexDisk).toHaveBeenCalledTimes(1);
		expect(props.onOpenPresets).toHaveBeenCalledTimes(1);
		expect(props.onOpenStudio).toHaveBeenCalledTimes(1);
		expect(props.onOpenVideo).toHaveBeenCalledTimes(1);
		expect(props.onQuit).toHaveBeenCalledTimes(1);
	});
});
