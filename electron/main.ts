import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	app,
	BrowserWindow,
	ipcMain,
	Menu,
	Notification,
	nativeImage,
	session,
	shell,
	systemPreferences,
	Tray,
} from "electron";
import { formatAccelerator } from "../src/lib/appSettings";
import type { EditorLaunchOptions } from "../src/lib/editorLaunch";
import { ShortcutBinding } from "../src/lib/shortcuts";
import { AppSettingsStore } from "./appSettings";
import { isDiagnosticModeEnabled, mainLogBuffer } from "./diagnostics/main-log-buffer";
import {
	isAcceleratorAvailable,
	loadAndRegisterGlobalShortcut,
	registerOpenAppShortcut,
	registerQuickRecordShortcut,
	suspendQuickRecordShortcut,
	unregisterAllGlobalShortcuts,
} from "./globalShortcut";
import { mainT, setMainLocale } from "./i18n";
import {
	registerYandexDiskIpcHandlers,
	type YandexDiskIntegration,
} from "./integrations/yandexDisk";
import {
	approveVideoPathForEditor,
	getSelectedDesktopSource,
	registerIpcHandlers,
	selectScreenSourceForDisplay,
} from "./ipc/handlers";
import { type QuickCaptureController, registerQuickCaptureIpcHandlers } from "./ipc/quickCapture";
import {
	hasSpeechRuntime,
	registerSpeechModelProtocol,
	registerSpeechScheme,
} from "./ipc/speechModels";
import { acquireStableInstanceLock } from "./singleInstanceLock";
import {
	createCountdownOverlayWindow,
	createEditorWindow,
	createHudOverlayWindow,
	createSourceSelectorWindow,
	getHudOverlayWindow,
} from "./windows";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.setName("OpenScreen");
if (process.platform === "win32") {
	app.setAppUserModelId("com.etiennelescot.openscreen");
	process.title = "OpenScreen";
}

// Use Screen & System Audio Recording permissions instead of the CoreAudio Tap API on macOS.
// Tap needs NSAudioCaptureUsageDescription in the parent app's Info.plist, which breaks when
// running from a terminal/IDE during dev.
if (process.platform === "darwin") {
	app.commandLine.appendSwitch("disable-features", "MacCatapLoopbackAudioForScreenShare");
}

// Chromium features to switch on; passed as one switch, since a second "enable-features"
// would replace the first.
// SharedArrayBuffer lets transcription run ONNX Runtime on several threads; the pages
// are the app's own, so cross-origin isolation has nothing to protect here.
const enabledFeatures = ["SharedArrayBuffer"];

// Wayland support for screen capture and window management on Wayland compositors.
if (process.platform === "linux") {
	const isWayland =
		process.env.XDG_SESSION_TYPE === "wayland" || process.env.WAYLAND_DISPLAY !== undefined;
	if (isWayland) {
		app.commandLine.appendSwitch("ozone-platform", "wayland");
		// Enable WebRTCPipeWireCapturer for screen capture on Wayland
		enabledFeatures.push("WaylandWindowDrag", "WebRTCPipeWireCapturer");
		// Chromium's Wayland Ozone backend can't use Vulkan. When it tries, the WebRTC
		// PipeWire capturer fails to import DMA-BUF frames into EGL (EGL_BAD_MATCH), the
		// stream renegotiates, and screen recording yields no usable frames. Force the
		// GL/EGL path so DMA-BUF import works. (Chromium itself logs this suggestion:
		// "'--ozone-platform=wayland' is not compatible with Vulkan ... disabling Vulkan".)
		app.commandLine.appendSwitch("disable-features", "Vulkan");
	}
}

app.commandLine.appendSwitch("enable-features", enabledFeatures.join(","));
// Must happen before the app is ready.
registerSpeechScheme();

export const RECORDINGS_DIR = path.join(app.getPath("userData"), "recordings");

// Passed by the login item so the app starts straight into the tray.
const START_HIDDEN_ARG = "--hidden";
const launchedHidden = process.argv.includes(START_HIDDEN_ARG);

