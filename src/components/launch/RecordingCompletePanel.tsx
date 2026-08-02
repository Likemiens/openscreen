import { CheckCircle2, Download, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import yandexDiskLogo from "@/assets/yandex-disk.svg";
import { Button } from "@/components/ui/button";
import type {
	CompletedRecordingDraft,
	CompletedRecordingExportOptions,
} from "@/hooks/useScreenRecorder";
import type { ExportQuality, Mp4FrameRate } from "@/lib/exporter";

interface RecordingCompletePanelProps {
	draft: CompletedRecordingDraft;
	yandexConnected: boolean;
	onTitleChange: (title: string) => void;
	onPublish: (options: CompletedRecordingExportOptions) => void;
	onSaveAnywhere: (options: CompletedRecordingExportOptions) => void;
	onOpenEditor: (options: CompletedRecordingExportOptions) => void;
	onConfigureYandex: () => void;
}

const QUALITY_OPTIONS: Array<{ value: ExportQuality; label: string }> = [
	{ value: "medium", label: "720p" },
	{ value: "good", label: "1080p" },
	{ value: "source", label: "Source" },
];

const FPS_OPTIONS: Mp4FrameRate[] = [30, 60];

export function RecordingCompletePanel({
	draft,
	yandexConnected,
	onTitleChange,
	onPublish,
	onSaveAnywhere,
	onOpenEditor,
	onConfigureYandex,
}: RecordingCompletePanelProps) {
	const [quality, setQuality] = useState<ExportQuality>("good");
	const [frameRate, setFrameRate] = useState<Mp4FrameRate>(60);
	const exportOptions = { quality, frameRate };

	return (
		<div className="w-[640px] p-3 text-white">
			<div className="flex items-start gap-3 px-1">
				<div className="mt-0.5 rounded-full bg-emerald-400/10 p-2 text-emerald-300">
					<CheckCircle2 size={18} />
				</div>
				<div className="min-w-0 flex-1">
					<div className="text-[13px] font-semibold">Recording ready</div>
					<div className="mt-0.5 text-[10px] leading-relaxed text-white/45">
						Your original recording is safe locally. Nothing is uploaded until you choose Publish.
					</div>
				</div>
			</div>

			<label className="mt-3 block px-1">
				<span className="text-[10px] font-medium text-white/55">Video title</span>
				<input
					autoFocus
					type="text"
					value={draft.title}
					onChange={(event) => onTitleChange(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							if (yandexConnected) onPublish(exportOptions);
							else onConfigureYandex();
						}
					}}
					className="mt-1 h-9 w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 text-[12px] text-white outline-none transition-colors placeholder:text-white/25 focus:border-blue-400/60 focus:bg-white/[0.07]"
				/>
			</label>

			<div className="mt-3 grid grid-cols-2 gap-2 px-1">
				<fieldset className="rounded-xl border border-white/[0.08] bg-white/[0.035] p-2">
					<legend className="px-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-white/40">
						Quality
					</legend>
					<div className="grid grid-cols-3 gap-1">
						{QUALITY_OPTIONS.map((option) => (
							<button
								key={option.value}
								type="button"
								aria-pressed={quality === option.value}
								onClick={() => setQuality(option.value)}
								className={`h-7 rounded-lg text-[10px] font-medium transition-colors ${
									quality === option.value
										? "bg-white text-[#171012]"
										: "text-white/55 hover:bg-white/[0.08] hover:text-white"
								}`}
							>
								{option.label}
							</button>
						))}
					</div>
				</fieldset>

				<fieldset className="rounded-xl border border-white/[0.08] bg-white/[0.035] p-2">
					<legend className="px-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-white/40">
						Frame rate
					</legend>
					<div className="grid grid-cols-2 gap-1">
						{FPS_OPTIONS.map((fps) => (
							<button
								key={fps}
								type="button"
								aria-pressed={frameRate === fps}
								onClick={() => setFrameRate(fps)}
								className={`h-7 rounded-lg text-[10px] font-medium transition-colors ${
									frameRate === fps
										? "bg-white text-[#171012]"
										: "text-white/55 hover:bg-white/[0.08] hover:text-white"
								}`}
							>
								{fps} FPS
							</button>
						))}
					</div>
				</fieldset>
			</div>

			<div className="mt-3 grid grid-cols-3 gap-2 px-1">
				<Button
					type="button"
					variant="secondary"
					onClick={() => onSaveAnywhere(exportOptions)}
					className="h-10 gap-2 border border-white/10 bg-white/[0.06] text-[11px] text-white hover:bg-white/[0.10]"
				>
					<Download size={14} />
					Save anywhere
				</Button>
				<Button
					type="button"
					variant="secondary"
					onClick={() => onOpenEditor(exportOptions)}
					className="h-10 gap-2 border border-white/10 bg-white/[0.06] text-[11px] text-white hover:bg-white/[0.10]"
				>
					<SlidersHorizontal size={14} />
					Edit in Studio
				</Button>
				<Button
					type="button"
					onClick={() => (yandexConnected ? onPublish(exportOptions) : onConfigureYandex())}
					className="h-10 gap-2 bg-[#ffcc00] text-[11px] font-semibold text-[#171012] hover:bg-[#ffd633]"
				>
					<img src={yandexDiskLogo} alt="" className="h-5 w-5" />
					{yandexConnected ? "Publish & get link" : "Connect Yandex Disk"}
				</Button>
			</div>
		</div>
	);
}
