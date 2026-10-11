import type { ExportQuality, Mp4FrameRate } from "@/lib/exporter";
import { calculateQuickClipBitrate, QUALITY_LABELS } from "@/lib/quickClip";
import type { RecordingCountdownSeconds } from "@/lib/recordingRecipes";
import type { CursorCaptureMode } from "@/lib/recordingSession";
import styles from "./hud.module.css";

interface FormatPanelProps {
	quality: ExportQuality;
	frameRate: Mp4FrameRate;
	countdownSeconds: RecordingCountdownSeconds;
	cursorCaptureMode: CursorCaptureMode;
	/** Editable cursors need the native recorder (Windows and macOS). */
	supportsCursorMode: boolean;
	/** Area clips always bake the cursor in, so the choice is locked there. */
	cursorModeLocked: boolean;
	onQualityChange: (quality: ExportQuality) => void;
	onFrameRateChange: (frameRate: Mp4FrameRate) => void;
	onCountdownChange: (seconds: RecordingCountdownSeconds) => void;
	onCursorCaptureModeChange: (mode: CursorCaptureMode) => void;
}

const QUALITY_OPTIONS: ExportQuality[] = ["medium", "good", "source"];
const FRAME_RATE_OPTIONS: Mp4FrameRate[] = [30, 60];
const COUNTDOWN_OPTIONS: RecordingCountdownSeconds[] = [0, 3, 5];

const NOMINAL_SIZE: Partial<Record<ExportQuality, { width: number; height: number }>> = {
	medium: { width: 1280, height: 720 },
	good: { width: 1920, height: 1080 },
};

/** Rough size of one minute of video, so quality can be chosen before recording. */
function describeFormat(quality: ExportQuality, frameRate: Mp4FrameRate): string {
	const size = NOMINAL_SIZE[quality];
	if (!size) return "Keeps the captured resolution. Largest files, saved without re-encoding.";
	const megabytesPerMinute =
		(calculateQuickClipBitrate(size.width, size.height, frameRate) * 60) / 8 / (1024 * 1024);
	return `Up to ${QUALITY_LABELS[quality]}, about ${Math.round(megabytesPerMinute)} MB per minute.`;
}

function Picker<T extends string | number>({
	label,
	options,
	value,
	disabled,
	onChange,
}: {
	label: string;
	options: Array<{ value: T; label: string }>;
	value: T;
	disabled?: boolean;
	onChange: (value: T) => void;
}) {
	return (
		<div className={styles.row}>
			<span className={styles.rowLabel}>{label}</span>
			<div className={styles.picker} role="radiogroup" aria-label={label}>
				{options.map((option) => (
					<button
						key={option.value}
						type="button"
						role="radio"
						aria-checked={value === option.value}
						disabled={disabled}
						className={`${styles.pickerOption} ${
							value === option.value ? styles.pickerOptionSelected : ""
						}`}
						onClick={() => onChange(option.value)}
					>
						{option.label}
					</button>
				))}
			</div>
		</div>
	);
}

/** Everything that decides how a recording is written, chosen before it starts. */
export function FormatPanel({
	quality,
	frameRate,
	countdownSeconds,
	cursorCaptureMode,
	supportsCursorMode,
	cursorModeLocked,
	onQualityChange,
	onFrameRateChange,
	onCountdownChange,
	onCursorCaptureModeChange,
}: FormatPanelProps) {
	return (
		<div className="flex w-[318px] flex-col gap-2 p-3.5" data-testid="hud-format-panel">
			<Picker
				label="Quality"
				options={QUALITY_OPTIONS.map((value) => ({ value, label: QUALITY_LABELS[value] }))}
				value={quality}
				onChange={onQualityChange}
			/>
			<Picker
				label="Frame rate"
				options={FRAME_RATE_OPTIONS.map((value) => ({ value, label: `${value} fps` }))}
				value={frameRate}
				onChange={onFrameRateChange}
			/>
			<div className={styles.caption}>{describeFormat(quality, frameRate)}</div>

			<div className={`${styles.separator} my-1`} />

			<Picker
				label="Countdown"
				options={COUNTDOWN_OPTIONS.map((value) => ({
					value,
					label: value === 0 ? "Off" : `${value} s`,
				}))}
				value={countdownSeconds}
				onChange={onCountdownChange}
			/>
			{supportsCursorMode && (
				<>
					<Picker
						label="Cursor"
						options={[
							{ value: "system" as const, label: "In video" },
							{ value: "editable-overlay" as const, label: "Editable" },
						]}
						value={cursorCaptureMode}
						disabled={cursorModeLocked}
						onChange={onCursorCaptureModeChange}
					/>
					<div className={styles.caption}>
						{cursorModeLocked
							? "Area clips record the cursor into the video."
							: cursorCaptureMode === "system"
								? "Clips are saved the moment you stop."
								: "The cursor can be restyled in Studio, so recordings open the export step."}
					</div>
				</>
			)}
		</div>
	);
}