// The tray keeps the app (and its record hotkey) alive with no window open. Linux
// trays are unreliable across desktops, so there closing the last window still quits.
const staysInTray = process.platform !== "linux";

// How long a hidden, idle HUD keeps its renderer before the window is released. The
// HUD is rebuilt from persisted settings on the next hotkey press or tray click.
const HUD_IDLE_RELEASE_MS =
	Number(process.env["OPENSCREEN_HUD_IDLE_RELEASE_MS"]) > 0
		? Number(process.env["OPENSCREEN_HUD_IDLE_RELEASE_MS"])
		: 60_000;

async function ensureRecordingsDir() {
	try {
		await fs.mkdir(RECORDINGS_DIR, { recursive: true });
	} catch (error) {
		console.error("Failed to create recordings directory:", error);
	}
}

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, "..");

// Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
export const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
export const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
	? path.join(process.env.APP_ROOT, "public")
	: RENDERER_DIST;

// Window references
let mainWindow: BrowserWindow | null = null;
let sourceSelectorWindow: BrowserWindow | null = null;
let countdownOverlayWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let selectedSourceName = "";
let isRecording = false;
let isQuitting = false;
// The HUD reports work that must not be interrupted (finishing or uploading a clip).
let hudBusy = false;
let hudIdleReleaseTimer: NodeJS.Timeout | null = null;
let quickCapture: QuickCaptureController | null = null;
let activeQuickRecordShortcut: string | null = null;
const appSettings = new AppSettingsStore(app.getPath("userData"));
const isMac = process.platform === "darwin";
const trayIconSize = isMac ? 16 : 24;

// Tray Icons
const defaultTrayIcon = getTrayIcon("openscreen.png", trayIconSize);
const recordingTrayIcon = getTrayIcon("rec-button.png", trayIconSize);

function attachHudLifecycle(win: BrowserWindow) {
	win.on("hide", scheduleHudIdleRelease);
	win.on("show", cancelHudIdleRelease);
	win.on("closed", () => {
		cancelHudIdleRelease();
		hudBusy = false;
		quickCapture?.handleHudClosed();
		if (mainWindow === win) mainWindow = null;
		// The HUD owns the recording controls. If it went away while recording (replaced
		// by Studio from the app menu, or a renderer crash), nothing can stop that
		// recording any more, so stop treating the app as recording: otherwise the
		// hotkey would keep sending "stop" to a window that no longer exists.
		if (isRecording) {
			isRecording = false;
			updateTrayMenu(false);
		}
	});
}

function createWindow(options: { startHidden?: boolean } = {}) {
	if (mainWindow && !mainWindow.isDestroyed()) {
		return;
	}

	const win = createHudOverlayWindow(options);
	mainWindow = win;
	attachHudLifecycle(win);
	if (options.startHidden) scheduleHudIdleRelease();
}

function showMainWindow() {
	if (mainWindow && !mainWindow.isDestroyed()) {
		if (mainWindow.isMinimized()) {
			mainWindow.restore();
		}
		mainWindow.show();
		mainWindow.focus();
		return;
	}

	createWindow();
}

function cancelHudIdleRelease() {
	if (hudIdleReleaseTimer) {
		clearTimeout(hudIdleReleaseTimer);
		hudIdleReleaseTimer = null;
	}
}

/**
 * A hidden HUD still costs a whole renderer process. Once it has sat idle in the tray
 * for a while, drop the window; the tray and hotkey bring a fresh one back on demand.
 */
function scheduleHudIdleRelease() {
	cancelHudIdleRelease();
	if (!staysInTray) return;

	hudIdleReleaseTimer = setTimeout(() => {
		hudIdleReleaseTimer = null;
		const hud = getHudOverlayWindow();
		if (!hud || hud.isVisible()) return;
		// Hidden but still working (recording, finishing a clip, picking an area): check back.
		if (isRecording || hudBusy || quickCapture?.isRegionSelectorOpen()) {
			scheduleHudIdleRelease();
			return;
		}
		hud.destroy();
	}, HUD_IDLE_RELEASE_MS);
}

