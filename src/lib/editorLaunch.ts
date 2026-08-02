import type { ExportQuality, Mp4FrameRate } from "./exporter/types";

export interface EditorLaunchOptions {
	backgroundPublish?: boolean;
	backgroundSavePath?: string;
	title?: string;
	quality?: ExportQuality;
	frameRate?: Mp4FrameRate;
}
