import { Crop, Film, FolderOpen, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
	type CropSide,
	cropToInsets,
	getCroppedSize,
	getMaxCropInset,
	isFullCrop,
	setCropInset,
} from "@/lib/cropInsets";
import {
	canRotateDevice,
	DEFAULT_DEVICE_ORIENTATION,
	DEVICE_CAMERA_LABELS,
	DEVICE_CAMERAS,
	DEVICE_COLOR_LABELS,
	DEVICE_FRAME_COLORS,
	DEVICE_FRAME_KINDS,
	DEVICE_FRAME_LABELS,
	type DeviceFrameSettings,
	getDeviceScreenAspect,
} from "@/lib/deviceFrame";
import type { AspectRatio } from "@/utils/aspectRatioUtils";
import {
	StudioNumberField,
	StudioSection,
	StudioSegmented,
	StudioSelect,
	StudioSliderRow,
} from "./studioControls";
import { type CropRegion, DEFAULT_CROP_REGION } from "./types";

interface FramePanelProps {
	videoElement: HTMLVideoElement | null;
	/** File name of the video being edited. */
	sourceName: string | null;
	onOpenVideo?: () => void;
	deviceFrame: DeviceFrameSettings;
	onDeviceFrameChange: (next: DeviceFrameSettings) => void;
	/** Full-bleed camera layouts leave no room for a frame. */
	deviceFrameUnavailable?: boolean;
	padding: number;
	/** The stacked camera layout fills the canvas, so there is nothing to scale. */
	paddingUnavailable?: boolean;
	onPaddingChange: (value: number) => void;
	onPaddingCommit?: () => void;
	borderRadius: number;
	onBorderRadiusChange: (value: number) => void;
	onBorderRadiusCommit?: () => void;
	aspectRatio: AspectRatio;
	onAspectRatioChange: (value: AspectRatio) => void;
	cropRegion: CropRegion;
	onCropChange: (region: CropRegion) => void;
	onOpenCropEditor: () => void;
}

// The quick picks; the timeline's aspect menu still has the less common ratios.
const ASPECT_OPTIONS: ReadonlyArray<{ value: AspectRatio; label: string; title?: string }> = [
	{ value: "native", label: "Auto", title: "Match the video" },
	{ value: "16:9", label: "16:9" },
	{ value: "4:3", label: "4:3" },
	{ value: "1:1", label: "1:1" },
	{ value: "9:16", label: "9:16" },
];

// Padding 0–100 maps onto the video filling 100–60% of the canvas (see layoutUtils).
const PADDING_TO_SCALE = 0.4;
const MIN_SCALE_PERCENT = 60;

const CROP_FIELDS: ReadonlyArray<{ side: CropSide; label: string }> = [
	{ side: "top", label: "Top" },
	{ side: "bottom", label: "Bottom" },
	{ side: "left", label: "Left" },
	{ side: "right", label: "Right" },
];

function useVideoMetadata(video: HTMLVideoElement | null) {
	const [metadata, setMetadata] = useState({ width: 0, height: 0, duration: 0 });

	useEffect(() => {
		if (!video) {
			setMetadata({ width: 0, height: 0, duration: 0 });
			return;
		}
		const update = () =>
			setMetadata((current) => {
				const duration = Number.isFinite(video.duration) ? video.duration : 0;
				return current.width === video.videoWidth &&
					current.height === video.videoHeight &&
					current.duration === duration
					? current
					: { width: video.videoWidth, height: video.videoHeight, duration };
			});
		update();
		video.addEventListener("loadedmetadata", update);
		video.addEventListener("durationchange", update);
		video.addEventListener("resize", update);
		return () => {
			video.removeEventListener("loadedmetadata", update);
			video.removeEventListener("durationchange", update);
			video.removeEventListener("resize", update);
		};
	}, [video]);

	return metadata;
}

function formatDuration(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds <= 0) return "";
	const total = Math.round(seconds);
	return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** A still of the video for the source card, redrawn when the video changes. */
function SourceThumbnail({ video }: { video: HTMLVideoElement | null }) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const [painted, setPainted] = useState(false);

	useEffect(() => {
		setPainted(false);
		if (!video) return;
		const paint = () => {
			const canvas = canvasRef.current;
			if (!canvas || video.readyState < 2 || !video.videoWidth) return;
			try {
				canvas.width = 144;
				canvas.height = Math.max(1, Math.round((144 * video.videoHeight) / video.videoWidth));
				canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
				setPainted(true);
			} catch {
				// A frame that cannot be read just leaves the placeholder icon.
			}
		};
		paint();
		video.addEventListener("loadeddata", paint);
		video.addEventListener("seeked", paint);
		return () => {
			video.removeEventListener("loadeddata", paint);
			video.removeEventListener("seeked", paint);
		};
	}, [video]);

	return (
		<div className="relative flex h-11 w-[68px] flex-none items-center justify-center overflow-hidden rounded-lg bg-black/50">
			<canvas
				ref={canvasRef}
				aria-hidden="true"
				className={`h-full w-full object-cover ${painted ? "" : "invisible"}`}
			/>
			{!painted && <Film className="absolute h-4 w-4 text-white/30" aria-hidden="true" />}
		</div>
	);
}

