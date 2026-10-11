import { describe, expect, it } from "vitest";
import {
	acceleratorFromKeyboardEvent,
	DEFAULT_APP_SETTINGS,
	formatAccelerator,
	normalizeAccelerator,
	normalizeAppSettings,
	QUICK_RECORD_SHORTCUT_CANDIDATES,
} from "./appSettings";

function keyEvent(
	key: string,
	modifiers: Partial<Record<"ctrl" | "alt" | "shift" | "meta", boolean>>,
) {
	return {
		key,
		ctrlKey: Boolean(modifiers.ctrl),
		altKey: Boolean(modifiers.alt),
		shiftKey: Boolean(modifiers.shift),
		metaKey: Boolean(modifiers.meta),
	};
}

describe("normalizeAccelerator", () => {
	it("canonicalises spelling and modifier order", () => {
		expect(normalizeAccelerator("shift+ctrl+r")).toBe("Control+Shift+R");
		expect(normalizeAccelerator("CommandOrControl+Shift+O")).toBe("Control+Shift+O");
		expect(normalizeAccelerator("win+shift+x")).toBe("Super+Shift+X");
		expect(normalizeAccelerator("alt+space")).toBe("Alt+Space");
		expect(normalizeAccelerator("ctrl+f9")).toBe("Control+F9");
	});

	it("rejects shortcuts that would hijack normal typing", () => {
		expect(normalizeAccelerator("R")).toBeNull();
		expect(normalizeAccelerator("Control+Shift")).toBeNull();
		expect(normalizeAccelerator("Control+A+B")).toBeNull();
		expect(normalizeAccelerator("Control+Banana")).toBeNull();
		expect(normalizeAccelerator(42)).toBeNull();
	});

	it("keeps every built-in candidate valid", () => {
		for (const candidate of QUICK_RECORD_SHORTCUT_CANDIDATES) {
			expect(normalizeAccelerator(candidate)).toBe(candidate);
		}
	});
});

describe("acceleratorFromKeyboardEvent", () => {
	it("waits for a real key while only modifiers are held", () => {
		expect(acceleratorFromKeyboardEvent(keyEvent("Control", { ctrl: true }))).toBeNull();
		expect(acceleratorFromKeyboardEvent(keyEvent("Meta", { meta: true }))).toBeNull();
	});

	it("builds an accelerator from a full combination", () => {
		expect(acceleratorFromKeyboardEvent(keyEvent("r", { ctrl: true, alt: true }))).toBe(
			"Control+Alt+R",
		);
		expect(acceleratorFromKeyboardEvent(keyEvent("X", { meta: true, shift: true }))).toBe(
			"Super+Shift+X",
		);
		expect(acceleratorFromKeyboardEvent(keyEvent(" ", { ctrl: true, shift: true }))).toBe(
			"Control+Shift+Space",
		);
		expect(acceleratorFromKeyboardEvent(keyEvent("F9", { alt: true }))).toBe("Alt+F9");
	});

	it("ignores a key pressed without any modifier", () => {
		expect(acceleratorFromKeyboardEvent(keyEvent("r", {}))).toBeNull();
	});
});

describe("formatAccelerator", () => {
	it("uses the platform's own names", () => {
		expect(formatAccelerator("Control+Alt+R", "win32")).toBe("Ctrl + Alt + R");
		expect(formatAccelerator("Super+Shift+R", "win32")).toBe("Win + Shift + R");
		expect(formatAccelerator("Super+Shift+R", "darwin")).toBe("⌘⇧R");
		expect(formatAccelerator(null, "win32")).toBe("");
	});
});

describe("normalizeAppSettings", () => {
	it("falls back to defaults for missing or malformed values", () => {
		expect(normalizeAppSettings(null)).toEqual(DEFAULT_APP_SETTINGS);
		expect(
			normalizeAppSettings({ saveFolder: "  ", quickRecordShortcut: "R", launchAtLogin: "yes" }),
		).toEqual(DEFAULT_APP_SETTINGS);
	});

	it("keeps valid values", () => {
		expect(
			normalizeAppSettings({
				saveFolder: " D:\\Clips ",
				quickRecordShortcut: "ctrl+alt+r",
				launchAtLogin: true,
			}),
		).toEqual({
			saveFolder: "D:\\Clips",
			quickRecordShortcut: "Control+Alt+R",
			launchAtLogin: true,
			trayHintShown: false,
		});
	});
});