function hideHudToTray() {
	const hud = getHudOverlayWindow();
	if (hud) hud.hide();
}

/**
 * The first time the recorder is closed, say that it is still running: an app that
 * silently stays in the tray otherwise looks like it quit (or like it won't quit).
 */
function showTrayHintOnce() {
	if (HEADLESS) return;
	if (appSettings.get().trayHintShown || !Notification.isSupported()) return;
	void appSettings.update({ trayHintShown: true });

	const shortcutLabel = formatAccelerator(activeQuickRecordShortcut, process.platform);
	new Notification({
		title: "OpenScreen is still running",
		body: shortcutLabel
			? `It waits in the tray. Press ${shortcutLabel} to record, or right-click the tray icon to quit.`
			: "It waits in the tray. Right-click the tray icon to record or quit.",
	}).show();
}

/** The record hotkey: stops a running recording, otherwise starts a new capture. */
function handleQuickRecordShortcut() {
	if (isRecording) {
		const hud = getHudOverlayWindow();
		if (hud) hud.webContents.send("stop-recording-from-tray");
		return;
	}
	// While Studio is open the main window is the editor; leave it alone.
	if (mainWindow && !mainWindow.isDestroyed() && isEditorWindow(mainWindow)) {
		mainWindow.show();
		mainWindow.focus();
		return;
	}

	requestHudCapture("quick-record");
}

/**
 * Hands a capture request to the HUD without forcing it on screen: an area capture
 * goes straight to the area picker, so the HUD decides when it needs to be visible.
 */
function requestHudCapture(command: "quick-record" | "record-area") {
	if (!getHudOverlayWindow()) {
		createWindow({ startHidden: true });
	}
	// createWindow does nothing while another main window (Studio) is still up.
	if (!getHudOverlayWindow()) return;
	quickCapture?.sendHudCommand(command);
}

// A headless run with its own profile (tests, background checks) has to stay out of the
// way of whoever is using the machine, and of a real OpenScreen that may be running
// beside it: it takes no machine-wide lock, shows no tray icon and grabs no global
// hotkeys. (Electron's own instance lock is per profile, so it does not collide either.)
// Both conditions are required, so a stray HEADLESS variable in someone's environment
// cannot leave a normally launched app without its tray icon.
const HEADLESS = process.env["HEADLESS"] === "true" && app.commandLine.hasSwitch("user-data-dir");

function applyQuickRecordShortcut(preferred: string | null) {
	activeQuickRecordShortcut = HEADLESS
		? null
		: registerQuickRecordShortcut(preferred, handleQuickRecordShortcut);
	updateTrayMenu(isRecording);
	return activeQuickRecordShortcut;
}

function applyLaunchAtLogin(enabled: boolean) {
	// A dev build would register electron.exe itself as the login item.
	if (!app.isPackaged) return;
	app.setLoginItemSettings({
		openAtLogin: enabled,
		args: enabled ? [START_HIDDEN_ARG] : [],
	});
}

const stableInstanceLock = HEADLESS
	? { lockDir: "", release: () => undefined }
	: acquireStableInstanceLock();
const hasElectronSingleInstanceLock = app.requestSingleInstanceLock();
const hasSingleInstanceLock = Boolean(stableInstanceLock && hasElectronSingleInstanceLock);

if (hasSingleInstanceLock) {
	app.on("second-instance", () => {
		showMainWindow();
	});
} else {
	stableInstanceLock?.release();
	app.quit();
}

function isEditorWindow(window: BrowserWindow) {
	return window.webContents.getURL().includes("windowType=editor");
}