/**
 * How the video is presented: what it is (source and crop), what it sits in (device
 * mockup), and the canvas around it (aspect ratio and scale).
 */
export function FramePanel({
	videoElement,
	sourceName,
	onOpenVideo,
	deviceFrame,
	onDeviceFrameChange,
	deviceFrameUnavailable,
	padding,
	paddingUnavailable,
	onPaddingChange,
	onPaddingCommit,
	borderRadius,
	onBorderRadiusChange,
	onBorderRadiusCommit,
	aspectRatio,
	onAspectRatioChange,
	cropRegion,
	onCropChange,
	onOpenCropEditor,
}: FramePanelProps) {
	const { width: sourceWidth, height: sourceHeight, duration } = useVideoMetadata(videoElement);
	const hasSource = sourceWidth > 0 && sourceHeight > 0;
	const insets = cropToInsets(cropRegion, sourceWidth, sourceHeight);
	const cropped = getCroppedSize(cropRegion, sourceWidth, sourceHeight);
	const cropActive = !isFullCrop(cropRegion);
	const hasDevice = deviceFrame.kind !== "none";
	const rotatable = canRotateDevice(deviceFrame.kind);
	const landscape = deviceFrame.orientation === "landscape";
	// A device with a real screen keeps that screen's shape; the video is placed on it.
	const hasFixedScreen = getDeviceScreenAspect(deviceFrame) !== null;
	const scalePercent = paddingUnavailable ? 100 : Math.round(100 - padding * PADDING_TO_SCALE);

	const updateDevice = (patch: Partial<DeviceFrameSettings>) =>
		onDeviceFrameChange({ ...deviceFrame, ...patch });

	const sourceMeta = hasSource
		? [`${sourceWidth} × ${sourceHeight}`, formatDuration(duration)].filter(Boolean).join(" · ")
		: "Loading…";

	return (
		<div className="space-y-5 px-1 pb-3" data-testid="studio-frame-panel">
			<StudioSection label="Video">
				<div className="flex items-center gap-3 rounded-xl bg-white/[0.055] p-2 pr-2.5">
					<SourceThumbnail video={videoElement} />
					<div className="min-w-0 flex-1">
						<div
							className="truncate text-[12.5px] font-semibold text-white"
							title={sourceName ?? ""}
						>
							{sourceName ?? "Untitled video"}
						</div>
						<div className="mt-0.5 truncate text-[11px] tabular-nums text-white/45">
							{sourceMeta}
						</div>
					</div>
					{onOpenVideo && (
						<button
							type="button"
							title="Open another video"
							aria-label="Open another video"
							data-testid="studio-open-video"
							onClick={onOpenVideo}
							className="flex h-8 w-8 flex-none items-center justify-center rounded-lg text-white/55 transition-colors hover:bg-white/[0.09] hover:text-white"
						>
							<FolderOpen className="h-4 w-4" />
						</button>
					)}
				</div>
			</StudioSection>

			<StudioSection label="Device">
				<StudioSelect
					label="Device"
					value={deviceFrame.kind}
					// Each device arrives the way it is usually held; it can be turned below.
					onChange={(kind) => updateDevice({ kind, orientation: DEFAULT_DEVICE_ORIENTATION[kind] })}
					options={DEVICE_FRAME_KINDS.map((kind) => ({
						value: kind,
						label: DEVICE_FRAME_LABELS[kind],
					}))}
				/>
				{hasDevice && deviceFrameUnavailable && (
					<p className="text-[11px] leading-relaxed text-amber-200/70">
						The stacked and side-by-side camera layouts fill the canvas, so the device is not drawn
						there.
					</p>
				)}
			</StudioSection>

			{hasDevice && (
				<StudioSection label="Color">
					<StudioSelect
						label="Device color"
						value={deviceFrame.color}
						onChange={(color) => updateDevice({ color })}
						options={DEVICE_FRAME_COLORS.map((color) => ({
							value: color,
							label: DEVICE_COLOR_LABELS[color],
						}))}
					/>
				</StudioSection>
			)}

			{hasDevice && hasFixedScreen && (
				<StudioSection label="Screen">
					{rotatable && (
						<StudioSegmented
							label="Orientation"
							value={deviceFrame.orientation}
							onChange={(orientation) => updateDevice({ orientation })}
							options={[
								{ value: "portrait", label: "Portrait" },
								{ value: "landscape", label: "Landscape" },
							]}
						/>
					)}
					<StudioSegmented
						label="Video on screen"
						value={deviceFrame.fit}
						onChange={(fit) => updateDevice({ fit })}
						options={[
							{ value: "fill", label: "Fill", title: "Cover the screen; the overflow is cropped" },
							{ value: "fit", label: "Fit", title: "Show the whole video; bars fill the rest" },
						]}
					/>
					<p className="text-[11px] leading-relaxed text-white/40">
						{deviceFrame.fit === "fill"
							? "The device keeps its real proportions. The video covers the screen, so crop it to choose what shows."
							: "The device keeps its real proportions. The whole video is shown inside the screen."}
					</p>
				</StudioSection>
			)}

			{deviceFrame.kind === "phone" && (
				<StudioSection label="Camera">
					<StudioSegmented
						label="Camera cutout"
						value={deviceFrame.camera}
						onChange={(camera) => updateDevice({ camera })}
						options={DEVICE_CAMERAS.map((camera) => ({
							value: camera,
							label: DEVICE_CAMERA_LABELS[camera],
						}))}
					/>
					{/* Only a phone held sideways has a camera end to choose. */}
					{landscape && deviceFrame.camera !== "none" && (
						<StudioSegmented
							label="Camera side"
							value={deviceFrame.cameraSide}
							onChange={(cameraSide) => updateDevice({ cameraSide })}
							options={[
								{ value: "left", label: "Left" },
								{ value: "right", label: "Right" },
							]}
						/>
					)}
				</StudioSection>
			)}

			<StudioSection label="Aspect ratio">
				<StudioSegmented
					label="Aspect ratio"
					// A ratio picked from the timeline's longer list simply shows no quick pick.
					value={aspectRatio}
					onChange={onAspectRatioChange}
					options={ASPECT_OPTIONS}
				/>
				<StudioSliderRow
					label="Scale"
					value={scalePercent}
					display={paddingUnavailable ? "—" : `${scalePercent}%`}
					disabled={paddingUnavailable}
					min={MIN_SCALE_PERCENT}
					max={100}
					onChange={(value) =>
						onPaddingChange(Math.max(0, Math.min(100, (100 - value) / PADDING_TO_SCALE)))
					}
					onCommit={onPaddingCommit}
				/>
				{!hasDevice && (
					<StudioSliderRow
						label="Corners"
						value={borderRadius}
						display={`${Math.round(borderRadius)}px`}
						min={0}
						max={64}
						step={0.5}
						onChange={onBorderRadiusChange}
						onCommit={onBorderRadiusCommit}
					/>
				)}
			</StudioSection>

			<StudioSection
				label="Crop"
				action={
					cropActive ? (
						<button
							type="button"
							title="Remove the crop"
							aria-label="Reset crop"
							onClick={() => onCropChange({ ...DEFAULT_CROP_REGION })}
							className="flex h-5 w-5 items-center justify-center rounded text-white/45 transition-colors hover:bg-white/[0.09] hover:text-white"
						>
							<RotateCcw className="h-3 w-3" />
						</button>
					) : undefined
				}
			>
				<div className="grid grid-cols-2 gap-2">
					{CROP_FIELDS.map(({ side, label }) => (
						<StudioNumberField
							key={side}
							label={label}
							value={insets[side]}
							disabled={!hasSource}
							max={getMaxCropInset(cropRegion, side, sourceWidth, sourceHeight)}
							onCommit={(pixels) =>
								onCropChange(setCropInset(cropRegion, side, pixels, sourceWidth, sourceHeight))
							}
						/>
					))}
				</div>
				<div className="flex items-center justify-between gap-2">
					<span className="text-[11px] tabular-nums text-white/45">
						{hasSource ? `Result ${cropped.width} × ${cropped.height}` : ""}
					</span>
					<button
						type="button"
						onClick={onOpenCropEditor}
						className="flex h-8 items-center gap-1.5 rounded-lg bg-white/[0.065] px-2.5 text-[12px] font-medium text-white/80 transition-colors hover:bg-white/[0.1] hover:text-white"
					>
						<Crop className="h-3.5 w-3.5" />
						Adjust on video
					</button>
				</div>
			</StudioSection>
		</div>
	);
}
