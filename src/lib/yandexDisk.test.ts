import { describe, expect, it } from "vitest";
import {
	buildYandexDiskRemotePath,
	DEFAULT_YANDEX_DISK_FOLDER,
	isVerifiedYandexDiskUpload,
	matchesYandexDiskPublicFolder,
	normalizeYandexDiskFolder,
	YANDEX_DISK_PUBLIC_FOLDER_URL,
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

	it("builds a path inside the configured Disk folder", () => {
		expect(buildYandexDiskRemotePath("OpenScreen Exports", "C:\\tmp\\recording-42.webm")).toBe(
			"disk:/OpenScreen Exports/recording-42.webm",
		);
	});

	it("matches only the configured public folder", () => {
		expect(
			matchesYandexDiskPublicFolder(
				{ type: "dir", public_url: "https://yadi.sk/d/GKhvA2QkXOBe2g" },
				YANDEX_DISK_PUBLIC_FOLDER_URL,
			),
		).toBe(true);
		expect(
			matchesYandexDiskPublicFolder(
				{ type: "dir", public_url: "https://yadi.sk/d/another-folder" },
				YANDEX_DISK_PUBLIC_FOLDER_URL,
			),
		).toBe(false);
	});

	it("requires the uploaded remote file to have the exact local size", () => {
		expect(isVerifiedYandexDiskUpload({ type: "file", size: 42 }, 42)).toBe(true);
		expect(isVerifiedYandexDiskUpload({ type: "file", size: 41 }, 42)).toBe(false);
		expect(isVerifiedYandexDiskUpload({ type: "dir", size: 42 }, 42)).toBe(false);
	});
});