function sendEditorMenuAction(
	channel: "menu-load-project" | "menu-save-project" | "menu-save-project-as" | "menu-new-project",
) {
	let targetWindow = BrowserWindow.getFocusedWindow() ?? mainWindow;

	if (!targetWindow || targetWindow.isDestroyed() || !isEditorWindow(targetWindow)) {
		createEditorWindowWrapper();
		targetWindow = mainWindow;
		if (!targetWindow || targetWindow.isDestroyed()) return;

		targetWindow.webContents.once("did-finish-load", () => {
			if (!targetWindow || targetWindow.isDestroyed()) return;
			targetWindow.webContents.send(channel);
		});
		return;
	}

	targetWindow.webContents.send(channel);
}

function setupApplicationMenu() {
	const isMac = process.platform === "darwin";
	const template: Electron.MenuItemConstructorOptions[] = [];

	if (isMac) {
		template.push({
			label: app.name,
			submenu: [
				{
					role: "about",
					label: mainT("common", "actions.about") || "About OpenScreen",
				},
				{ type: "separator" },
				{
					role: "services",
					label: mainT("common", "actions.services") || "Services",
				},
				{ type: "separator" },
				{
					role: "hide",
					label: mainT("common", "actions.hide") || "Hide OpenScreen",
				},
				{
					role: "hideOthers",
					label: mainT("common", "actions.hideOthers") || "Hide Others",
				},
				{
					role: "unhide",
					label: mainT("common", "actions.unhide") || "Show All",
				},
				{ type: "separator" },
				{ role: "quit", label: mainT("common", "actions.quit") || "Quit" },
			],
		});
	}

	template.push(
		{
			label: mainT("common", "actions.file") || "File",
			submenu: [
				{
					label: mainT("dialogs", "unsavedChanges.newProject") || "New Project",
					accelerator: "CmdOrCtrl+N",
					click: () => sendEditorMenuAction("menu-new-project"),
				},
				{ type: "separator" as const },
				{
					label: mainT("dialogs", "unsavedChanges.loadProject") || "Load Project…",
					accelerator: "CmdOrCtrl+O",
					click: () => sendEditorMenuAction("menu-load-project"),
				},
				{
					label: mainT("dialogs", "unsavedChanges.saveProject") || "Save Project…",
					accelerator: "CmdOrCtrl+S",
					click: () => sendEditorMenuAction("menu-save-project"),
				},
				{
					label: mainT("dialogs", "unsavedChanges.saveProjectAs") || "Save Project As…",
					accelerator: "CmdOrCtrl+Shift+S",
					click: () => sendEditorMenuAction("menu-save-project-as"),
				},
				...(isMac
					? []
					: [
							{ type: "separator" as const },
							{
								role: "quit" as const,
								label: mainT("common", "actions.quit") || "Quit",
							},
						]),
			],
		},
		{
			label: mainT("common", "actions.edit") || "Edit",
			submenu: [
				{ role: "undo", label: mainT("common", "actions.undo") || "Undo" },
				{ role: "redo", label: mainT("common", "actions.redo") || "Redo" },
				{ type: "separator" },
				{ role: "cut", label: mainT("common", "actions.cut") || "Cut" },
				{ role: "copy", label: mainT("common", "actions.copy") || "Copy" },
				{ role: "paste", label: mainT("common", "actions.paste") || "Paste" },
				{
					role: "selectAll",
					label: mainT("common", "actions.selectAll") || "Select All",
				},
			],
		},
		{
			label: mainT("common", "actions.view") || "View",
			submenu: [
				{
					role: "reload",
					label: mainT("common", "actions.reload") || "Reload",
				},
				{
					role: "forceReload",
					label: mainT("common", "actions.forceReload") || "Force Reload",
				},
				{
					role: "toggleDevTools",
					label: mainT("common", "actions.toggleDevTools") || "Toggle Developer Tools",
				},
				{ type: "separator" },
				{
					role: "resetZoom",
					label: mainT("common", "actions.actualSize") || "Actual Size",
				},
				{
					role: "zoomIn",
					label: mainT("common", "actions.zoomIn") || "Zoom In",
				},
				{
					role: "zoomOut",
					label: mainT("common", "actions.zoomOut") || "Zoom Out",
				},
				{ type: "separator" },
				{
					role: "togglefullscreen",
					label: mainT("common", "actions.toggleFullScreen") || "Toggle Full Screen",
				},
			],
		},
		{
			label: mainT("common", "actions.window") || "Window",
			submenu: isMac
				? [
						{
							role: "minimize",
							label: mainT("common", "actions.minimize") || "Minimize",
						},
						{ role: "zoom" },
						{ type: "separator" },
						{ role: "front" },
					]
				: [
						{
							role: "minimize",
							label: mainT("common", "actions.minimize") || "Minimize",
						},
						{
							role: "close",
							label: mainT("common", "actions.close") || "Close",
						},
					],
		},
	);

	const menu = Menu.buildFromTemplate(template);
	Menu.setApplicationMenu(menu);
}

