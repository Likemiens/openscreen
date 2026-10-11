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
const RECORDING = path.join(__dirname, "../fixtures/sample.webm"); // 640 × 480
const OWN_VIDEO = path.join(__dirname, "../fixtures/sample-dual-audio.mp4"); // 320 × 180

type ElectronApplication = Awaited<ReturnType<typeof electron.launch>>;

interface Studio {
	app: ElectronApplication;
	editor: Page;
	workDir: string;
	exportPath: string;
	pageErrors: string[];
}

async function readVideo(filePath: string) {
	const input = new Input({ source: new FilePathSource(filePath), formats: ALL_FORMATS });
	try {
		const track = await input.getPrimaryVideoTrack();
		if (!track) throw new Error("The export has no video track.");
		return {
			width: track.displayWidth,
			height: track.displayHeight,
			duration: await input.computeDuration(),
		};
	} finally {
		input.dispose();
	}
}

/**
 * Opens Studio on the sample recording. Every window stays hidden (HEADLESS), so the
 * spec can run while someone is using the machine.
 */
async function openStudio(options: { yandexConnected?: boolean } = {}): Promise<Studio> {
	const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "openscreen-studio-e2e-"));
	const userDataDir = path.join(workDir, "user-data");
	const exportPath = path.join(workDir, "export.mp4");
	const app = await electron.launch({
		args: [ROOT, "--lang=en-US", `--user-data-dir=${userDataDir}`],
		cwd: ROOT,
		env: { ...process.env, HEADLESS: "true", LANG: "en_US.UTF-8" },
	});

	const hud = await app.firstWindow({ timeout: 60_000 });
	await hud.waitForLoadState("domcontentloaded");

	// The two native dialogs would block a hidden window: answer them from here. The
	// handlers behind them (path approval, writing the file) stay the real ones.
	await app.evaluate(
		({ dialog, ipcMain }, { savePath, ownVideo }) => {
			ipcMain.removeHandler("pick-export-save-path");
			ipcMain.handle("pick-export-save-path", () => ({ success: true, path: savePath }));
			dialog.showOpenDialog = (async () => ({
				canceled: false,
				filePaths: [ownVideo],
			})) as typeof dialog.showOpenDialog;
		},
		{ savePath: exportPath, ownVideo: OWN_VIDEO },
	);

	if (options.yandexConnected) {
		// A connected Yandex Disk without an account: the upload is recorded, not sent.
		await app.evaluate(({ ipcMain }) => {
			ipcMain.removeHandler("get-yandex-disk-settings");
			ipcMain.handle("get-yandex-disk-settings", () => ({
				success: true,
				settings: {
					folder: "OpenScreen Exports",
					deleteLocalAfterUpload: false,
					connected: true,
					encryptionAvailable: true,
				},
			}));
			ipcMain.removeHandler("upload-recording-to-yandex-disk");
			ipcMain.handle("upload-recording-to-yandex-disk", (_event, request) => {
				(globalThis as Record<string, unknown>)["__testUploadRequest"] = request;
				return { success: true, queued: true };
			});
		});
	}

	const recordingsDir = path.join(
		await app.evaluate(({ app: electronApp }) => electronApp.getPath("userData")),
		"recordings",
	);
	fs.mkdirSync(recordingsDir, { recursive: true });
	const recording = path.join(recordingsDir, "recording.webm");
	fs.copyFileSync(RECORDING, recording);

	const editorPromise = app.waitForEvent("window", {
		predicate: (window) => window.url().includes("windowType=editor"),
		timeout: 30_000,
	});
	// Opening the editor closes the HUD, which rejects this evaluate; that is expected.
	await hud
		.evaluate(async (videoPath) => {
			await window.electronAPI.setCurrentVideoPath(videoPath);
			await window.electronAPI.switchToEditor();
		}, recording)
		.catch(() => undefined);
	const editor = await editorPromise;

	// Under Playwright the editor's first script context is the window's initial
	// about:blank (the debugger creates it, and webSecurity: false lets it be reused),
	// which was built without the secure-context WebCodecs classes. A reload makes a
	// proper one; outside tests the context is only ever created for the app page.
	await editor.waitForLoadState("domcontentloaded");
	await editor.reload();
	const pageErrors: string[] = [];
	editor.on("pageerror", (error) => pageErrors.push(error.message));
	await editor.getByTestId("studio-frame-panel").waitFor({ timeout: 60_000 });
	return { app, editor, workDir, exportPath, pageErrors };
}

