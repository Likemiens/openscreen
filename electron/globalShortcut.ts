import fs from "node:fs/promises";
import { globalShortcut } from "electron";
import { normalizeAccelerator, QUICK_RECORD_SHORTCUT_CANDIDATES } from "../src/lib/appSettings";
import { type ShortcutBinding } from "../src/lib/shortcuts";
import { SHORTCUTS_FILE } from "./ipc/handlers";

const DEFAULT_OPEN_APP_BINDING: ShortcutBinding = { key: "o", ctrl: true, shift: true };

// Maps KeyboardEvent.key values to Electron accelerator key names
const KEY_TO_ACCELERATOR: Record<string, string> = {
	" ": "Space",
	"+": "Plus",
	"-": "numsub",
	"*": "nummult",
	"/": "numdiv",
	arrowup: "Up",
	arrowdown: "Down",
	arrowleft: "Left",
	arrowright: "Right",
	escape: "Escape",
	enter: "Return",
	backspace: "Backspace",
	delete: "Delete",
	tab: "Tab",
};

function bindingToAccelerator(binding: ShortcutBinding): string {
	const parts: string[] = [];
	if (binding.ctrl) parts.push("CommandOrControl");
	if (binding.shift) parts.push("Shift");
	if (binding.alt) parts.push("Alt");

	const keyLower = binding.key.toLowerCase();
	const acceleratorKey = KEY_TO_ACCELERATOR[keyLower] ?? binding.key.toUpperCase();
	parts.push(acceleratorKey);

	return parts.join("+");
}

let currentAccelerator: string | null = null;

export function registerOpenAppShortcut(binding: ShortcutBinding, onTrigger: () => void): boolean {
	const accelerator = bindingToAccelerator(binding);

	if (accelerator === currentAccelerator) {
		return true;
	}

	// Register the new shortcut before unregistering the old, so a failure leaves the old binding intact
	const success = globalShortcut.register(accelerator, onTrigger);

	if (success) {
		if (currentAccelerator) {
			globalShortcut.unregister(currentAccelerator);
		}
		currentAccelerator = accelerator;
		console.log(`Global shortcut registered: ${accelerator}`);
	} else {
		console.warn(`Failed to register global shortcut: ${accelerator}`);
	}

	return success;
}

export async function loadAndRegisterGlobalShortcut(onTrigger: () => void): Promise<void> {
	try {
		const data = await fs.readFile(SHORTCUTS_FILE, "utf-8");
		const shortcuts = JSON.parse(data);
		const binding = shortcuts.openApp || DEFAULT_OPEN_APP_BINDING;
		registerOpenAppShortcut(binding, onTrigger);
	} catch {
		registerOpenAppShortcut(DEFAULT_OPEN_APP_BINDING, onTrigger);
	}
}

let quickRecordAccelerator: string | null = null;

/** The open-app shortcut in the same canonical form the record shortcut uses. */
function getOpenAppAccelerator(): string | null {
	return currentAccelerator ? normalizeAccelerator(currentAccelerator) : null;
}

function tryRegister(accelerator: string, onTrigger: () => void): boolean {
	try {
		return globalShortcut.register(accelerator, onTrigger);
	} catch (error) {
		console.warn(`Invalid global shortcut ${accelerator}:`, error);
		return false;
	}
}

/**
 * Registers the record hotkey. The OS or another app may already own a
 * combination, so `preferred` is followed by the built-in fallbacks and the
 * first one that registers is returned (`null` if none did).
 */
export function registerQuickRecordShortcut(
	preferred: string | null,
	onTrigger: () => void,
): string | null {
	const candidates = [
		...new Set(
			[preferred, ...QUICK_RECORD_SHORTCUT_CANDIDATES].filter(
				(candidate): candidate is string =>
					Boolean(candidate) && candidate !== getOpenAppAccelerator(),
			),
		),
	];

	if (quickRecordAccelerator) {
		globalShortcut.unregister(quickRecordAccelerator);
		quickRecordAccelerator = null;
	}

	for (const accelerator of candidates) {
		if (tryRegister(accelerator, onTrigger)) {
			quickRecordAccelerator = accelerator;
			console.log(`Record shortcut registered: ${accelerator}`);
			return accelerator;
		}
	}

	console.warn("Failed to register a record shortcut; every candidate is taken.");
	return null;
}

/** Releases the record hotkey, e.g. while the user is choosing a new one. */
export function suspendQuickRecordShortcut(): void {
	if (!quickRecordAccelerator) return;
	globalShortcut.unregister(quickRecordAccelerator);
	quickRecordAccelerator = null;
}

/** True when `accelerator` is free to register (or is already ours). */
export function isAcceleratorAvailable(accelerator: string): boolean {
	if (accelerator === quickRecordAccelerator) return true;
	if (accelerator === getOpenAppAccelerator()) return false;
	if (!tryRegister(accelerator, () => undefined)) return false;
	globalShortcut.unregister(accelerator);
	return true;
}

export function unregisterAllGlobalShortcuts(): void {
	globalShortcut.unregisterAll();
	quickRecordAccelerator = null;
}