function createTray() {
	if (HEADLESS) return;
	tray = new Tray(defaultTrayIcon);
	tray.on("click", () => {
		showMainWindow();
	});
	tray.on("double-click", () => {
		showMainWindow();
	});
}

function getTrayIcon(filename: string, size: number) {
	return nativeImage
		.createFromPath(path.join(process.env.VITE_PUBLIC || RENDERER_DIST, filename))
		.resize({
			width: size,
			height: size,
			quality: "best",
		});
}

function updateTrayMenu(recording: boolean = false) {
	if (!tray) return;
	const trayIcon = recording ? recordingTrayIcon : defaultTrayIcon;
	const idleShortcutLabel = formatAccelerator(activeQuickRecordShortcut, process.platform);
	const trayToolTip = recording
		? mainT("common", "actions.recordingStatus", {
				source: selectedSourceName,
			}) || `Recording: ${selectedSourceName}`
		: idleShortcutLabel
			? `OpenScreen — ${idleShortcutLabel} to record`
			: "OpenScreen";
	const shortcutLabel = formatAccelerator(activeQuickRecordShortcut, process.platform);
	const shortcutHint = shortcutLabel ? `  (${shortcutLabel})` : "";
	const menuTemplate: Electron.MenuItemConstructorOptions[] = recording
		? [
				{
					label: `${mainT("common", "actions.stopRecording") || "Stop Recording"}${shortcutHint}`,
					click: () => {
						if (mainWindow && !mainWindow.isDestroyed()) {
							mainWindow.webContents.send("stop-recording-from-tray");
						}
					},
				},
			]
		: [
				{
					label: `Record Area…${shortcutHint}`,
					click: () => {
						if (mainWindow && !mainWindow.isDestroyed() && isEditorWindow(mainWindow)) {
							mainWindow.show();
							mainWindow.focus();
							return;
						}
						requestHudCapture("record-area");
					},
				},
				{
					label: mainT("common", "actions.open") || "Open",
					click: () => {
						showMainWindow();
					},
				},
				{ type: "separator" },
				{
					label: mainT("common", "actions.quit") || "Quit",
					click: () => {
						app.quit();
					},
				},
			];
	tray.setImage(trayIcon);
	tray.setToolTip(trayToolTip);
	tray.setContextMenu(Menu.buildFromTemplate(menuTemplate));
}

let editorHasUnsavedChanges = false;
let isForceClosing = false;
let isCloseConfirmInFlight = false;
let yandexDiskIntegration: YandexDiskIntegration | null = null;

ipcMain.on("set-has-unsaved-changes", (_, hasChanges: boolean) => {
	editorHasUnsavedChanges = hasChanges;
});

// Quit requested from the editor's in-app File menu. Mirrors the native
// menu's role:"quit" so the unsaved-changes close flow still runs.
ipcMain.on("app-quit", () => {
	app.quit();
});

function forceCloseEditorWindow(windowToClose: BrowserWindow | null) {
	if (!windowToClose || windowToClose.isDestroyed()) return;

	isForceClosing = true;
	setImmediate(() => {
		try {
			if (!windowToClose.isDestroyed()) {
				windowToClose.close();
			}
		} finally {
			isForceClosing = false;
		}
	});
}

