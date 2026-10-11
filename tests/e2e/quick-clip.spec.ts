import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { _electron as electron, expect, test } from "@playwright/test";
import { ALL_FORMATS, FilePathSource, Input } from "mediabunny";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "../..");
// Set to a folder to keep screenshots of the recorder's own windows for design review.
const SCREENSHOT_DIR = process.env["OPENSCREEN_E2E_SCREENSHOTS"];

type ElectronApplication = Awaited<ReturnType<typeof electron.launch>>;

interface LaunchedApp {
	app: ElectronApplication;
	userDataDir: string;
	saveDir: string;
}

async function launchApp(extraEnv: Record<string, string> = {}): Promise<LaunchedApp> {
	const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "openscreen-e2e-"));
	const saveDir = fs.mkdtempSync(path.join(os.tmpdir(), "openscreen-e2e-clips-"));
	const app = await electron.launch({
		// Launch the project folder (not main.js directly) so the app path is the repo
		// root and the native capture helpers under electron/native/bin are found.
		args: [ROOT, "--lang=en-US", `--user-data-dir=${userDataDir}`],
		cwd: ROOT,
		env: {
			...process.env,
			ELECTRON_USER_DATA_DIR: userDataDir,
			// The capture overlays must really be on screen for the recorder to film them.
			HEADLESS: "false",
			LANG: "en_US.UTF-8",
			...extraEnv,
		},
	});
	const child = app.process();
	child.stderr?.on("data", (data) => process.stderr.write(`[electron] ${data}`));
	return { app, userDataDir, saveDir };
}

async function closeApp({ app, userDataDir, saveDir }: LaunchedApp) {
	const child = app.process();
	// The app stays in the tray when its windows close, so quit it explicitly.
	await Promise.race([
		app.evaluate(({ app: electronApp }) => electronApp.quit()).catch(() => undefined),
		new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
	]);
	if (child.exitCode === null && child.signalCode === null) {
		await Promise.race([
			once(child, "close"),
			new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
		]);
	}
	if (child.exitCode === null && child.signalCode === null) child.kill();
	for (const directory of [userDataDir, saveDir]) {
		fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
	}
}

async function openHud({ app, saveDir }: LaunchedApp): Promise<Page> {
	const hud = await app.firstWindow({ timeout: 60_000 });
	await hud.getByTestId("launch-record-button").waitFor({ timeout: 60_000 });
	// Keep test clips out of the real Videos folder.
	const result = await hud.evaluate(
		(folder) => window.electronAPI.updateAppSettings({ saveFolder: folder }),
		saveDir,
	);
	expect(result.success).toBe(true);
	return hud;
}

async function screenshot(page: Page, name: string, mask: ReturnType<Page["locator"]>[] = []) {
	if (!SCREENSHOT_DIR) return;
	fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
	// Let enter animations settle so surfaces are captured fully opaque.
	await page.waitForTimeout(400);
	await page.screenshot({
		path: path.join(SCREENSHOT_DIR, `${name}.png`),
		omitBackground: true,
		mask,
		maskColor: "#2a2a2d",
	});
}

async function readVideo(filePath: string) {
	const input = new Input({ source: new FilePathSource(filePath), formats: ALL_FORMATS });
	try {
		const track = await input.getPrimaryVideoTrack();
		if (!track) throw new Error("The clip has no video track.");
		return {
			width: track.displayWidth,
			height: track.displayHeight,
			codec: track.codec,
			duration: await input.computeDuration(),
		};
	} finally {
		input.dispose();
	}
}

function even(value: number) {
	return Math.max(2, Math.floor(value / 2) * 2);
}

function listClips(directory: string) {
	return fs.readdirSync(directory).filter((name) => name.endsWith(".mp4"));
}

async function recordFor(hud: Page, milliseconds: number) {
	await expect(hud.getByTestId("hud-toolbar")).toHaveAttribute("data-hud-state", "recording", {
		timeout: 30_000,
	});
	await hud.waitForTimeout(milliseconds);
	await hud.getByTestId("launch-record-button").click();
	const card = hud.getByTestId("hud-clip-card");
	await card.waitFor({ timeout: 90_000 });
	return card;
}

/** Drags out a 640 x 360 area in the area picker. */
async function dragArea(selector: Page) {
	await selector.getByTestId("region-selector").waitFor({ timeout: 30_000 });
	await selector.mouse.move(160, 140);
	await selector.mouse.down();
	await selector.mouse.move(480, 320, { steps: 6 });
	await selector.mouse.move(800, 500, { steps: 6 });
	await selector.mouse.up();
	await expect(selector.getByTestId("region-selection")).toBeVisible();
}

/** Sends something to the HUD the way the tray and the global hotkey do. */
async function sendToHud(app: ElectronApplication, channel: string, payload?: string) {
	await app.evaluate(
		({ BrowserWindow }, message) => {
			const hud = BrowserWindow.getAllWindows().find((window) =>
				window.webContents.getURL().includes("windowType=hud-overlay"),
			);
			hud?.webContents.send(message.channel, message.payload);
		},
		{ channel, payload },
	);
}

