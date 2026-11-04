import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => ({
	appData: "",
	customProfile: false,
	setName: vi.fn(),
	setPath: vi.fn(),
}));

vi.mock("electron", () => ({
	app: {
		setName: electron.setName,
		setPath: electron.setPath,
		getPath: () => electron.appData,
		commandLine: { hasSwitch: () => electron.customProfile },
	},
}));

describe("app identity", () => {
	let appData: string;

	beforeEach(() => {
		appData = fs.mkdtempSync(path.join(os.tmpdir(), "marquee-identity-"));
		electron.appData = appData;
		electron.customProfile = false;
		electron.setName.mockClear();
		electron.setPath.mockClear();
		vi.resetModules();
	});

	afterEach(() => {
		fs.rmSync(appData, { recursive: true, force: true });
	});

	it("keeps an install upgraded from OpenScreen in its old data folder", async () => {
		fs.mkdirSync(path.join(appData, "openscreen"));
		await import("./appIdentity");
		expect(electron.setName).toHaveBeenCalledWith("Marquee");
		expect(electron.setPath).toHaveBeenCalledWith("userData", path.join(appData, "openscreen"));
	});

	it("uses its own folder once it has one", async () => {
		fs.mkdirSync(path.join(appData, "openscreen"));
		fs.mkdirSync(path.join(appData, "Marquee"));
		await import("./appIdentity");
		expect(electron.setPath).not.toHaveBeenCalled();
	});

	it("starts a fresh install in its own folder", async () => {
		await import("./appIdentity");
		expect(electron.setName).toHaveBeenCalledWith("Marquee");
		expect(electron.setPath).not.toHaveBeenCalled();
	});

	it("leaves a profile passed with --user-data-dir alone", async () => {
		fs.mkdirSync(path.join(appData, "openscreen"));
		electron.customProfile = true;
		await import("./appIdentity");
		expect(electron.setPath).not.toHaveBeenCalled();
	});
});