function createEditorWindowWrapper(options: EditorLaunchOptions = {}) {
	if (mainWindow) {
		isForceClosing = true;
		mainWindow.close();
		isForceClosing = false;
		mainWindow = null;
	}
	const editorWindow = createEditorWindow(options);
	mainWindow = editorWindow;
	editorWindow.on("closed", () => {
		// Replaced by another window (e.g. Return to Recorder): nothing to clean up here.
		if (mainWindow !== editorWindow) return;
		mainWindow = null;
		yandexDiskIntegration?.setEditorActive(false);
		// Studio was closed outright, which leaves the app in the tray.
		if (staysInTray && !isQuitting) showTrayHintOnce();
	});
	yandexDiskIntegration?.setEditorActive(true);
	editorHasUnsavedChanges = false;

	mainWindow.on("close", (event) => {
		if (isForceClosing || !editorHasUnsavedChanges || isCloseConfirmInFlight) return;

		event.preventDefault();
		isCloseConfirmInFlight = true;

		// Preventing the close also cancels a quit in progress. Remember that one was
		// asked for, so Save/Discard can finish it, and clear the flag so that a Cancel
		// does not leave the tray-resident app quitting the next time its windows close.
		const quitAfterClose = isQuitting;
		isQuitting = false;
		const closeAndMaybeQuit = (target: BrowserWindow) => {
			forceCloseEditorWindow(target);
			if (quitAfterClose) setImmediate(() => app.quit());
		};

		const windowToClose = mainWindow;
		if (!windowToClose || windowToClose.isDestroyed()) return;

		// Ask renderer to show the in-app close dialog.
		windowToClose.webContents.send("request-close-confirm");

		ipcMain.once("close-confirm-response", (event, choice: "save" | "discard" | "cancel") => {
			if (event.sender.id !== windowToClose?.webContents.id) return;
			isCloseConfirmInFlight = false;
			if (!windowToClose || windowToClose.isDestroyed()) return;

			if (choice === "save") {
				// Save first, then close when the renderer reports done.
				windowToClose.webContents.send("request-save-before-close");
				ipcMain.once("save-before-close-done", (event, shouldClose: boolean) => {
					if (event.sender.id !== windowToClose?.webContents.id) return;
					if (!shouldClose) return;
					closeAndMaybeQuit(windowToClose);
				});
			} else if (choice === "discard") {
				closeAndMaybeQuit(windowToClose);
			}
			// "cancel": flag reset, window stays open
		});
	});
}

function createSourceSelectorWindowWrapper(tab?: "screens" | "windows") {
	sourceSelectorWindow = createSourceSelectorWindow(tab);
	sourceSelectorWindow.on("closed", () => {
		sourceSelectorWindow = null;
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.webContents.send("source-selector-closed");
		}
	});
	return sourceSelectorWindow;
}

function createCountdownOverlayWindowWrapper() {
	if (countdownOverlayWindow && !countdownOverlayWindow.isDestroyed()) {
		return countdownOverlayWindow;
	}

	countdownOverlayWindow = createCountdownOverlayWindow();
	countdownOverlayWindow.on("closed", () => {
		countdownOverlayWindow = null;
	});
	return countdownOverlayWindow;
}

// Closing every window quits the app (tray goes too). The in-app "Return to Recorder"
// button covers the editor-to-HUD round-trip, so closing the last window means "I'm done".
app.on("window-all-closed", () => {
	// With no window left the app keeps running in the tray, so the record hotkey stays
	// live and the next capture starts instantly. Quitting is explicit (tray or HUD menu).
	if (!staysInTray || isQuitting) {
		app.quit();
	}
});

app.on("before-quit", () => {
	isQuitting = true;
});

