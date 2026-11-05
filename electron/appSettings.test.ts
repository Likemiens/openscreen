import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const videos = vi.hoisted(() => ({ dir: "" }));

vi.mock("electron", () => ({ app: { getPath: () => videos.dir } }));

import { AppSettingsStore } from "./appSettings";

describe("default clips folder", () => {
	beforeEach(() => {
		videos.dir = fs.mkdtempSync(path.join(os.tmpdir(), "marquee-videos-"));
	});

	afterEach(() => {
		fs.rmSync(videos.dir, { recursive: true, force: true });
	});

	it("is Videos\\Marquee for a new install", async () => {
		const folder = await new AppSettingsStore(videos.dir).resolveSaveFolder();
		expect(folder).toBe(path.join(videos.dir, "Marquee"));
		expect(fs.existsSync(folder)).toBe(true);
	});

	it("stays Videos\\OpenScreen when clips were saved there before the rename", async () => {
		fs.mkdirSync(path.join(videos.dir, "OpenScreen"));
		const folder = await new AppSettingsStore(videos.dir).resolveSaveFolder();
		expect(folder).toBe(path.join(videos.dir, "OpenScreen"));
		expect(fs.existsSync(path.join(videos.dir, "Marquee"))).toBe(false);
	});
});