async function closeStudio({ app, workDir }: Studio) {
	const child = app.process();
	await Promise.race([
		// exit, not quit: quit is vetoed by the unsaved-changes prompt.
		app.evaluate(({ app: electronApp }) => electronApp.exit(0)).catch(() => undefined),
		new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
	]);
	if (child.exitCode === null && child.signalCode === null) {
		await Promise.race([
			once(child, "close"),
			new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
		]);
	}
	if (child.exitCode === null && child.signalCode === null) child.kill();
	try {
		fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
	} catch {
		// Chromium can keep a cache file locked for a moment; a temp folder is harmless.
	}
}

async function setCrop(editor: Page, side: "Top" | "Bottom" | "Left" | "Right", pixels: number) {
	const field = editor.getByLabel(side, { exact: true });
	await field.fill(String(pixels));
	await field.press("Enter");
}

async function exportVideo({ editor, exportPath }: Studio) {
	await editor.getByTestId("testId-export-panel-button").click();
	await editor.getByTestId("testId-mp4-format-button").click();
	await editor.getByTestId("testId-export-button").click();
	await expect(editor.getByText("Video exported successfully")).toBeVisible({ timeout: 90_000 });
	expect(fs.statSync(exportPath).size).toBeGreaterThan(10_000);
	return readVideo(exportPath);
}