/** Switches the HUD to whole-screen capture, going through the picker if it opens. */
async function chooseScreen(app: ElectronApplication, hud: Page) {
	// With a single display the screen is selected directly and no picker appears.
	const picker = app.waitForEvent("window", { timeout: 4_000 }).catch(() => null);
	await hud.getByTestId("launch-capture-mode-screen").click();
	const pickerWindow = await picker;
	if (pickerWindow) {
		await pickerWindow
			.locator('[data-testid="source-selector-card"][data-source-kind="screen"]')
			.first()
			.click();
		await pickerWindow.getByTestId("source-selector-share-button").click();
	}
	await expect(hud.getByTestId("launch-record-button")).not.toHaveAttribute(
		"aria-label",
		"Please select a source to record",
	);
}

test.describe("Quick clips", () => {
	test.skip(process.platform !== "win32", "Uses the Windows native recorder.");

	test("registers a record hotkey and keeps running in the tray", async () => {
		const launched = await launchApp();
		try {
			const hud = await openHud(launched);
			const settings = await hud.evaluate(() => window.electronAPI.getAppSettings());
			expect(settings.activeQuickRecordShortcut).toBeTruthy();
			expect(settings.resolvedSaveFolder).toBe(launched.saveDir);
			await screenshot(hud, "hud-idle");

			await hud.getByTestId("launch-format-button").click();
			await hud.getByTestId("hud-format-panel").waitFor();
			await screenshot(hud, "hud-format");
			await hud.keyboard.press("Escape");

			await hud.getByTestId("launch-settings-button").click();
			await hud.getByTestId("hud-settings-panel").waitFor();
			await screenshot(hud, "hud-settings");
			await hud.keyboard.press("Escape");

			// Closing the HUD hides it; the process, tray and hotkey stay alive.
			await hud.getByRole("button", { name: "Hide to tray" }).click();
			await expect
				.poll(() =>
					launched.app.evaluate(({ BrowserWindow }) =>
						BrowserWindow.getAllWindows().some((window) => window.isVisible()),
					),
				)
				.toBe(false);
			expect(launched.app.process().exitCode).toBeNull();
		} finally {
			await closeApp(launched);
		}
	});

	test("records a selected area and saves the cropped clip", async () => {
		const launched = await launchApp();
		try {
			const hud = await openHud(launched);

			const selectorOpened = launched.app.waitForEvent("window");
			await hud.getByTestId("launch-capture-mode-area").click();
			const selector = await selectorOpened;
			await selector.getByTestId("region-selector").waitFor({ timeout: 30_000 });
			const context = await selector.evaluate(() => window.electronAPI.getRegionSelectorContext());
			if (!context) throw new Error("The area picker has no display context.");
			await screenshot(selector, "region-empty");

			await dragArea(selector);
			await screenshot(selector, "region-selected");
			await selector.getByTestId("region-record-button").click();

			const card = await recordFor(hud, 3_000);
			await screenshot(hud, "hud-clip-card", [card.locator("img")]);

			const clips = listClips(launched.saveDir);
			expect(clips).toHaveLength(1);
			const video = await readVideo(path.join(launched.saveDir, clips[0]));
			expect(video.codec).toBe("avc");
			expect(video.width).toBe(even(Math.round(640 * context.display.scaleFactor)));
			expect(video.height).toBe(even(Math.round(360 * context.display.scaleFactor)));
			expect(video.duration).toBeGreaterThan(1.5);

			// The raw full-display capture is gone once the clip exists.
			const recordings = path.join(launched.userDataDir, "recordings");
			expect(fs.readdirSync(recordings).filter((name) => name.endsWith(".mp4"))).toHaveLength(0);

			// Renaming the card renames the file.
			const title = card.getByLabel("Clip name");
			await title.fill("Area smoke test");
			await title.press("Enter");
			await expect.poll(() => listClips(launched.saveDir)).toEqual(["Area smoke test.mp4"]);

			const copied = await hud.evaluate(
				(filePath) => window.electronAPI.copyClipFile(filePath),
				path.join(launched.saveDir, "Area smoke test.mp4"),
			);
			expect(copied.success).toBe(true);
		} finally {
			await closeApp(launched);
		}
	});

	test("saves an original-quality recording without re-encoding", async () => {
		const launched = await launchApp();
		try {
			const hud = await openHud(launched);

			await hud.getByTestId("launch-format-button").click();
			await hud.getByRole("radio", { name: "Original" }).click();
			await hud.keyboard.press("Escape");

			// An area covering the whole display needs no crop, so this is the copy path.
			const selectorOpened = launched.app.waitForEvent("window");
			await hud.getByTestId("launch-capture-mode-area").click();
			const selector = await selectorOpened;
			await selector.getByTestId("region-selector").waitFor({ timeout: 30_000 });
			const context = await selector.evaluate(() => window.electronAPI.getRegionSelectorContext());
			if (!context) throw new Error("The area picker has no display context.");
			// Confirming closes the picker window, which rejects the pending evaluate.
			await selector
				.evaluate(
					({ width, height }) =>
						window.electronAPI.confirmRegionSelection({ x: 0, y: 0, width, height }, true),
					context.display,
				)
				.catch(() => undefined);

			await recordFor(hud, 2_500);

			const clips = listClips(launched.saveDir);
			expect(clips).toHaveLength(1);
			const video = await readVideo(path.join(launched.saveDir, clips[0]));
			expect(video.width).toBe(
				even(Math.round(context.display.width * context.display.scaleFactor)),
			);
			expect(video.height).toBe(
				even(Math.round(context.display.height * context.display.scaleFactor)),
			);
		} finally {
			await closeApp(launched);
		}
	});

	test("the record hotkey reuses the last area and stops the recording", async () => {
		const launched = await launchApp();
		try {
			const hud = await openHud(launched);

			// Choose an area once, without recording.
			const firstPicker = launched.app.waitForEvent("window");
			await hud.getByTestId("launch-capture-mode-area").click();
			const picker = await firstPicker;
			await dragArea(picker);
			await picker.getByRole("button", { name: "Done" }).click();
			await expect(hud.getByTestId("launch-capture-mode-area")).toContainText("×");

			// Hotkey: the picker comes back with that area already drawn; Enter records.
			const secondPicker = launched.app.waitForEvent("window");
			await sendToHud(launched.app, "hud-command", "quick-record");
			const remembered = await secondPicker;
			await expect(remembered.getByTestId("region-selection")).toBeVisible({ timeout: 30_000 });
			await remembered.keyboard.press("Enter");

			await expect(hud.getByTestId("hud-toolbar")).toHaveAttribute("data-hud-state", "recording", {
				timeout: 30_000,
			});
			await screenshot(hud, "hud-recording");
			await hud.waitForTimeout(2_500);

			// Pressing the hotkey again while recording stops it (same channel as the tray).
			await sendToHud(launched.app, "stop-recording-from-tray");
			await hud.getByTestId("hud-clip-card").waitFor({ timeout: 90_000 });
			expect(listClips(launched.saveDir)).toHaveLength(1);

			// The clip opens in Studio straight from the card.
			const editorOpened = launched.app.waitForEvent("window");
			await hud.getByRole("button", { name: "Edit in Studio" }).click();
			const editor = await editorOpened;
			await expect(editor.getByTestId("testId-export-panel-button")).toBeVisible({
				timeout: 90_000,
			});
		} finally {
			await closeApp(launched);
		}
	});

	test("releases the hidden HUD and restores the setup when it returns", async () => {
		const launched = await launchApp({ OPENSCREEN_HUD_IDLE_RELEASE_MS: "1500" });
		try {
			const hud = await openHud(launched);
			await hud.getByTestId("launch-format-button").click();
			await hud.getByRole("radio", { name: "720p" }).click();
			await hud.getByRole("radio", { name: "30 fps" }).click();
			await hud.keyboard.press("Escape");

			await hud.getByRole("button", { name: "Hide to tray" }).click();
			await expect
				.poll(
					() => launched.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
					{ timeout: 15_000 },
				)
				.toBe(0);
			// No window is left, yet the app is still running in the tray.
			expect(launched.app.process().exitCode).toBeNull();

			// Starting the app again (or the tray, or the hotkey) brings a fresh HUD back.
			const reopened = launched.app.waitForEvent("window");
			await launched.app.evaluate(({ app }) => {
				app.emit("second-instance");
			});
			const freshHud = await reopened;
			await expect(freshHud.getByTestId("launch-format-button")).toHaveText(/720p · 30/, {
				timeout: 30_000,
			});
		} finally {
			await closeApp(launched);
		}
	});

	test("recordings with an editable cursor still go through the Studio export step", async () => {
		const launched = await launchApp();
		try {
			const hud = await openHud(launched);
			await chooseScreen(launched.app, hud);

			await hud.getByTestId("launch-format-button").click();
			await hud.getByRole("radio", { name: "Editable" }).click();
			await hud.keyboard.press("Escape");

			await hud.getByTestId("launch-record-button").click();
			await expect(hud.getByTestId("hud-toolbar")).toHaveAttribute("data-hud-state", "recording", {
				timeout: 30_000,
			});
			await hud.waitForTimeout(2_500);
			await hud.getByTestId("launch-record-button").click();

			await expect(hud.getByText("Recording ready")).toBeVisible({ timeout: 60_000 });
			await screenshot(hud, "hud-draft");
			// Nothing was exported on its own, and the raw recording is kept for Studio.
			expect(listClips(launched.saveDir)).toHaveLength(0);
			const recordings = path.join(launched.userDataDir, "recordings");
			expect(fs.readdirSync(recordings).some((name) => name.endsWith(".mp4"))).toBe(true);

			const editorOpened = launched.app.waitForEvent("window");
			await hud.getByRole("button", { name: "Edit in Studio" }).click();
			const editor = await editorOpened;
			await expect(editor.getByTestId("testId-export-panel-button")).toBeVisible({
				timeout: 90_000,
			});
		} finally {
			await closeApp(launched);
		}
	});
});
