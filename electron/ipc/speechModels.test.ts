import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ net: {}, protocol: {} }));

import { hasSpeechRuntime, parseRange, resolveModelFile } from "./speechModels";

describe("hasSpeechRuntime", () => {
	it("finds the runtime in any of the folders, and reports it missing otherwise", () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "speech-runtime-"));
		try {
			const empty = path.join(root, "empty");
			const full = path.join(root, "full");
			fs.mkdirSync(empty);
			fs.mkdirSync(full);
			expect(hasSpeechRuntime([empty])).toBe(false);
			fs.writeFileSync(path.join(full, "ort-wasm-simd-threaded.asyncify.wasm"), "wasm");
			expect(hasSpeechRuntime([empty, full])).toBe(true);
			expect(hasSpeechRuntime([path.join(root, "missing")])).toBe(false);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("resolveModelFile", () => {
	const cache = path.join("C:", "data", "speech-models");

	it("maps an allowed model file into the cache", () => {
		expect(
			resolveModelFile(
				cache,
				"/onnx-community/whisper-large-v3-turbo/onnx/encoder_model_q4f16.onnx",
			),
		).toEqual({
			modelId: "onnx-community/whisper-large-v3-turbo",
			file: "onnx/encoder_model_q4f16.onnx",
			localPath: path.join(
				cache,
				"onnx-community",
				"whisper-large-v3-turbo",
				"onnx",
				"encoder_model_q4f16.onnx",
			),
		});
		expect(resolveModelFile(cache, "/onnx-community/whisper-small/tokenizer.json")?.file).toBe(
			"tokenizer.json",
		);
	});

	it("refuses other models, other kinds of files and paths out of the cache", () => {
		expect(resolveModelFile(cache, "/someone/else/config.json")).toBeNull();
		expect(resolveModelFile(cache, "/onnx-community/whisper-small/run.exe")).toBeNull();
		expect(resolveModelFile(cache, "/onnx-community/whisper-small/../../secrets.json")).toBeNull();
		expect(resolveModelFile(cache, "/onnx-community/whisper-small")).toBeNull();
	});
});

describe("parseRange", () => {
	it("reads the single-range forms players and libraries send", () => {
		expect(parseRange("bytes=0-0", 100)).toEqual({ start: 0, end: 0 });
		expect(parseRange("bytes=10-", 100)).toEqual({ start: 10, end: 99 });
		expect(parseRange("bytes=90-500", 100)).toEqual({ start: 90, end: 99 });
		expect(parseRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
	});

	it("rejects ranges outside the file or in other forms", () => {
		expect(parseRange("bytes=100-", 100)).toBeNull();
		expect(parseRange("bytes=5-2", 100)).toBeNull();
		expect(parseRange("bytes=0-1,5-6", 100)).toBeNull();
		expect(parseRange("items=0-1", 100)).toBeNull();
	});
});
