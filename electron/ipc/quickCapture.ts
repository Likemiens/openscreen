import { spawn } from "node:child_process";
import type { FileHandle } from "node:fs/promises";
import fs from "node:fs/promises";
import path from "node:path";
import {
	type BrowserWindow,
	clipboard,
	dialog,
	type IpcMain,
	nativeImage,
	screen,
	shell,
} from "electron";
import type { AppSettings, AppSettingsView } from "../../src/lib/appSettings";
import { normalizeAccelerator } from "../../src/lib/appSettings";
import {
	type CaptureRegion,
	clampRegionRect,
	MIN_REGION_SIZE,
	normalizeCaptureRegion,
} from "../../src/lib/captureRegion";
import type {
	ClipFileResult,
	HudCommand,
	RegionSelectionResult,
	RegionSelectorContext,
} from "../../src/lib/quickCaptureContracts";
import { buildPublishedFileName, sanitizeRecordingTitle } from "../../src/lib/recordingDraft";
import type { AppSettingsStore } from "../appSettings";
import { createRegionFrameWindow, createRegionSelectorWindow } from "../windows";

const PARTIAL_SUFFIX = ".partial";
// Cap renderer-supplied chunks so a bug cannot make the main process allocate without bound.
const MAX_WRITE_CHUNK_BYTES = 64 * 1024 * 1024;
const CLIPBOARD_TIMEOUT_MS = 8_000;
// A capture requested for a HUD that is still loading is only meaningful for a moment.
const HUD_COMMAND_TTL_MS = 15_000;

export interface QuickCaptureDeps {
	settings: AppSettingsStore;
	recordingsDir: string;
	getHudWindow: () => BrowserWindow | null;
	showHud: () => void;
	hideHud: () => void;
	/** Registers the record hotkey and returns the accelerator that took effect. */
	applyQuickRecordShortcut: (preferred: string | null) => string | null;
	getActiveQuickRecordShortcut: () => string | null;
	isAcceleratorAvailable: (accelerator: string) => boolean;
	applyLaunchAtLogin: (enabled: boolean) => void;
	canLaunchAtLogin: () => boolean;
	/** Suspends the record hotkey while the user is typing a new one into the HUD. */
	setShortcutCaptureActive: (active: boolean) => void;
	selectScreenSourceForDisplay: (displayId: number) => Promise<unknown | null>;
	/** Lets the editor and the uploader touch a clip saved outside the recordings folder. */
	approveClipPath: (filePath: string) => void;
	revokeClipPath: (filePath: string) => void;
}

export interface QuickCaptureController {
	/** Delivers a command to the HUD, queueing it until the HUD renderer is ready. */
	sendHudCommand: (command: HudCommand) => void;
	hideRegionFrame: () => void;
	closeRegionSelector: () => void;
	isRegionSelectorOpen: () => boolean;
	/** Call when the HUD window is destroyed: drops everything that belonged to it. */
	handleHudClosed: () => void;
	/** Closes and removes clips that are still being written (the HUD went away or the app quits). */
	abortOpenOutputs: () => void;
}

interface OpenClipOutput {
	handle: FileHandle;
	tempPath: string;
	finalPath: string;
}

function normalizeForComparison(filePath: string): string {
	const resolved = path.resolve(filePath);
	return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isPathWithin(filePath: string, directory: string): boolean {
	const file = normalizeForComparison(filePath);
	const dir = normalizeForComparison(directory);
	return file.startsWith(`${dir}${path.sep}`);
}

async function pathExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

/** `<folder>/<title>.mp4`, with " (2)", " (3)"… appended until the name is free. */
async function resolveUniqueClipPath(
	folder: string,
	title: unknown,
	ignorePath?: string,
): Promise<string> {
	const baseName = sanitizeRecordingTitle(title);
	const ignored = ignorePath ? normalizeForComparison(ignorePath) : null;
	for (let attempt = 1; attempt < 1000; attempt += 1) {
		const candidateTitle = attempt === 1 ? baseName : `${baseName} (${attempt})`;
		const candidate = path.join(folder, buildPublishedFileName(candidateTitle));
		if (ignored && normalizeForComparison(candidate) === ignored) return candidate;
		if (!(await pathExists(candidate)) && !(await pathExists(`${candidate}${PARTIAL_SUFFIX}`))) {
			return candidate;
		}
	}
	return path.join(folder, buildPublishedFileName(`${baseName} ${Date.now()}`));
}

function runClipboardCommand(
	command: string,
	args: string[],
	env: NodeJS.ProcessEnv,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { env, windowsHide: true, stdio: "ignore" });
		const timer = setTimeout(() => {
			child.kill();
			reject(new Error("Timed out while copying the file."));
		}, CLIPBOARD_TIMEOUT_MS);
		child.once("error", (error) => {
			clearTimeout(timer);
			reject(error);
		});
		child.once("exit", (code) => {
			clearTimeout(timer);
			if (code === 0) resolve();
			else reject(new Error(`Clipboard helper exited with code ${code}.`));
		});
	});
}

