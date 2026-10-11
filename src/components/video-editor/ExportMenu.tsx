import { ChevronDown, CloudUpload, Download, TriangleAlert } from "lucide-react";
import { useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
	type ExportFormat,
	type ExportQuality,
	GIF_FRAME_RATES,
	GIF_SIZE_PRESETS,
	type GifFrameRate,
	type GifSizePreset,
} from "@/lib/exporter";
import { cn } from "@/lib/utils";
import { StudioSegmented, StudioToggleRow } from "./studioControls";

/** Short side an MP4 preset renders at; `source` keeps the video's own size. */
const MP4_SHORT_SIDES: Record<Exclude<ExportQuality, "source">, number> = {
	medium: 720,
	good: 1080,
};

const GIF_SIZE_LABELS: Record<GifSizePreset, string> = {
	medium: "720p",
	large: "1080p",
	original: "Original",
};

interface Size {
	width: number;
	height: number;
}

export interface ExportMenuProps {
	/** No video is loaded, or an export is already running. */
	disabled?: boolean;
	format: ExportFormat;
	onFormatChange: (format: ExportFormat) => void;
	quality: ExportQuality;
	onQualityChange: (quality: ExportQuality) => void;
	/** Size of the (cropped) source video, for the quality labels. */
	sourceSize: Size | null;
	gifFrameRate: GifFrameRate;
	onGifFrameRateChange: (rate: GifFrameRate) => void;
	gifSizePreset: GifSizePreset;
	onGifSizePresetChange: (preset: GifSizePreset) => void;
	gifLoop: boolean;
	onGifLoopChange: (loop: boolean) => void;
	gifOutputSize: Size;
	/** Whether a Yandex Disk account is connected; `null` while that is being read. */
	yandexConnected: boolean | null;
	/** Render and save to a file the user picks. */
	onSave: () => void;
	/** Render an MP4, upload it and copy its public link. */
	onPublish: () => void;
	onConnectYandex: () => void;
	/** An export that rendered but could not be written: offer to save it again. */
	hasUnsavedExport?: boolean;
	onSaveUnsavedExport?: () => void;
	/** Opening the menu is a good moment to refresh what it shows. */
	onOpen?: () => void;
}

/**
 * The one place a video leaves Studio from: what to render (format, quality), then
 * where it goes — a file on this computer, or Yandex Disk with a link to share.
 */
