// Copies the ONNX Runtime web build that transcription runs on into `speech-runtime/`,
// which electron-builder ships as extraResources. The packaged app serves it over the
// openscreen-asr:// scheme (see electron/ipc/speechModels.ts); the renderer bundle uses
// ONNX Runtime's "extern wasm" build, so Vite does not copy these files a second time.
//
// No speech model is bundled: the app downloads the one it needs on first use, so the
// installer only carries this runtime. Idempotent.

import { copyFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "speech-runtime");
const FILES = ["ort-wasm-simd-threaded.asyncify.mjs", "ort-wasm-simd-threaded.asyncify.wasm"];

/** Where npm put onnxruntime-web's build: under transformers.js, or hoisted. */
export const ORT_DIST_CANDIDATES = [
	path.join(ROOT, "node_modules/@huggingface/transformers/node_modules/onnxruntime-web/dist"),
	path.join(ROOT, "node_modules/onnxruntime-web/dist"),
];

async function size(filePath) {
	try {
		const s = await stat(filePath);
		return s.isFile() ? s.size : -1;
	} catch {
		return -1;
	}
}

async function main() {
	let source = null;
	for (const dir of ORT_DIST_CANDIDATES) {
		if ((await size(path.join(dir, FILES[1]))) > 0) {
			source = dir;
			break;
		}
	}
	if (!source) {
		throw new Error(
			"onnxruntime-web is missing — is @huggingface/transformers installed? Run npm ci first.",
		);
	}
	await mkdir(OUT, { recursive: true });
	for (const name of FILES) {
		const from = path.join(source, name);
		const to = path.join(OUT, name);
		if ((await size(to)) === (await size(from))) {
			console.log(`  ✓ ${name}`);
			continue;
		}
		await copyFile(from, to);
		console.log(`  + ${name} (${((await size(to)) / 1_000_000).toFixed(1)} MB)`);
	}
	console.log("Speech runtime ready.");
}

main().catch((error) => {
	console.error(`\ncopy-speech-runtime failed: ${error.message}`);
	process.exit(1);
});
