/** Settings owned by the main process and persisted in the user data folder. */
export interface AppSettings {
	/** Folder finished clips are saved to. `null` uses the default Videos folder. */
	saveFolder: string | null;
	/** Electron accelerator for the record hotkey. `null` uses the built-in fallbacks. */
	quickRecordShortcut: string | null;
	/** Start with the system, hidden in the tray, so the hotkey is always live. */
	launchAtLogin: boolean;
	/** Whether the one-time "still running in the tray" notice has been shown. */
	trayHintShown: boolean;
}

/** `AppSettings` plus the values the main process resolved at runtime. */
export interface AppSettingsView extends AppSettings {
	resolvedSaveFolder: string;
	/** The accelerator that is actually registered, or `null` if none could be. */
	activeQuickRecordShortcut: string | null;
	platform: string;
	/** Whether launch-at-login can be changed in this build (packaged apps only). */
	canLaunchAtLogin: boolean;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
	saveFolder: null,
	quickRecordShortcut: null,
	launchAtLogin: false,
	trayHintShown: false,
};

/**
 * Tried in order until one registers. Win+Shift+R is the natural choice but
 * Windows 11 reserves it for the Snipping Tool recorder, so on most machines
 * the next free combination wins.
 */
export const QUICK_RECORD_SHORTCUT_CANDIDATES: readonly string[] = [
	"Super+Shift+R",
	"Control+Alt+R",
	"Super+Shift+X",
	"Control+Shift+Space",
];

const MODIFIER_ORDER = ["Super", "Control", "Alt", "Shift"] as const;
type AcceleratorModifier = (typeof MODIFIER_ORDER)[number];

const MODIFIER_ALIASES: Record<string, AcceleratorModifier> = {
	super: "Super",
	meta: "Super",
	cmd: "Super",
	command: "Super",
	win: "Super",
	control: "Control",
	ctrl: "Control",
	commandorcontrol: "Control",
	cmdorctrl: "Control",
	alt: "Alt",
	option: "Alt",
	shift: "Shift",
};

const NAMED_KEYS = ["Space", "Up", "Down", "Left", "Right", "Return", "Tab", "Plus"];

const SPECIAL_KEYS: Record<string, string> = {
	" ": "Space",
	spacebar: "Space",
	arrowup: "Up",
	arrowdown: "Down",
	arrowleft: "Left",
	arrowright: "Right",
	enter: "Return",
	escape: "Escape",
	backspace: "Backspace",
	delete: "Delete",
	tab: "Tab",
	"+": "Plus",
};

/**
 * Canonicalises an accelerator ("ctrl+alt+r" -> "Control+Alt+R"). Returns
 * `null` for anything that is not at least one modifier plus exactly one key,
 * since a bare key would hijack normal typing system-wide.
 */
export function normalizeAccelerator(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const parts = value
		.split("+")
		.map((part) => part.trim())
		.filter(Boolean);
	if (parts.length < 2) return null;

	const modifiers = new Set<AcceleratorModifier>();
	let key: string | null = null;
	for (const part of parts) {
		const modifier = MODIFIER_ALIASES[part.toLowerCase()];
		if (modifier) {
			modifiers.add(modifier);
			continue;
		}
		if (key) return null;
		key =
			NAMED_KEYS.find((name) => name.toLowerCase() === part.toLowerCase()) ?? part.toUpperCase();
	}
	if (!key || modifiers.size === 0) return null;
	if (!NAMED_KEYS.includes(key) && !/^([A-Z0-9]|F\d{1,2})$/.test(key)) return null;

	return [...MODIFIER_ORDER.filter((modifier) => modifiers.has(modifier)), key].join("+");
}

/** Builds an accelerator from a key press, or `null` while only modifiers are held. */
export function acceleratorFromKeyboardEvent(event: {
	key: string;
	ctrlKey: boolean;
	altKey: boolean;
	shiftKey: boolean;
	metaKey: boolean;
}): string | null {
	const lowerKey = event.key.toLowerCase();
	if (["control", "alt", "shift", "meta", "os"].includes(lowerKey)) return null;

	const key = SPECIAL_KEYS[lowerKey] ?? (event.key.length === 1 ? event.key.toUpperCase() : null);
	if (!key && !/^f\d{1,2}$/.test(lowerKey)) return null;

	const parts: string[] = [];
	if (event.metaKey) parts.push("Super");
	if (event.ctrlKey) parts.push("Control");
	if (event.altKey) parts.push("Alt");
	if (event.shiftKey) parts.push("Shift");
	parts.push(key ?? event.key.toUpperCase());
	return normalizeAccelerator(parts.join("+"));
}

/** Human-readable form of an accelerator for the current platform. */
export function formatAccelerator(accelerator: string | null, platform: string): string {
	if (!accelerator) return "";
	const isMac = platform === "darwin";
	return accelerator
		.split("+")
		.map((part) => {
			switch (part) {
				case "Super":
					return isMac ? "⌘" : "Win";
				case "Control":
					return isMac ? "⌃" : "Ctrl";
				case "Alt":
					return isMac ? "⌥" : "Alt";
				case "Shift":
					return isMac ? "⇧" : "Shift";
				case "Return":
					return "Enter";
				default:
					return part;
			}
		})
		.join(isMac ? "" : " + ");
}

export function normalizeAppSettings(value: unknown): AppSettings {
	if (!value || typeof value !== "object") return { ...DEFAULT_APP_SETTINGS };
	const raw = value as Record<string, unknown>;
	return {
		saveFolder:
			typeof raw.saveFolder === "string" && raw.saveFolder.trim() ? raw.saveFolder.trim() : null,
		quickRecordShortcut: normalizeAccelerator(raw.quickRecordShortcut),
		launchAtLogin: raw.launchAtLogin === true,
		trayHintShown: raw.trayHintShown === true,
	};
}
