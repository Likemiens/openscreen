import { describe, expect, it } from "vitest";
import {
	buildYandexDiskRemotePath,
	DEFAULT_YANDEX_DISK_FOLDER,
	normalizeYandexDiskFolder,
} from "./yandexDisk";

describe("Yandex Disk paths", () => {
	it("normalizes a user-entered folder below the app root", () => {
		expect(normalizeYandexDiskFolder(" /Videos\\Product demos/ ")).toBe("Videos/Product demos");
		expect(normalizeYandexDiskFolder("app:/Recordings")).toBe("Recordings");
	});

	it("drops traversal segments and falls back for an empty folder", () => {
		expect(normalizeYandexDiskFolder("../Videos/../../Private")).toBe("Videos/Private");
		expect(normalizeYandexDiskFolder(" / ")).toBe(DEFAULT_YANDEX_DISK_FOLDER);
	});

	it("builds a path inside the Yandex application folder", () => {
		expect(buildYandexDiskRemotePath("Recordings", "C:\\tmp\\recording-42.webm")).toBe(
			"app:/Recordings/recording-42.webm",
		);
	});
});