export function ExportMenu({
	disabled,
	format,
	onFormatChange,
	quality,
	onQualityChange,
	sourceSize,
	gifFrameRate,
	onGifFrameRateChange,
	gifSizePreset,
	onGifSizePresetChange,
	gifLoop,
	onGifLoopChange,
	gifOutputSize,
	yandexConnected,
	onSave,
	onPublish,
	onConnectYandex,
	hasUnsavedExport,
	onSaveUnsavedExport,
	onOpen,
}: ExportMenuProps) {
	const [open, setOpen] = useState(false);
	const shortSide = sourceSize ? Math.min(sourceSize.width, sourceSize.height) : null;
	const upscales =
		format === "mp4" && quality !== "source" && shortSide !== null
			? shortSide < MP4_SHORT_SIDES[quality]
			: false;

	// The menu fades out for a moment after a choice; a second click in that moment
	// must not run the action again.
	const choiceMadeRef = useRef(false);
	const run = (action: () => void) => {
		if (choiceMadeRef.current) return;
		choiceMadeRef.current = true;
		setOpen(false);
		action();
	};

	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (next) {
					choiceMadeRef.current = false;
					onOpen?.();
				}
			}}
		>
			<PopoverTrigger asChild>
				<button
					type="button"
					data-testid="testId-export-panel-button"
					disabled={disabled}
					className="flex h-8 items-center gap-1.5 rounded-lg bg-[#0A84FF] pl-3 pr-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#2B95FF] disabled:cursor-not-allowed disabled:opacity-40 data-[state=open]:bg-[#2B95FF]"
				>
					<Download size={14} />
					Export
					<ChevronDown size={13} className="opacity-70" />
				</button>
			</PopoverTrigger>
			<PopoverContent
				align="end"
				sideOffset={8}
				data-testid="studio-export-menu"
				className="z-[150] w-[320px] space-y-3.5 rounded-2xl border border-white/10 bg-[#232326] p-4 text-white shadow-[0_18px_44px_-12px_rgba(0,0,0,0.7)]"
			>
				{hasUnsavedExport && onSaveUnsavedExport && (
					<div className="flex items-start gap-2.5 rounded-xl border border-amber-300/20 bg-amber-300/[0.07] p-2.5">
						<TriangleAlert className="mt-0.5 h-3.5 w-3.5 flex-none text-amber-300" />
						<div className="min-w-0 flex-1">
							<p className="text-[12px] font-medium text-white/90">The last export was not saved</p>
							<button
								type="button"
								onClick={() => run(onSaveUnsavedExport)}
								className="mt-1 text-[12px] font-medium text-[#409CFF] hover:text-[#6BB2FF]"
							>
								Choose where to save it…
							</button>
						</div>
					</div>
				)}

				<div className="space-y-2">
					<h3 className="text-[11px] font-medium text-white/45">Format</h3>
					<StudioSegmented
						label="Format"
						value={format}
						onChange={onFormatChange}
						options={[
							{ value: "mp4", label: "MP4 video", testId: "testId-mp4-format-button" },
							{ value: "gif", label: "GIF", testId: "testId-gif-format-button" },
						]}
					/>
				</div>

				{format === "mp4" ? (
					<div className="space-y-2">
						<h3 className="text-[11px] font-medium text-white/45">Quality</h3>
						<StudioSegmented
							label="Quality"
							value={quality}
							onChange={onQualityChange}
							options={[
								{ value: "medium", label: "720p" },
								{ value: "good", label: "1080p" },
								{ value: "source", label: shortSide ? `Source · ${shortSide}p` : "Source" },
							]}
						/>
						{sourceSize && (
							<p className="text-[11px] leading-relaxed text-white/40">
								The video is {sourceSize.width} × {sourceSize.height}.
								{upscales ? " This size enlarges it; Source keeps it as recorded." : ""}
							</p>
						)}
					</div>
				) : (
					<div className="space-y-2">
						<h3 className="text-[11px] font-medium text-white/45">Frame rate</h3>
						<StudioSegmented
							label="GIF frame rate"
							value={String(gifFrameRate)}
							onChange={(value) => onGifFrameRateChange(Number(value) as GifFrameRate)}
							options={GIF_FRAME_RATES.map((rate) => ({
								value: String(rate.value),
								label: `${rate.value} fps`,
								title: rate.label,
							}))}
						/>
						<h3 className="pt-1 text-[11px] font-medium text-white/45">Size</h3>
						<StudioSegmented
							label="GIF size"
							value={gifSizePreset}
							onChange={onGifSizePresetChange}
							options={(Object.keys(GIF_SIZE_PRESETS) as GifSizePreset[]).map((preset) => ({
								value: preset,
								label: GIF_SIZE_LABELS[preset],
								title: GIF_SIZE_PRESETS[preset].label,
								testId: `testId-gif-size-button-${preset}`,
							}))}
						/>
						<StudioToggleRow label="Loop forever" checked={gifLoop} onChange={onGifLoopChange} />
						<p className="text-[11px] tabular-nums text-white/40">
							{gifOutputSize.width} × {gifOutputSize.height} px
						</p>
					</div>
				)}

				<div className="space-y-2 border-t border-white/[0.08] pt-3.5">
					<button
						type="button"
						data-testid="testId-export-button"
						onClick={() => run(onSave)}
						className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#0A84FF] text-[13px] font-semibold text-white transition-colors hover:bg-[#2B95FF]"
					>
						<Download size={15} />
						Save to computer…
					</button>
					{yandexConnected === false ? (
						<button
							type="button"
							data-testid="studio-export-connect-yandex"
							onClick={() => run(onConnectYandex)}
							className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-white/[0.07] text-[13px] font-medium text-white/85 transition-colors hover:bg-white/[0.11] hover:text-white"
						>
							<CloudUpload size={15} />
							Connect Yandex Disk to publish…
						</button>
					) : (
						<button
							type="button"
							data-testid="studio-export-publish"
							disabled={format === "gif" || yandexConnected === null}
							onClick={() => run(onPublish)}
							className={cn(
								"flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-white/[0.07] text-[13px] font-medium text-white/85 transition-colors",
								"hover:bg-white/[0.11] hover:text-white disabled:pointer-events-none disabled:opacity-40",
							)}
						>
							<CloudUpload size={15} />
							Publish &amp; copy link
						</button>
					)}
					<p className="text-[11px] leading-relaxed text-white/40">
						{format === "gif"
							? "Links are published as MP4. Switch the format to publish."
							: yandexConnected === false
								? "Publishing uploads the video to your Yandex Disk and copies a link to share."
								: "Publish uploads the MP4 to Yandex Disk and copies its link."}
					</p>
				</div>
			</PopoverContent>
		</Popover>
	);
}