/**
 * Puts the file itself (not its path) on the clipboard, so it can be pasted into a
 * chat or a folder. Returns "path" when the platform only allowed copying the path.
 */
async function copyFileToClipboard(filePath: string): Promise<"file" | "path"> {
	if (process.platform === "win32") {
		// The path travels in the environment, never through the command line, so a
		// file name can't be interpreted as PowerShell.
		await runClipboardCommand(
			"powershell.exe",
			[
				"-NoProfile",
				"-NonInteractive",
				"-ExecutionPolicy",
				"Bypass",
				"-Command",
				"Set-Clipboard -LiteralPath $env:OPENSCREEN_CLIP_PATH",
			],
			{ ...process.env, OPENSCREEN_CLIP_PATH: filePath },
		);
		return "file";
	}

	if (process.platform === "darwin") {
		await runClipboardCommand(
			"osascript",
			[
				"-e",
				"on run argv",
				"-e",
				"set the clipboard to (POSIX file (item 1 of argv))",
				"-e",
				"end run",
				filePath,
			],
			process.env,
		);
		return "file";
	}

	clipboard.writeText(filePath);
	return "path";
}

export function registerQuickCaptureIpcHandlers(
	ipcMain: IpcMain,
	deps: QuickCaptureDeps,
): QuickCaptureController {
	const outputs = new Map<string, OpenClipOutput>();
	// Clips produced in this session. File operations requested by the renderer are
	// limited to these, so a stale path can never rename or trash an unrelated file.
	const knownClips = new Map<string, string>();

	let regionSelectorWindow: BrowserWindow | null = null;
	let regionSelectorContext: RegionSelectorContext | null = null;
	let resolveRegionSelection: ((result: RegionSelectionResult) => void) | null = null;
	let hudVisibleBeforeRegionSelection = false;
	let regionFrameWindow: BrowserWindow | null = null;

	let pendingHudCommand: { command: HudCommand; at: number } | null = null;
	let readyHudWebContentsId: number | null = null;

	// startDrag must run while the mouse button is still down, so the drag image is
	// prepared ahead of time when the card asks for its thumbnail.
	const dragIcons = new Map<string, Electron.NativeImage>();
	const fallbackDragIcon = nativeImage
		.createFromPath(path.join(process.env.VITE_PUBLIC ?? "", "openscreen.png"))
		.resize({ width: 64, height: 64 });

	function rememberClip(filePath: string) {
		knownClips.set(normalizeForComparison(filePath), filePath);
		deps.approveClipPath(filePath);
	}

	function forgetClip(filePath: string) {
		dragIcons.delete(normalizeForComparison(filePath));
		knownClips.delete(normalizeForComparison(filePath));
		deps.revokeClipPath(filePath);
	}

	function resolveKnownClip(filePath: unknown): string | null {
		if (typeof filePath !== "string") return null;
		return knownClips.get(normalizeForComparison(filePath)) ?? null;
	}

	async function describeClip(filePath: string): Promise<ClipFileResult> {
		const stats = await fs.stat(filePath);
		return { success: true, path: filePath, size: stats.size };
	}

	async function buildSettingsView(): Promise<AppSettingsView> {
		return {
			...deps.settings.get(),
			resolvedSaveFolder: await deps.settings.resolveSaveFolder(),
			activeQuickRecordShortcut: deps.getActiveQuickRecordShortcut(),
			platform: process.platform,
			canLaunchAtLogin: deps.canLaunchAtLogin(),
		};
	}

	// --- App settings -------------------------------------------------------------

	ipcMain.handle("app-settings-get", async () => buildSettingsView());

	ipcMain.handle("app-settings-update", async (_, patch: Partial<AppSettings>) => {
		try {
			const next: Partial<AppSettings> = {};

			if ("saveFolder" in patch) {
				const folder = typeof patch.saveFolder === "string" ? patch.saveFolder.trim() : "";
				if (folder) {
					if (!path.isAbsolute(folder)) throw new Error("Choose an absolute folder path.");
					await fs.mkdir(folder, { recursive: true });
				}
				next.saveFolder = folder || null;
			}

			if ("launchAtLogin" in patch) {
				const enabled = patch.launchAtLogin === true;
				deps.applyLaunchAtLogin(enabled);
				next.launchAtLogin = enabled;
			}

			if ("quickRecordShortcut" in patch) {
				if (patch.quickRecordShortcut === null) {
					next.quickRecordShortcut = null;
					deps.applyQuickRecordShortcut(null);
				} else {
					const accelerator = normalizeAccelerator(patch.quickRecordShortcut);
					if (!accelerator) {
						throw new Error("Use at least one modifier (Ctrl, Alt, Shift or Win) plus a key.");
					}
					if (!deps.isAcceleratorAvailable(accelerator)) {
						throw new Error("That shortcut is already used by Windows or another app.");
					}
					next.quickRecordShortcut = accelerator;
					deps.applyQuickRecordShortcut(accelerator);
				}
			}

			await deps.settings.update(next);
			return { success: true, settings: await buildSettingsView() };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
				settings: await buildSettingsView(),
			};
		}
	});

	ipcMain.on("app-settings-shortcut-capture", (_, active: boolean) => {
		deps.setShortcutCaptureActive(active === true);
	});

	ipcMain.handle("app-settings-pick-save-folder", async () => {
		const hud = deps.getHudWindow();
		const options: Electron.OpenDialogOptions = {
			title: "Choose where clips are saved",
			defaultPath: await deps.settings.resolveSaveFolder(),
			properties: ["openDirectory", "createDirectory"],
		};
		const result = hud
			? await dialog.showOpenDialog(hud, options)
			: await dialog.showOpenDialog(options);
		if (result.canceled || result.filePaths.length === 0) {
			return { success: false, canceled: true, settings: await buildSettingsView() };
		}
		await deps.settings.update({ saveFolder: result.filePaths[0] });
		return { success: true, settings: await buildSettingsView() };
	});

	ipcMain.handle("app-settings-open-save-folder", async () => {
		const error = await shell.openPath(await deps.settings.resolveSaveFolder());
		return error ? { success: false, error } : { success: true };
	});

	// --- Clip files -----------------------------------------------------------------

	ipcMain.handle("quick-clip-open-output", async (_, title: unknown) => {
		try {
			const folder = await deps.settings.resolveSaveFolder();
			const finalPath = await resolveUniqueClipPath(folder, title);
			const tempPath = `${finalPath}${PARTIAL_SUFFIX}`;
			const handle = await fs.open(tempPath, "w");
			const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
			outputs.set(id, { handle, tempPath, finalPath });
			return { success: true, id, path: finalPath };
		} catch (error) {
			return { success: false, error: error instanceof Error ? error.message : String(error) };
		}
	});

	ipcMain.handle(
		"quick-clip-write",
		async (_, id: string, position: number, data: ArrayBuffer | Uint8Array) => {
			const output = outputs.get(id);
			if (!output) return { success: false, error: "The clip output is not open." };
			const buffer = Buffer.from(data instanceof ArrayBuffer ? new Uint8Array(data) : data);
			if (
				!Number.isSafeInteger(position) ||
				position < 0 ||
				buffer.byteLength > MAX_WRITE_CHUNK_BYTES
			) {
				return { success: false, error: "Invalid clip write." };
			}
			try {
				await output.handle.write(buffer, 0, buffer.byteLength, position);
				return { success: true };
			} catch (error) {
				return { success: false, error: error instanceof Error ? error.message : String(error) };
			}
		},
	);

	ipcMain.handle(
		"quick-clip-close-output",
		async (_, id: string, discard?: boolean): Promise<ClipFileResult> => {
			const output = outputs.get(id);
			if (!output) return { success: false, error: "The clip output is not open." };
			outputs.delete(id);
			try {
				await output.handle.close();
				if (discard) {
					await fs.rm(output.tempPath, { force: true });
					return { success: true, discarded: true };
				}
				await fs.rename(output.tempPath, output.finalPath);
				rememberClip(output.finalPath);
				return await describeClip(output.finalPath);
			} catch (error) {
				await fs.rm(output.tempPath, { force: true }).catch(() => undefined);
				return { success: false, error: error instanceof Error ? error.message : String(error) };
			}
		},
	);

	// A recording that needs no crop or scale is already the final file: copy it as-is.
	ipcMain.handle(
		"quick-clip-copy-source",
		async (_, sourcePath: string, title: unknown): Promise<ClipFileResult> => {
			try {
				if (typeof sourcePath !== "string" || !isPathWithin(sourcePath, deps.recordingsDir)) {
					return { success: false, error: "Only OpenScreen recordings can be saved as clips." };
				}
				const folder = await deps.settings.resolveSaveFolder();
				const finalPath = await resolveUniqueClipPath(folder, title);
				const tempPath = `${finalPath}${PARTIAL_SUFFIX}`;
				try {
					await fs.copyFile(sourcePath, tempPath);
					await fs.rename(tempPath, finalPath);
				} catch (error) {
					await fs.rm(tempPath, { force: true }).catch(() => undefined);
					throw error;
				}
				rememberClip(finalPath);
				return await describeClip(finalPath);
			} catch (error) {
				return { success: false, error: error instanceof Error ? error.message : String(error) };
			}
		},
	);

	ipcMain.handle(
		"quick-clip-rename",
		async (_, filePath: string, title: unknown): Promise<ClipFileResult> => {
			const current = resolveKnownClip(filePath);
			if (!current) return { success: false, error: "This clip is no longer available." };
			try {
				const nextPath = await resolveUniqueClipPath(path.dirname(current), title, current);
				if (normalizeForComparison(nextPath) !== normalizeForComparison(current)) {
					await fs.rename(current, nextPath);
					const dragIcon = dragIcons.get(normalizeForComparison(current));
					if (dragIcon) dragIcons.set(normalizeForComparison(nextPath), dragIcon);
					forgetClip(current);
					rememberClip(nextPath);
				}
				return await describeClip(nextPath);
			} catch (error) {
				return { success: false, error: error instanceof Error ? error.message : String(error) };
			}
		},
	);

	ipcMain.handle("quick-clip-copy-file", async (_, filePath: string) => {
		const clip = resolveKnownClip(filePath);
		if (!clip) return { success: false, error: "This clip is no longer available." };
		try {
			return { success: true, copied: await copyFileToClipboard(clip) };
		} catch (error) {
			console.warn("Failed to copy the clip file, copying its path instead:", error);
			clipboard.writeText(clip);
			return { success: true, copied: "path" as const };
		}
	});

	ipcMain.handle("quick-clip-thumbnail", async (_, filePath: string) => {
		const clip = resolveKnownClip(filePath);
		if (!clip) return { success: false };
		try {
			const image = await nativeImage.createThumbnailFromPath(clip, { width: 480, height: 270 });
			if (image.isEmpty()) return { success: false };
			dragIcons.set(normalizeForComparison(clip), image.resize({ width: 160 }));
			return { success: true, dataUrl: image.toDataURL() };
		} catch {
			// The shell has no thumbnail provider for this file; the card falls back to an icon.
			return { success: false };
		}
	});

	ipcMain.on("quick-clip-start-drag", (event, filePath: string) => {
		const clip = resolveKnownClip(filePath);
		if (!clip) return;
		event.sender.startDrag({
			file: clip,
			icon: dragIcons.get(normalizeForComparison(clip)) ?? fallbackDragIcon,
		});
	});

	ipcMain.handle("quick-clip-trash", async (_, filePath: string) => {
		const clip = resolveKnownClip(filePath);
		if (!clip) return { success: false, error: "This clip is no longer available." };
		try {
			await shell.trashItem(clip);
			forgetClip(clip);
			return { success: true };
		} catch (error) {
			return { success: false, error: error instanceof Error ? error.message : String(error) };
		}
	});

	// Removes the raw capture behind a finished clip so recordings don't pile up.
	ipcMain.handle("quick-clip-discard-source", async (_, screenVideoPath: string) => {
		if (typeof screenVideoPath !== "string" || !isPathWithin(screenVideoPath, deps.recordingsDir)) {
			return { success: false, error: "Not an OpenScreen recording." };
		}
		const parsed = path.parse(screenVideoPath);
		await Promise.all(
			[
				screenVideoPath,
				`${screenVideoPath}.cursor.json`,
				path.join(parsed.dir, `${parsed.name}.session.json`),
			].map((target) => fs.rm(target, { force: true }).catch(() => undefined)),
		);
		return { success: true };
	});

	// --- Area selection -------------------------------------------------------------

	function finishRegionSelection(result: RegionSelectionResult) {
		const resolve = resolveRegionSelection;
		resolveRegionSelection = null;
		regionSelectorContext = null;
		const win = regionSelectorWindow;
		regionSelectorWindow = null;
		if (win && !win.isDestroyed()) win.destroy();
		// A confirmed area needs the recording controls. A cancelled one puts the HUD
		// back the way it was, so an accidental hotkey press leaves nothing on screen.
		if (!result.canceled || hudVisibleBeforeRegionSelection) deps.showHud();
		resolve?.(result);
	}

	ipcMain.handle(
		"region-selector-open",
		async (_, initialRegion?: unknown): Promise<RegionSelectionResult> => {
			if (regionSelectorWindow && !regionSelectorWindow.isDestroyed()) {
				regionSelectorWindow.focus();
				return { canceled: true };
			}

			const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
			const initial = normalizeCaptureRegion(initialRegion);
			regionSelectorContext = {
				display: {
					id: display.id,
					width: display.bounds.width,
					height: display.bounds.height,
					scaleFactor: display.scaleFactor,
				},
				// A remembered region is only meaningful on the display it was drawn on.
				initialRegion:
					initial &&
					initial.displayId === display.id &&
					initial.displayWidth === display.bounds.width &&
					initial.displayHeight === display.bounds.height
						? initial
						: null,
			};

			hudVisibleBeforeRegionSelection = deps.getHudWindow()?.isVisible() === true;
			deps.hideHud();
			const win = createRegionSelectorWindow(display);
			regionSelectorWindow = win;
			win.on("closed", () => {
				if (regionSelectorWindow === win) {
					regionSelectorWindow = null;
					if (resolveRegionSelection) finishRegionSelection({ canceled: true });
				}
			});
			// A picker that fails to load, or whose renderer dies, would otherwise leave
			// the HUD hidden and waiting forever.
			const abandon = () => {
				if (regionSelectorWindow === win && resolveRegionSelection) {
					finishRegionSelection({ canceled: true });
				}
			};
			win.webContents.on("did-fail-load", abandon);
			win.webContents.on("render-process-gone", abandon);

			return new Promise<RegionSelectionResult>((resolve) => {
				resolveRegionSelection = resolve;
			});
		},
	);

	ipcMain.handle("region-selector-get-context", () => regionSelectorContext);

	ipcMain.handle("region-selector-confirm", async (_, rect: unknown, startRecording?: boolean) => {
		const context = regionSelectorContext;
		if (!context || !rect || typeof rect !== "object") {
			finishRegionSelection({ canceled: true });
			return { success: false };
		}

		const raw = rect as Record<string, unknown>;
		const clamped = clampRegionRect(
			{
				x: Number(raw.x),
				y: Number(raw.y),
				width: Number(raw.width),
				height: Number(raw.height),
			},
			context.display,
		);
		if (
			!Number.isFinite(clamped.width) ||
			!Number.isFinite(clamped.height) ||
			clamped.width < MIN_REGION_SIZE ||
			clamped.height < MIN_REGION_SIZE
		) {
			finishRegionSelection({ canceled: true });
			return { success: false };
		}

		const region: CaptureRegion = {
			displayId: context.display.id,
			...clamped,
			displayWidth: context.display.width,
			displayHeight: context.display.height,
			scaleFactor: context.display.scaleFactor,
		};

		// Area capture records the whole display and crops afterwards.
		const source = await deps.selectScreenSourceForDisplay(region.displayId).catch(() => null);
		if (source) {
			const hud = deps.getHudWindow();
			if (hud) hud.webContents.send("selected-source-changed", source);
		}

		finishRegionSelection({ canceled: false, region, startRecording: startRecording === true });
		return { success: Boolean(source) };
	});

	ipcMain.handle("region-selector-cancel", () => {
		finishRegionSelection({ canceled: true });
		return { success: true };
	});

	function hideRegionFrame() {
		const win = regionFrameWindow;
		regionFrameWindow = null;
		if (win && !win.isDestroyed()) win.destroy();
	}

	ipcMain.handle("region-frame-show", (_, value: unknown) => {
		hideRegionFrame();
		const region = normalizeCaptureRegion(value);
		const display = region
			? screen.getAllDisplays().find((candidate) => candidate.id === region.displayId)
			: null;
		if (!region || !display) return { success: false };

		regionFrameWindow = createRegionFrameWindow({
			x: display.bounds.x + region.x,
			y: display.bounds.y + region.y,
			width: region.width,
			height: region.height,
		});
		return { success: true };
	});

	ipcMain.handle("region-frame-hide", () => {
		hideRegionFrame();
		return { success: true };
	});

	// Selects a whole display without the picker: the given one (area capture), or the
	// only one when there is nothing to choose between.
	ipcMain.handle("select-screen-source", async (_, displayId?: number) => {
		const displays = screen.getAllDisplays();
		const target =
			typeof displayId === "number"
				? displays.find((display) => display.id === displayId)
				: displays.length === 1
					? displays[0]
					: undefined;
		if (!target) return { selected: false, displayCount: displays.length };

		const source = await deps.selectScreenSourceForDisplay(target.id).catch(() => null);
		if (source) {
			const hud = deps.getHudWindow();
			if (hud) hud.webContents.send("selected-source-changed", source);
		}
		return { selected: Boolean(source), displayCount: displays.length };
	});

	// --- HUD commands ---------------------------------------------------------------

	// The HUD calls this once it has subscribed to commands; anything triggered while
	// the window was still loading (e.g. the hotkey that created it) is handed over here.
	ipcMain.handle("hud-consume-pending-command", (event) => {
		readyHudWebContentsId = event.sender.id;
		const pending = pendingHudCommand;
		pendingHudCommand = null;
		return pending && Date.now() - pending.at < HUD_COMMAND_TTL_MS ? pending.command : null;
	});

	function sendHudCommand(command: HudCommand) {
		const hud = deps.getHudWindow();
		if (hud && hud.webContents.id === readyHudWebContentsId && !hud.webContents.isLoading()) {
			hud.webContents.send("hud-command", command);
			return;
		}
		pendingHudCommand = { command, at: Date.now() };
	}

	// A clip still being written when its HUD disappears can never be finished: close
	// the handle and remove the partial file so nothing half-written stays in the
	// user's folder. The raw recording is untouched and still opens in Studio.
	function abortOpenOutputs() {
		for (const [id, output] of outputs) {
			outputs.delete(id);
			void output.handle
				.close()
				.catch(() => undefined)
				.then(() => fs.rm(output.tempPath, { force: true }))
				.catch(() => undefined);
		}
	}

	return {
		sendHudCommand,
		hideRegionFrame,
		closeRegionSelector: () => {
			if (resolveRegionSelection) finishRegionSelection({ canceled: true });
		},
		isRegionSelectorOpen: () =>
			Boolean(regionSelectorWindow && !regionSelectorWindow.isDestroyed()),
		handleHudClosed: () => {
			readyHudWebContentsId = null;
			pendingHudCommand = null;
			abortOpenOutputs();
			hideRegionFrame();
			if (resolveRegionSelection) finishRegionSelection({ canceled: true });
		},
		abortOpenOutputs,
	};
}