test.describe("Studio frame", () => {
	let studio: Studio;

	test.beforeEach(async () => {
		studio = await openStudio();
	});

	test.afterEach(async () => {
		await closeStudio(studio);
	});

	test("crops by pixels, wraps the video in a device and exports it", async () => {
		const { editor } = studio;
		const panel = editor.getByTestId("studio-frame-panel");
		await expect(panel.getByText("recording.webm")).toBeVisible();
		await expect(panel.getByText(/^640 × 480/)).toBeVisible();

		await setCrop(editor, "Top", 5);
		await expect(panel.getByText("Result 640 × 475")).toBeVisible();

		await editor.getByLabel("Device", { exact: true }).selectOption("phone");
		await expect(editor.getByRole("radiogroup", { name: "Camera cutout" })).toBeVisible();
		// A phone stands upright even though the sample is landscape: the device keeps its
		// own proportions, and turning it is a choice, not a consequence of the video.
		await expect(editor.getByRole("radio", { name: "Portrait", exact: true })).toHaveAttribute(
			"aria-checked",
			"true",
		);
		await expect(editor.getByRole("radiogroup", { name: "Camera side" })).toHaveCount(0);
		await editor.getByRole("radio", { name: "Landscape", exact: true }).click();
		await editor.getByRole("radio", { name: "Right", exact: true }).click();
		await editor.getByRole("radio", { name: "Fit", exact: true }).click();

		await editor.getByRole("radio", { name: "1:1", exact: true }).click();
		await expect(editor.getByRole("radio", { name: "1:1", exact: true })).toHaveAttribute(
			"aria-checked",
			"true",
		);

		const exported = await exportVideo(studio);
		expect(exported.width).toBe(exported.height);
		expect(exported.duration).toBeGreaterThan(1.5);

		// Tearing the export renderer down used to take the preview's renderer with it.
		expect(studio.pageErrors).toEqual([]);
		await expect(editor.locator("canvas").first()).toBeVisible();
	});

	test("opens your own video in place of the recording", async () => {
		const { editor } = studio;
		const panel = editor.getByTestId("studio-frame-panel");
		await expect(panel.getByText("recording.webm")).toBeVisible();

		await editor.getByTestId("studio-titlebar-open-video").click();
		// A fresh recording may count as unsaved work; opening another file discards it.
		const discard = editor.getByRole("button", { name: /discard/i });
		await Promise.race([
			panel.getByText("sample-dual-audio.mp4").waitFor({ timeout: 30_000 }),
			discard.waitFor({ timeout: 30_000 }).then(() => discard.click()),
		]);

		await expect(panel.getByText("sample-dual-audio.mp4")).toBeVisible({ timeout: 30_000 });
		await expect(panel.getByText(/^320 × 180/)).toBeVisible();
		// The export is named after the title, so a new video brings its own.
		await expect(editor.getByLabel("Video title")).toHaveValue("sample-dual-audio");

		await setCrop(editor, "Top", 5);
		await setCrop(editor, "Left", 20);
		await expect(panel.getByText("Result 300 × 175")).toBeVisible();

		await editor.getByLabel("Device", { exact: true }).selectOption("browser");

		// Those edits are unsaved work: opening yet another video has to ask first.
		await editor.getByTestId("studio-titlebar-open-video").click();
		await expect(editor.getByRole("button", { name: /discard/i })).toBeVisible();
		await editor.getByRole("button", { name: "Cancel", exact: true }).click();
		await expect(panel.getByText("Result 300 × 175")).toBeVisible();

		const exported = await exportVideo(studio);
		// Default 16:9 canvas: the mockup sits on the background, it does not reshape it.
		expect(exported.width / exported.height).toBeCloseTo(16 / 9, 2);
		expect(studio.pageErrors).toEqual([]);
	});

	test("splits the clip, removes the middle part and exports a shorter video", async () => {
		const { editor } = studio;
		const clipRow = editor.locator('[data-timeline-row="clip"]');
		await expect(editor.getByTestId("clip-track")).toBeVisible();
		await expect(editor.getByTestId("clip-piece")).toHaveCount(1);
		await expect(editor.getByTestId("clip-remove-button")).toBeDisabled();
		// The timeline is laid out against the video's length, which a WebM reports late.
		await expect(editor.getByText("0:02", { exact: true })).toBeVisible();
		await editor.waitForTimeout(500);

		const box = await clipRow.boundingBox();
		if (!box) throw new Error("The clip row is not on screen.");
		// A press on the clip moves the playhead there (and picks the piece under it).
		const pressAt = (fraction: number) =>
			editor.mouse.click(box.x + box.width * fraction, box.y + box.height / 2);

		await pressAt(0.3);
		await editor.getByTestId("clip-split-button").click();
		await pressAt(0.7);
		await editor.getByTestId("clip-split-button").click();
		await expect(editor.getByTestId("clip-piece")).toHaveCount(3);

		await pressAt(0.5);
		await expect(editor.locator('[data-testid="clip-piece"][data-selected="true"]')).toHaveCount(1);
		await editor.getByTestId("clip-remove-button").click();
		await expect(editor.getByTestId("clip-piece")).toHaveCount(2);
		await expect(editor.getByTestId("clip-kept-duration")).toHaveText("1.2s after cuts");

		// The removed part stays on the track, hatched, and can be put back.
		await pressAt(0.45);
		await expect(editor.getByTestId("clip-restore-button")).toBeVisible();

		const exported = await exportVideo(studio);
		// 2 s with the middle 40% cut out leaves about 1.2 s.
		expect(exported.duration).toBeGreaterThan(1.0);
		expect(exported.duration).toBeLessThan(1.45);
		expect(studio.pageErrors).toEqual([]);

		await editor.getByTestId("clip-restore-button").click();
		await expect(editor.getByTestId("clip-piece")).toHaveCount(3);
		await expect(editor.getByTestId("clip-kept-duration")).toHaveCount(0);
	});

	test("offers to connect Yandex Disk from the Export menu instead of failing", async () => {
		const { editor } = studio;
		await editor.getByTestId("testId-export-panel-button").click();
		await expect(editor.getByTestId("studio-export-publish")).toHaveCount(0);
		await editor.getByTestId("studio-export-connect-yandex").click();
		const dialog = editor.getByTestId("studio-yandex-dialog");
		await expect(dialog).toBeVisible();
		await expect(dialog.getByText("OAuth token", { exact: true })).toBeVisible();
		await dialog.getByRole("button", { name: "Close" }).click();
		await expect(dialog).toHaveCount(0);
	});

	test("links the star to this fork", async () => {
		const { app, editor } = studio;
		await app.evaluate(({ ipcMain }) => {
			ipcMain.removeHandler("open-external-url");
			ipcMain.handle("open-external-url", (_event, url: string) => {
				(globalThis as Record<string, unknown>)["__testOpenedUrl"] = url;
				return { success: true };
			});
		});
		await editor.getByTestId("studio-star-link").click();
		await expect
			.poll(() => app.evaluate(() => (globalThis as Record<string, unknown>)["__testOpenedUrl"]))
			.toBe("https://github.com/Likemiens/openscreen");
	});
});

test.describe("Studio publish", () => {
	let studio: Studio;

	test.beforeEach(async () => {
		studio = await openStudio({ yandexConnected: true });
	});

	test.afterEach(async () => {
		await closeStudio(studio);
	});

	test("renders an MP4 and hands it to the Yandex Disk upload", async () => {
		const { app, editor } = studio;
		await editor.getByTestId("testId-export-panel-button").click();
		await editor.getByTestId("studio-export-publish").click();
		await expect(editor.getByText("Video prepared")).toBeVisible({ timeout: 90_000 });

		const request = (await app.evaluate(
			() => (globalThis as Record<string, unknown>)["__testUploadRequest"],
		)) as { filePath: string; fileName: string };
		expect(request.fileName).toMatch(/\.mp4$/);
		expect(fs.statSync(request.filePath).size).toBeGreaterThan(10_000);
		expect(studio.pageErrors).toEqual([]);
	});
});
