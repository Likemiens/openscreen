import { Download, SlidersHorizontal, X } from "lucide-react";
import { useState } from "react";
import yandexDiskLogo from "@/assets/yandex-disk.svg";
import type {
	CompletedRecordingDraft,
	CompletedRecordingExportOptions,
} from "@/hooks/useScreenRecorder";
import type { ExportQuality, Mp4FrameRate } from "@/lib/exporter";
import styles from "./hud.module.css";

interface RecordingCompletePanelProps {
	draft: CompletedRecordingDraft;
	yandexConnected: boolean;
	onTitleChange: (title: string) => void;
	onPublish: (options: CompletedRecordingExportOptions) => void;
	onSaveAnywhere: (options: CompletedRecordingExportOptions) => void;
	onOpenEditor: (options: CompletedRecordingExportOptions) => void;
	onConfigureYandex: () => void;
	onDismiss?: () => void;
}

const QUALITY_OPTIONS: Array<{ value: ExportQuality; label: string }> = [
	{ value: "medium", label: "720p" },
	{ value: "good", label: "1080p" },
	{ value: "source", label: "Source" },
];

const FPS_OPTIONS: Mp4FrameRate[] = [30, 60];

/**
 * Shown for recordings that need a render pass — an editable cursor or a camera track
 * to composite. The recording stays local; each action renders the final MP4 first.
 */
export function RecordingCompletePanel({
	draft,
	yandexConnected,
	onTitleChange,
	onPublish,
	onSaveAnywhere,
	onOpenEditor,
	onConfigureYandex,
	onDismiss,
}: RecordingCompletePanelProps) {
	const [quality, setQuality] = useState<ExportQuality>(draft.exportOptions.quality);
	const [frameRate, setFrameRate] = useState<Mp4FrameRate>(draft.exportOptions.frameRate);
	const exportOptions = { quality, frameRate };

	return (
		<div className="flex w-[460px] flex-col gap-3 p-3.5">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<div className={styles.title}>Recording ready</div>
					<div className={`${styles.caption} mt-0.5`}>
						Saved on this device. It is rendered with your cursor and camera when you export.
					</div>
				</div>
				{onDismiss && (
					<button
						type="button"
						aria-label="Close"
						className={`${styles.button} ${styles.buttonGhost} ${styles.iconOnly} -mr-1 -mt-1 h-6 w-6 flex-none`}
						onClick={onDismiss}
					>
						<X size={14} aria-hidden="true" />
					</button>
				)}
			</div>

			<input
				autoFocus
				type="text"
				aria-label="Video title"
				value={draft.title}
				spellCheck={false}
				onChange={(event) => onTitleChange(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === "Enter") {
						event.preventDefault();
						if (yandexConnected) onPublish(exportOptions);
						else onConfigureYandex();
					}
				}}
				className={styles.field}
			/>

			<div className="flex items-center gap-2">
				<fieldset className={`${styles.picker} flex-[3]`}>
					<legend className="sr-only">Quality</legend>
					{QUALITY_OPTIONS.map((option) => (
						<button
							key={option.value}
							type="button"
							aria-pressed={quality === option.value}
							onClick={() => setQuality(option.value)}
							className={`${styles.pickerOption} ${
								quality === option.value ? styles.pickerOptionSelected : ""
							}`}
						>
							{option.label}
						</button>
					))}
				</fieldset>
				<fieldset className={`${styles.picker} flex-[2]`}>
					<legend className="sr-only">Frame rate</legend>
					{FPS_OPTIONS.map((fps) => (
						<button
							key={fps}
							type="button"
							aria-pressed={frameRate === fps}
							onClick={() => setFrameRate(fps)}
							className={`${styles.pickerOption} ${
								frameRate === fps ? styles.pickerOptionSelected : ""
							}`}
						>
							{fps} FPS
						</button>
					))}
				</fieldset>
			</div>

			<div className="flex items-center gap-1.5">
				<button
					type="button"
					className={`${styles.button} ${yandexConnected ? "" : styles.buttonPrimary} flex-1`}
					onClick={() => onSaveAnywhere(exportOptions)}
				>
					<Download size={13} aria-hidden="true" />
					Save anywhere
				</button>
				<button
					type="button"
					className={`${styles.button} flex-1`}
					onClick={() => onOpenEditor(exportOptions)}
				>
					<SlidersHorizontal size={13} aria-hidden="true" />
					Edit in Studio
				</button>
				<button
					type="button"
					className={`${styles.button} ${yandexConnected ? styles.buttonPrimary : ""} flex-[1.2]`}
					onClick={() => (yandexConnected ? onPublish(exportOptions) : onConfigureYandex())}
				>
					<img src={yandexDiskLogo} alt="" className="h-[14px] w-[14px]" />
					{yandexConnected ? "Publish & get link" : "Connect Yandex Disk"}
				</button>
			</div>
		</div>
	);
}
