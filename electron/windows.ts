import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { BrowserWindow, ipcMain, screen } from "electron";
import type { EditorLaunchOptions } from "../src/lib/editorLaunch";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const APP_ROOT = path.join(__dirname, "..");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const RENDERER_DIST = path.join(APP_ROOT, "dist");
const HEADLESS = process.env["HEADLESS"] === "true";

// Asset base URL for renderer (wallpapers, etc.). Packaged: extraResources copies
// public/wallpapers to resources/wallpapers. Unpackaged: <appRoot>/public/.
const ASSET_BASE_DIR = process.defaultApp
	? path.join(__dirname, "..", "public")
	: process.resourcesPath;
const ASSET_BASE_URL_ARG = `--asset-base-url=${pathToFileURL(`${ASSET_BASE_DIR}${path.sep}`).toString()}`;

let hudOverlayWindow: BrowserWindow | null = null;

// Where the user last left the HUD (bottom-centre anchor, matching the anchor the
// renderer-driven resize preserves). The HUD window is released while the app idles
// in the tray, so this lets it reappear where it was instead of jumping home.
let lastHudAnchor: { centerX: number; bottomY: number } | null = null;

function rememberHudAnchor(win: BrowserWindow) {
	if (win.isDestroyed()) return;
	const bounds = win.getBounds();
	lastHudAnchor = {
		centerX: bounds.x + bounds.width / 2,
		bottomY: bounds.y + bounds.height,
	};
}

/** The HUD overlay, if one currently exists. */
export function getHudOverlayWindow(): BrowserWindow | null {
	return hudOverlayWindow && !hudOverlayWindow.isDestroyed() ? hudOverlayWindow : null;
}

ipcMain.on("hud-overlay-hide", () => {
	if (hudOverlayWindow && !hudOverlayWindow.isDestroyed()) {
		rememberHudAnchor(hudOverlayWindow);
		hudOverlayWindow.hide();
	}
});

ipcMain.on("hud-overlay-ignore-mouse-events", (_event, ignore: boolean) => {
	if (hudOverlayWindow && !hudOverlayWindow.isDestroyed()) {
		hudOverlayWindow.setIgnoreMouseEvents(ignore, { forward: true });
	}
});

ipcMain.on("hud-overlay-move-by", (_event, deltaX: number, deltaY: number) => {
	if (
		!hudOverlayWindow ||
		hudOverlayWindow.isDestroyed() ||
		!Number.isFinite(deltaX) ||
		!Number.isFinite(deltaY)
	) {
		return;
	}

	const [x, y] = hudOverlayWindow.getPosition();
	hudOverlayWindow.setPosition(Math.round(x + deltaX), Math.round(y + deltaY), false);
	rememberHudAnchor(hudOverlayWindow);
});

// Resize the HUD to fit its rendered content. Anchored by its bottom-centre so it
// stays where the user dragged it while only growing/shrinking, which lets the
// vertical tray layout grow tall instead of scrolling inside a fixed window.
ipcMain.on("hud-overlay-set-size", (_event, width: number, height: number) => {
	if (
		!hudOverlayWindow ||
		hudOverlayWindow.isDestroyed() ||
		!Number.isFinite(width) ||
		!Number.isFinite(height)
	) {
		return;
	}

	const bounds = hudOverlayWindow.getBounds();

	// Clamp to the work area of the display the HUD sits on; on a short screen the
	// vertical layout can exceed the display, where the bar's own overflow scroll takes over.
	const { workArea } = screen.getDisplayMatching(bounds);
	const nextWidth = Math.min(workArea.width, Math.max(1, Math.round(width)));
	const nextHeight = Math.min(workArea.height, Math.max(1, Math.round(height)));

	if (bounds.width === nextWidth && bounds.height === nextHeight) {
		return;
	}

	const centerX = bounds.x + bounds.width / 2;
	const bottomY = bounds.y + bounds.height;

	hudOverlayWindow.setBounds({
		x: Math.round(centerX - nextWidth / 2),
		y: Math.round(bottomY - nextHeight),
		width: nextWidth,
		height: nextHeight,
	});
});

/**
 * Frameless transparent HUD overlay, always-on-top, centred at the bottom of the
 * primary display. Follows the user across macOS Spaces so it isn't lost on switch.
 */
