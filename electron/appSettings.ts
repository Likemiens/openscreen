import fs from "node:fs/promises";
import path from "node:path";
import { app } from "electron";
import {
	type AppSettings,
	DEFAULT_APP_SETTINGS,
	normalizeAppSettings,
} from "../src/lib/appSettings";

const SETTINGS_FILE_NAME = "app-settings.json";
const DEFAULT_SAVE_FOLDER_NAME = "OpenScreen";

/** Main-process settings persisted next to the other user data files. */
export class AppSettingsStore {
	private settings: AppSettings = { ...DEFAULT_APP_SETTINGS };
	private readonly filePath: string;

	constructor(userDataDirectory: string) {
		this.filePath = path.join(userDataDirectory, SETTINGS_FILE_NAME);
	}

	async load(): Promise<AppSettings> {
		try {
			this.settings = normalizeAppSettings(JSON.parse(await fs.readFile(this.filePath, "utf8")));
		} catch (error) {
			const nodeError = error as NodeJS.ErrnoException;
			if (nodeError.code !== "ENOENT") {
				console.warn("Failed to read app settings:", nodeError.message);
			}
			this.settings = { ...DEFAULT_APP_SETTINGS };
		}
		return this.get();
	}

	get(): AppSettings {
		return { ...this.settings };
	}

	async update(patch: Partial<AppSettings>): Promise<AppSettings> {
		this.settings = normalizeAppSettings({ ...this.settings, ...patch });
		await fs.mkdir(path.dirname(this.filePath), { recursive: true });
		await fs.writeFile(this.filePath, JSON.stringify(this.settings, null, 2), "utf8");
		return this.get();
	}

	getDefaultSaveFolder(): string {
		return path.join(app.getPath("videos"), DEFAULT_SAVE_FOLDER_NAME);
	}

	/** The folder clips are written to, created on demand. */
	async resolveSaveFolder(): Promise<string> {
		const preferred = this.settings.saveFolder;
		if (preferred) {
			try {
				await fs.mkdir(preferred, { recursive: true });
				return preferred;
			} catch (error) {
				console.warn("Save folder is unavailable, using the default:", error);
			}
		}

		const fallback = this.getDefaultSaveFolder();
		await fs.mkdir(fallback, { recursive: true });
		return fallback;
	}
}
