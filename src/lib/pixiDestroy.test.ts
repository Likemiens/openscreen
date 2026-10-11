import type { Application } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import { destroyPixiApp } from "./pixiDestroy";

describe("destroyPixiApp", () => {
	it("tears the app down without asking Pixi to release its global pools", () => {
		const destroy = vi.fn();
		destroyPixiApp({ destroy } as unknown as Application);

		expect(destroy).toHaveBeenCalledTimes(1);
		const [rendererOptions, options] = destroy.mock.calls[0];
		// `true` (or releaseGlobalResources) is what breaks the other live application.
		expect(rendererOptions).toEqual({ removeView: true });
		expect(options).toEqual({ children: true, texture: true, textureSource: true });
	});
});