export function createHudOverlayWindow(options: { startHidden?: boolean } = {}): BrowserWindow {
	const primaryDisplay = screen.getPrimaryDisplay();
	const { workArea } = primaryDisplay;

	const windowWidth = 600;
	const windowHeight = 160;

	let x = Math.floor(workArea.x + (workArea.width - windowWidth) / 2);
	let y = Math.floor(workArea.y + workArea.height - windowHeight - 5);

	// Reuse the last position only while it is still on a connected display.
	if (lastHudAnchor) {
		const anchorDisplay = screen.getDisplayNearestPoint({
			x: Math.round(lastHudAnchor.centerX),
			y: Math.round(lastHudAnchor.bottomY),
		});
		const area = anchorDisplay.workArea;
		const insideDisplay =
			lastHudAnchor.centerX >= area.x &&
			lastHudAnchor.centerX <= area.x + area.width &&
			lastHudAnchor.bottomY > area.y &&
			lastHudAnchor.bottomY <= area.y + area.height + 8;
		if (insideDisplay) {
			x = Math.round(lastHudAnchor.centerX - windowWidth / 2);
			y = Math.round(lastHudAnchor.bottomY - windowHeight);
		}
	}

	const win = new BrowserWindow({
		width: windowWidth,
		height: windowHeight,
		// Min/max are intentionally loose: the renderer resizes to fit content via
		// "hud-overlay-set-size" (above), needed for the vertical tray to grow taller.
		minWidth: 120,
		minHeight: 80,
		x: x,
		y: y,
		frame: false,
		transparent: true,
		// Fully-transparent ARGB backing. Without this macOS draws the window as a
		// rounded glass panel with a border around the HUD content.
		backgroundColor: "#00000000",
		// Don't let macOS mask the window into a rounded rect; the HUD bar provides
		// its own rounding and the window itself must be invisible.
		roundedCorners: false,
		resizable: false,
		alwaysOnTop: true,
		skipTaskbar: true,
		hasShadow: false,
		show: false, // shown via ready-to-show to avoid black rectangle flash
		webPreferences: {
			preload: path.join(__dirname, "preload.mjs"),
			additionalArguments: [ASSET_BASE_URL_ARG],
			nodeIntegration: false,
			contextIsolation: true,
			backgroundThrottling: false,
		},
	});
	// Keep the recording controls visible to the user while excluding this window
	// from screen capture. On Windows this maps to WDA_EXCLUDEFROMCAPTURE.
	if (process.env["OPENSCREEN_ALLOW_HUD_CAPTURE"] !== "true") {
		win.setContentProtection(true);
	}
	win.setIgnoreMouseEvents(true, { forward: true });

	// Follow the user across macOS Spaces, else the HUD stays pinned to the Space
	// it was first opened on.
	if (process.platform === "darwin") {
		win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
	}

	// Show only once painted to avoid the black rectangle flash when a transparent
	// window is shown before its first paint.
	win.once("ready-to-show", () => {
		if (!HEADLESS && !options.startHidden) win.show();
	});

	win.webContents.on("did-finish-load", () => {
		win?.webContents.send("main-process-message", new Date().toLocaleString());
	});

	hudOverlayWindow = win;

	win.on("close", () => rememberHudAnchor(win));
	win.on("closed", () => {
		if (hudOverlayWindow === win) {
			hudOverlayWindow = null;
		}
	});

	if (VITE_DEV_SERVER_URL) {
		win.loadURL(VITE_DEV_SERVER_URL + "?windowType=hud-overlay");
	} else {
		win.loadFile(path.join(RENDERER_DIST, "index.html"), {
			query: { windowType: "hud-overlay" },
		});
	}

	return win;
}

/**
 * Main editor window. Starts maximised with a hidden title bar on macOS; not
 * always-on-top and appears in the taskbar/dock.
 */
