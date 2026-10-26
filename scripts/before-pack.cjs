// electron-builder beforePack hook: copy the ONNX Runtime build that transcription runs on into
// speech-runtime/, so the `speech-runtime` extraResources entry has something to ship. Runs on
// every package invocation (local `npm run build:*` and CI's bare `electron-builder`). The copy
// is idempotent. Speech models are not bundled; the app downloads one on first use.

const { execFileSync } = require("node:child_process");
const path = require("node:path");

exports.default = async function beforePack() {
	execFileSync("node", [path.join(__dirname, "copy-speech-runtime.mjs")], {
		stdio: "inherit",
		cwd: path.join(__dirname, ".."),
	});
};
