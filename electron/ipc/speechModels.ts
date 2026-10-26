import { createReadStream, createWriteStream, existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { net, protocol } from "electron";
import { SPEECH_MODEL_IDS, SPEECH_SCHEME } from "../../src/lib/captioning/speechModels";

/**
 * Speech-to-text assets for transcription, served to renderers and workers over a
 * private `openscreen-asr://` scheme:
 *
 *   openscreen-asr://models/<org>/<model>/<file>   a Whisper model file
 *   openscreen-asr://runtime/<file>                the ONNX Runtime wasm build
 *
 * Models are not shipped with the app. The first request for a file downloads it from
 * Hugging Face into the user's data folder while streaming it to the page (so the page
 * sees download progress), and every later request is served from disk. Pages run
 * from file://, where the browser's Cache API is unavailable, so this is what makes a
 * model a one-time download.
 *
 * Only the models below, and only their config/tokenizer/ONNX files, can be fetched.
 */
const ALLOWED_FILE = /^(?:[\w.-]+\.(?:json|txt)|onnx\/[\w.-]+\.onnx(?:_data)?)$/;
const RUNTIME_FILE = /^ort-wasm-simd-threaded\.asyncify\.(?:mjs|wasm)$/;
const REMOTE = "https://huggingface.co";
const PARTIAL_SUFFIX = ".partial";

const CONTENT_TYPES: Record<string, string> = {
	".json": "application/json",
	".txt": "text/plain",
	".mjs": "text/javascript",
	".wasm": "application/wasm",
};

/** Must run before the app is ready: lets pages and workers fetch() and import() from it. */
export function registerSpeechScheme() {
	protocol.registerSchemesAsPrivileged([
		{
			scheme: SPEECH_SCHEME,
			privileges: {
				standard: true,
				secure: true,
				supportFetchAPI: true,
				corsEnabled: true,
				stream: true,
			},
		},
	]);
}

function headersFor(filePath: string, size?: number | string | null): Headers {
	const headers = new Headers({
		"Content-Type": CONTENT_TYPES[path.extname(filePath)] ?? "application/octet-stream",
		"Access-Control-Allow-Origin": "*",
		"Cross-Origin-Resource-Policy": "cross-origin",
	});
	if (size != null && size !== "") headers.set("Content-Length", String(size));
	return headers;
}

/**
 * A single `bytes=a-b` range (inclusive) within a file of `size` bytes, or null when the
 * header asks for something else or nothing that exists.
 */
export function parseRange(header: string, size: number): { start: number; end: number } | null {
	const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
	if (!match || (match[1] === "" && match[2] === "")) return null;
	let start: number;
	let end: number;
	if (match[1] === "") {
		// "bytes=-n": the last n bytes.
		start = Math.max(0, size - Number(match[2]));
		end = size - 1;
	} else {
		start = Number(match[1]);
		end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
	}
	return start <= end && start < size ? { start, end } : null;
}

// transformers.js asks for the first byte of a file to learn whether it exists and how
// big it is, so ranges must work from disk as they do on Hugging Face.
async function serveFile(filePath: string, rangeHeader: string | null): Promise<Response> {
	const { size } = await fs.stat(filePath);
	const range = rangeHeader ? parseRange(rangeHeader, size) : null;
	if (rangeHeader && !range) {
		const headers = headersFor(filePath);
		headers.set("Content-Range", `bytes */${size}`);
		return new Response(null, { status: 416, headers });
	}
	const start = range?.start ?? 0;
	const end = range?.end ?? size - 1;
	const headers = headersFor(filePath, Math.max(0, end - start + 1));
	headers.set("Accept-Ranges", "bytes");
	if (range) headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
	if (size === 0) return new Response(null, { status: 200, headers });
	const body = Readable.toWeb(
		createReadStream(filePath, { start, end, highWaterMark: 1024 * 1024 }),
	) as ReadableStream<Uint8Array>;
	return new Response(body, { status: range ? 206 : 200, headers });
}

/**
 * Resolves `models/<org>/<model>/<file>` to its place in the cache, or null for anything
 * that is not an allowed model file (including attempts to climb out of the cache).
 */
export function resolveModelFile(
	cacheDir: string,
	urlPath: string,
): { modelId: string; file: string; localPath: string } | null {
	const parts = urlPath.split("/").filter(Boolean);
	if (parts.length < 3) return null;
	const modelId = `${parts[0]}/${parts[1]}`;
	const file = parts.slice(2).join("/");
	if (!SPEECH_MODEL_IDS.has(modelId) || !ALLOWED_FILE.test(file) || file.includes(".."))
		return null;
	return {
		modelId,
		file,
		localPath: path.join(cacheDir, ...modelId.split("/"), ...file.split("/")),
	};
}

/** Whether the ONNX Runtime build is in one of `runtimeDirs`; the Windows installer can leave it out. */
export function hasSpeechRuntime(runtimeDirs: string[]): boolean {
	return runtimeDirs.some((dir) =>
		existsSync(path.join(dir, "ort-wasm-simd-threaded.asyncify.wasm")),
	);
}

export function registerSpeechModelProtocol(options: {
	/** Where downloaded models live (inside the user's data folder). */
	cacheDir: string;
	/** Folders that may hold the ONNX Runtime wasm build, tried in order. */
	runtimeDirs: string[];
}) {
	// One download per file even if two pages ask for it at once.
	const downloads = new Map<string, Promise<void>>();

	protocol.handle(SPEECH_SCHEME, async (request) => {
		const url = new URL(request.url);
		const urlPath = decodeURIComponent(url.pathname);

		if (url.host === "runtime") {
			const name = urlPath.replace(/^\/+/, "");
			if (!RUNTIME_FILE.test(name)) return new Response(null, { status: 404 });
			for (const dir of options.runtimeDirs) {
				const candidate = path.join(dir, name);
				if (existsSync(candidate)) return serveFile(candidate, request.headers.get("range"));
			}
			return new Response(null, { status: 404 });
		}

		if (url.host !== "models") return new Response(null, { status: 404 });
		const target = resolveModelFile(options.cacheDir, urlPath);
		if (!target) return new Response(null, { status: 404 });
		const rangeHeader = request.headers.get("range");
		if (existsSync(target.localPath)) return serveFile(target.localPath, rangeHeader);

		const remote = `${REMOTE}/${target.modelId}/resolve/main/${target.file}`;
		if (rangeHeader) {
			// A probe for size or existence: pass it through, nothing to keep.
			try {
				const probe = await net.fetch(remote, { headers: { Range: rangeHeader } });
				const headers = headersFor(target.localPath, probe.headers.get("content-length"));
				const contentRange = probe.headers.get("content-range");
				if (contentRange) headers.set("Content-Range", contentRange);
				return new Response(probe.body, { status: probe.status, headers });
			} catch {
				return new Response(null, { status: 502, statusText: "Offline" });
			}
		}

		const pending = downloads.get(target.localPath);
		if (pending) {
			await pending.catch(() => undefined);
			return existsSync(target.localPath)
				? serveFile(target.localPath, null)
				: new Response(null, { status: 502 });
		}

		let upstream: Response;
		try {
			upstream = await net.fetch(remote);
		} catch (error) {
			console.warn("[speech] download failed:", remote, error);
			return new Response(null, { status: 502, statusText: "Offline" });
		}
		if (!upstream.ok || !upstream.body) {
			return new Response(null, { status: upstream.status, statusText: upstream.statusText });
		}

		// Half of the stream goes to disk, half to the page. The disk copy finishes even
		// if the page stops reading (the transcription was cancelled), and only a
		// complete file ever gets the real name.
		const [toDisk, toPage] = upstream.body.tee();
		const tmp = `${target.localPath}${PARTIAL_SUFFIX}`;
		const saving = (async () => {
			await fs.mkdir(path.dirname(target.localPath), { recursive: true });
			try {
				await pipeline(Readable.fromWeb(toDisk as never), createWriteStream(tmp));
				await fs.rename(tmp, target.localPath);
			} catch (error) {
				await fs.rm(tmp, { force: true }).catch(() => undefined);
				throw error;
			}
		})();
		downloads.set(target.localPath, saving);
		saving
			.catch((error) => console.warn("[speech] could not save", target.file, error))
			.finally(() => downloads.delete(target.localPath));

		return new Response(toPage, {
			status: 200,
			headers: headersFor(target.localPath, upstream.headers.get("content-length")),
		});
	});
}
