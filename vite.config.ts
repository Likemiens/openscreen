import { existsSync } from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import electron from "vite-plugin-electron/simple";

function onnxRuntimeWebGpu(): string {
	const candidates = [
		"node_modules/@huggingface/transformers/node_modules/onnxruntime-web/dist/ort.webgpu.min.mjs",
		"node_modules/onnxruntime-web/dist/ort.webgpu.min.mjs",
	].map((file) => path.resolve(__dirname, file));
	return candidates.find((file) => existsSync(file)) ?? candidates[0];
}

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [
		react(),
		electron({
			main: {
				entry: "electron/main.ts",
				onstart({ startup }) {
					const env = { ...process.env };
					delete env.ELECTRON_RUN_AS_NODE;
					return startup(["."], { env });
				},
				vite: {
					build: {},
				},
			},
			preload: {
				input: path.join(__dirname, "electron/preload.ts"),
			},
			renderer: process.env.NODE_ENV === "test" ? undefined : {},
		}),
	],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "src"),
			// ONNX Runtime's "extern wasm" build: it loads its wasm and threading glue from the
			// paths the transcription worker gives it (served by the main process), so they are
			// not bundled into dist/ a second time.
			"onnxruntime-web/webgpu": onnxRuntimeWebGpu(),
		},
	},
	optimizeDeps: {
		// Its ONNX Runtime loads wasm next to itself; pre-bundling would move it.
		exclude: ["@huggingface/transformers"],
	},
	// The transcription worker bundles transformers.js, which code-splits — unsupported
	// by the default "iife" worker format.
	worker: {
		format: "es",
	},
	build: {
		target: "esnext",
		minify: "terser",
		terserOptions: {
			compress: {
				drop_console: true,
				drop_debugger: true,
				pure_funcs: ["console.log", "console.debug"],
			},
		},
		rollupOptions: {
			output: {
				manualChunks(id) {
					if (id.includes("pixi.js") || id.includes("pixi-filters") || id.includes("@pixi/"))
						return "pixi";
					if (id.includes("react-dom") || id.includes("/react/")) return "react-vendor";
					// Encoding libraries load on demand (saving a clip, exporting). Keep anything
					// the recorder HUD needs at startup out of this chunk.
					if (id.includes("mediabunny") || id.includes("mp4box")) return "video-processing";
				},
			},
		},
		chunkSizeWarningLimit: 1000,
	},
});
