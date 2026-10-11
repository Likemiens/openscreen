import type { Application } from "pixi.js";

/**
 * Destroys one Pixi application and everything it owns, but leaves Pixi's global pools
 * alone. `app.destroy(true)` also runs `GlobalResourceRegistry.release()`, which destroys
 * batch objects other live applications are still drawing with. The editor always has
 * two: when an export's renderer was torn down that way, the preview's next render threw
 * "Cannot read properties of null (reading 'geometry')" and its ticker never ran again.
 */
export function destroyPixiApp(app: Application): void {
	app.destroy({ removeView: true }, { children: true, texture: true, textureSource: true });
}