export function createEditorWindow(options: EditorLaunchOptions = {}): BrowserWindow {
	const isMac = process.platform === "darwin";

	const win = new BrowserWindow({
		width: 1200,
		height: 800,
		minWidth: 800,
		minHeight: 600,
		...(isMac && {
			titleBarStyle: "hiddenInset",
			trafficLightPosition: { x: 12, y: 12 },
		}),
		transparent: false,
		resizable: true,
		alwaysOnTop: false,
		skipTaskbar: false,
		title: "OpenScreen",
		backgroundColor: "#161618",
		show: false, // shown via ready-to-show to avoid white flash on first load
		webPreferences: {
			preload: path.join(__dirname, "preload.mjs"),
			additionalArguments: [ASSET_BASE_URL_ARG],
			nodeIntegration: false,
			contextIsolation: true,
			webSecurity: false,
			backgroundThrottling: false,
		},
	});

	// maximize() also shows the window, which a headless run (tests, background checks)
	// must not do: it would put the editor over whatever the user is working in.
	if (!HEADLESS) win.maximize();

	// The editor renders its own File/Edit/View menu bar in the custom titlebar,
	// so hide the native OS menu bar on Windows/Linux (it stays reachable via Alt).
	// macOS keeps its global menu bar.
	if (process.platform !== "darwin") {
		win.setAutoHideMenuBar(true);
	}

	// Show only once painted to avoid a white flash on cold Vite start.
	win.once("ready-to-show", () => {
		if (!HEADLESS && !options.backgroundPublish && !options.backgroundSavePath) win.show();
	});

	// Inject dark background before any React paint so the sub-titlebar area never
	// flashes white on a cold Vite load.
	win.webContents.on("dom-ready", () => {
		win.webContents.insertCSS("html, body, #root { background: #161618 !important; }").catch(() => {
			// Best-effort cosmetic; ignore if the page is mid-teardown.
		});
	});

	win.webContents.on("did-finish-load", () => {
		win?.webContents.send("main-process-message", new Date().toLocaleString());
	});

	const query = {
		windowType: "editor",
		...(options.backgroundPublish ? { backgroundPublish: "true" } : {}),
		...(options.backgroundSavePath ? { backgroundSavePath: options.backgroundSavePath } : {}),
		...(options.title ? { title: options.title } : {}),
		...(options.quality ? { quality: options.quality } : {}),
		...(options.frameRate ? { frameRate: String(options.frameRate) } : {}),
	};
	if (VITE_DEV_SERVER_URL) {
		const editorUrl = new URL(VITE_DEV_SERVER_URL);
		for (const [key, value] of Object.entries(query)) editorUrl.searchParams.set(key, value);
		win.loadURL(editorUrl.toString());
	} else {
		win.loadFile(path.join(RENDERER_DIST, "index.html"), {
			query,
		});
	}

	return win;
}

/**
 * Floating source-selector window for picking a screen or window to record.
 * Frameless, transparent, and follows the user across macOS Spaces.
 */
export function createSourceSelectorWindow(tab?: "screens" | "windows"): BrowserWindow {
	const { width, height } = screen.getPrimaryDisplay().workAreaSize;

	const win = new BrowserWindow({
		width: 620,
		height: 420,
		minHeight: 350,
		maxHeight: 500,
		x: Math.round((width - 620) / 2),
		y: Math.round((height - 420) / 2),
		frame: false,
		resizable: false,
		alwaysOnTop: true,
		transparent: true,
		backgroundColor: "#00000000",
		webPreferences: {
			preload: path.join(__dirname, "preload.mjs"),
			additionalArguments: [ASSET_BASE_URL_ARG],
			nodeIntegration: false,
			contextIsolation: true,
		},
	});

	// Follow the user across macOS Spaces so the selector appears on the active
	// desktop regardless of where the HUD was opened.
	if (process.platform === "darwin") {
		win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
	}

	const query: Record<string, string> = {
		windowType: "source-selector",
		...(tab ? { tab } : {}),
	};
	if (VITE_DEV_SERVER_URL) {
		win.loadURL(`${VITE_DEV_SERVER_URL}?${new URLSearchParams(query).toString()}`);
	} else {
		win.loadFile(path.join(RENDERER_DIST, "index.html"), { query });
	}

	return win;
}

function loadOverlayRoute(win: BrowserWindow, windowType: string) {
	if (VITE_DEV_SERVER_URL) {
		win.loadURL(`${VITE_DEV_SERVER_URL}?windowType=${windowType}`);
	} else {
		win.loadFile(path.join(RENDERER_DIST, "index.html"), { query: { windowType } });
	}
}

/**
 * Full-display transparent overlay for dragging out the area to record. Covers the
 * whole display (taskbar included) so any part of the screen can be selected.
 */