app.on("activate", () => {
	// On macOS, re-open a window when the dock icon is clicked and none are open.
	const hasVisibleWindow = BrowserWindow.getAllWindows().some((window) => {
		if (window.isDestroyed() || !window.isVisible()) {
			return false;
		}

		const url = window.webContents.getURL();
		const isCountdownOverlayWindow = url.includes("windowType=countdown-overlay");
		return !isCountdownOverlayWindow;
	});
	if (!hasVisibleWindow) {
		showMainWindow();
	}
});

app.on("will-quit", () => {
	quickCapture?.abortOpenOutputs();
	unregisterAllGlobalShortcuts();
	stableInstanceLock?.release();
});

const appReady = hasSingleInstanceLock ? app.whenReady() : null;

appReady?.then(async () => {
	if (isDiagnosticModeEnabled()) {
		mainLogBuffer.install();
		console.info("[diagnostic] OPENSCREEN_DIAGNOSTIC=1, capturing console.* into ring buffer");
	}

	// Force "regular" activation policy so the Dock icon appears. The HUD overlay
	// (transparent, frameless, skipTaskbar) is the first window, and AppKit would
	// otherwise classify us as an accessory app.
	if (process.platform === "darwin") {
		app.dock?.show();
	}

	session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
		const allowed = [
			"media",
			"audioCapture",
			"microphone",
			"videoCapture",
			"camera",
			"screen",
			"display-capture",
		];
		return allowed.includes(permission);
	});

	session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
		const allowed = [
			"media",
			"audioCapture",
			"microphone",
			"videoCapture",
			"camera",
			"screen",
			"display-capture",
		];
		callback(allowed.includes(permission));
	});

	session.defaultSession.setDisplayMediaRequestHandler(
		(request, callback) => {
			const source = getSelectedDesktopSource();
			if (!request.videoRequested || !source) {
				callback({});
				return;
			}

			callback({
				video: source,
				...(request.audioRequested && process.platform === "win32" ? { audio: "loopback" } : {}),
			});
		},
		{ useSystemPicker: false },
	);

	// Request mic permission now. Screen Recording is requested lazily from the
	// source-picker action so its prompt isn't hidden behind the selector window.
	if (process.platform === "darwin") {
		const micStatus = systemPreferences.getMediaAccessStatus("microphone");
		if (micStatus !== "granted") {
			await systemPreferences.askForMediaAccess("microphone");
		}
	}

	// Closing the HUD keeps the recorder one hotkey away; Quit lives in its menu.
	ipcMain.on("hud-overlay-close", () => {
		if (staysInTray) {
			hideHudToTray();
			showTrayHintOnce();
		} else {
			app.quit();
		}
	});
	ipcMain.on("hud-overlay-show", () => {
		const hud = getHudOverlayWindow();
		if (hud) {
			hud.show();
			hud.focus();
		}
	});
	ipcMain.on("hud-set-busy", (_, busy: boolean) => {
		hudBusy = busy === true;
		if (!hudBusy) {
			const hud = getHudOverlayWindow();
			if (hud && !hud.isVisible()) scheduleHudIdleRelease();
		}
	});
	ipcMain.handle("set-locale", (_, locale: string) => {
		setMainLocale(locale);
		setupApplicationMenu();
		updateTrayMenu();
	});
	ipcMain.handle("finish-background-publish", (_, error?: string, savedPath?: string) => {
		const backgroundEditor = mainWindow;
		mainWindow = null;
		createWindow({ startHidden: true });
		yandexDiskIntegration?.setEditorActive(false);
		editorHasUnsavedChanges = false;
		if (Notification.isSupported() && (error || savedPath)) {
			const notification = new Notification({
				title: error ? "OpenScreen · Export failed" : "OpenScreen · Video saved",
				body: error ?? savedPath ?? "Export complete",
			});
			if (savedPath && !error) {
				notification.on("click", () => shell.showItemInFolder(savedPath));
			}
			notification.show();
		}
		if (backgroundEditor && !backgroundEditor.isDestroyed()) {
			forceCloseEditorWindow(backgroundEditor);
		}
		return { success: true };
	});

	ipcMain.handle("update-global-shortcut", (_, binding: ShortcutBinding) => {
		const success = HEADLESS || registerOpenAppShortcut(binding, showMainWindow);
		return { success };
	});

	createTray();
	updateTrayMenu();
	setupApplicationMenu();
	// Packaged: copied next to the app at build time (unless the Windows installer was told
	// to leave transcription out). Development: straight from the installed onnxruntime-web,
	// wherever npm placed it.
	const speechRuntimeDirs = app.isPackaged
		? [path.join(process.resourcesPath, "speech-runtime")]
		: [
				path.join(
					process.env.APP_ROOT ?? "",
					"node_modules/@huggingface/transformers/node_modules/onnxruntime-web/dist",
				),
				path.join(process.env.APP_ROOT ?? "", "node_modules/onnxruntime-web/dist"),
			];
	registerSpeechModelProtocol({
		cacheDir: path.join(app.getPath("userData"), "speech-models"),
		runtimeDirs: speechRuntimeDirs,
	});
	ipcMain.handle("speech-recognition-available", () => hasSpeechRuntime(speechRuntimeDirs));
	const yandexDisk = registerYandexDiskIpcHandlers(
		ipcMain,
		RECORDINGS_DIR,
		app.getPath("userData"),
	);
	yandexDiskIntegration = yandexDisk;

	quickCapture = registerQuickCaptureIpcHandlers(ipcMain, {
		settings: appSettings,
		recordingsDir: RECORDINGS_DIR,
		getHudWindow: getHudOverlayWindow,
		showHud: showMainWindow,
		hideHud: hideHudToTray,
		applyQuickRecordShortcut,
		getActiveQuickRecordShortcut: () => activeQuickRecordShortcut,
		isAcceleratorAvailable,
		applyLaunchAtLogin,
		canLaunchAtLogin: () => app.isPackaged,
		setShortcutCaptureActive: (active) => {
			if (active) {
				suspendQuickRecordShortcut();
				activeQuickRecordShortcut = null;
			} else {
				applyQuickRecordShortcut(appSettings.get().quickRecordShortcut);
			}
		},
		selectScreenSourceForDisplay,
		approveClipPath: (filePath) => {
			yandexDisk.approveUploadPath(filePath);
			approveVideoPathForEditor(filePath);
		},
		revokeClipPath: (filePath) => yandexDisk.revokeUploadPath(filePath),
	});

	function switchToHudWrapper() {
		if (mainWindow) {
			isForceClosing = true;
			mainWindow.close();
			isForceClosing = false;
			mainWindow = null;
		}
		yandexDiskIntegration?.setEditorActive(false);
		showMainWindow();
	}

	registerIpcHandlers(
		createEditorWindowWrapper,
		createSourceSelectorWindowWrapper,
		createCountdownOverlayWindowWrapper,
		() => mainWindow,
		() => sourceSelectorWindow,
		() => countdownOverlayWindow,
		(recording: boolean, sourceName: string) => {
			selectedSourceName = sourceName;
			isRecording = recording;
			if (!tray) createTray();
			updateTrayMenu(recording);
			if (!recording) {
				quickCapture?.hideRegionFrame();
				showMainWindow();
			}
		},
		switchToHudWrapper,
	);

	// Show the recorder first; everything below only has to be ready before first use.
	// Login-item arguments are Windows-only, so macOS is asked whether this is a login
	// launch instead.
	const startInTray =
		launchedHidden ||
		(process.platform === "darwin" && app.getLoginItemSettings().wasOpenedAtLogin === true);
	if (!startInTray) {
		createWindow();
	}

	await Promise.all([ensureRecordingsDir(), appSettings.load()]);
	if (!HEADLESS) await loadAndRegisterGlobalShortcut(showMainWindow);
	applyQuickRecordShortcut(appSettings.get().quickRecordShortcut);
	if (app.isPackaged) {
		applyLaunchAtLogin(appSettings.get().launchAtLogin);
	}
});
