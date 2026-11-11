import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

const APP_NAME = "Marquee";
// OpenScreen's data folder, named after package.json "name".
const LEGACY_USER_DATA_NAME = "openscreen";

// Imported first by main.ts: Electron settles the userData folder, and creates it, on the
// first app.getPath("userData") call, so the name and the folder are set before anything asks.
app.setName(APP_NAME);

// An install upgraded from OpenScreen keeps working in its old data folder: settings, presets,
// the Yandex Disk token, recordings and speech models all live there (decision D-029). A run
// with --user-data-dir (tests, headless checks) brings its own profile.
if (!app.commandLine.hasSwitch("user-data-dir")) {
	const appData = app.getPath("appData");
	const legacyDir = path.join(appData, LEGACY_USER_DATA_NAME);
	if (!fs.existsSync(path.join(appData, APP_NAME)) && fs.existsSync(legacyDir)) {
		app.setPath("userData", legacyDir);
	}
}