export function createRegionSelectorWindow(display: Electron.Display): BrowserWindow {
	const win = new BrowserWindow({
		...display.bounds,
		frame: false,
		transparent: true,
		backgroundColor: "#00000000",
		resizable: false,
		movable: false,
		minimizable: false,
		maximizable: false,
		fullscreenable: false,
		alwaysOnTop: true,
		skipTaskbar: true,
		hasShadow: false,
		roundedCorners: false,
		enableLargerThanScreen: true,
		show: false,
		webPreferences: {
			preload: path.join(__dirname, "preload.mjs"),
			additionalArguments: [ASSET_BASE_URL_ARG],
			nodeIntegration: false,
			contextIsolation: true,
			backgroundThrottling: false,
		},
	});

	// Above the taskbar and other always-on-top windows, the HUD included.
	win.setAlwaysOnTop(true, "screen-saver");
	if (process.platform === "darwin") {
		win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
	}

	win.once("ready-to-show", () => {
		if (HEADLESS || win.isDestroyed()) return;
		// Some window managers adjust the first bounds of a frameless window.
		win.setBounds(display.bounds);
		win.show();
		win.focus();
	});

	loadOverlayRoute(win, "region-selector");
	return win;
}

/** Thickness (DIP) of the margin the recording frame window adds around a region. */
export const REGION_FRAME_MARGIN = 6;

/**
 * Click-through outline around the area being recorded. Excluded from capture, and
 * drawn just outside the region so it never lands in the video either way.
 */
export function createRegionFrameWindow(regionBounds: Electron.Rectangle): BrowserWindow {
	const win = new BrowserWindow({
		x: regionBounds.x - REGION_FRAME_MARGIN,
		y: regionBounds.y - REGION_FRAME_MARGIN,
		width: regionBounds.width + REGION_FRAME_MARGIN * 2,
		height: regionBounds.height + REGION_FRAME_MARGIN * 2,
		frame: false,
		transparent: true,
		backgroundColor: "#00000000",
		resizable: false,
		movable: false,
		focusable: false,
		alwaysOnTop: true,
		skipTaskbar: true,
		hasShadow: false,
		roundedCorners: false,
		enableLargerThanScreen: true,
		show: false,
		webPreferences: {
			preload: path.join(__dirname, "preload.mjs"),
			additionalArguments: [ASSET_BASE_URL_ARG],
			nodeIntegration: false,
			contextIsolation: true,
			backgroundThrottling: false,
		},
	});

	if (process.env["OPENSCREEN_ALLOW_HUD_CAPTURE"] !== "true") {
		win.setContentProtection(true);
	}
	win.setIgnoreMouseEvents(true);
	win.setAlwaysOnTop(true, "screen-saver");
	if (process.platform === "darwin") {
		win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
	}

	win.once("ready-to-show", () => {
		if (!HEADLESS && !win.isDestroyed()) win.showInactive();
	});

	loadOverlayRoute(win, "region-frame");
	return win;
}

/**
 * Centered transparent countdown overlay that sits above the HUD during
 * recording pre-roll.
 */
export function createCountdownOverlayWindow(): BrowserWindow {
	const { workArea } = screen.getPrimaryDisplay();
	const overlayWidth = 420;
	const overlayHeight = 260;

	const win = new BrowserWindow({
		width: overlayWidth,
		height: overlayHeight,
		minWidth: overlayWidth,
		maxWidth: overlayWidth,
		minHeight: overlayHeight,
		maxHeight: overlayHeight,
		x: Math.round(workArea.x + (workArea.width - overlayWidth) / 2),
		y: Math.round(workArea.y + (workArea.height - overlayHeight) / 2),
		frame: false,
		resizable: false,
		alwaysOnTop: true,
		skipTaskbar: true,
		focusable: false,
		transparent: true,
		backgroundColor: "#00000000",
		hasShadow: false,
		show: false,
		webPreferences: {
			preload: path.join(__dirname, "preload.mjs"),
			additionalArguments: [ASSET_BASE_URL_ARG],
			nodeIntegration: false,
			contextIsolation: true,
			backgroundThrottling: false,
		},
	});

	win.setIgnoreMouseEvents(true);

	if (process.platform === "darwin") {
		win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
	}

	if (VITE_DEV_SERVER_URL) {
		win.loadURL(VITE_DEV_SERVER_URL + "?windowType=countdown-overlay");
	} else {
		win.loadFile(path.join(RENDERER_DIST, "index.html"), {
			query: { windowType: "countdown-overlay" },
		});
	}

	return win;
}
