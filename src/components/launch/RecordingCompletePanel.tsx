import { CheckCircle2, CloudUpload, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CompletedRecordingDraft } from "@/hooks/useScreenRecorder";

interface RecordingCompletePanelProps {
	draft: CompletedRecordingDraft;
	yandexConnected: boolean;
	onTitleChange: (title: string) => void;
	onPublish: () => void;
	onOpenEditor: () => void;
	onConfigureYandex: () => void;
}

export function RecordingCompletePanel({
	draft,
	yandexConnected,
	onTitleChange,
	onPublish,
	onOpenEditor,
	onConfigureYandex,
}: RecordingCompletePanelProps) {
	return (
		<div className="w-[520px] p-2">
			<div className="flex items-start gap-3 px-1 pb-3">
				<div className="mt-0.5 rounded-full bg-emerald-400/10 p-2 text-emerald-300">
					<CheckCircle2 size={18} />
				</div>
				<div className="min-w-0 flex-1">
					<div className="text-[13px] font-semibold text-white">Запись сохранена локально</div>
					<div className="mt-0.5 text-[10px] leading-relaxed text-white/45">
						Она не отправится в Яндекс Диск, пока вы не нажмёте «Опубликовать».
					</div>
				</div>
			</div>

			<label className="block px-1">
				<span className="text-[10px] font-medium text-white/55">Название видео</span>
				<input
					autoFocus
					type="text"
					value={draft.title}
					onChange={(event) => onTitleChange(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							(yandexConnected ? onPublish : onConfigureYandex)();
						}
					}}
					className="mt-1 h-9 w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 text-[12px] text-white outline-none transition-colors placeholder:text-white/25 focus:border-emerald-400/50 focus:bg-white/[0.07]"
				/>
			</label>

			<div className="mt-3 grid grid-cols-2 gap-2 px-1">
				<Button
					type="button"
					variant="secondary"
					onClick={onOpenEditor}
					className="h-9 gap-2 border border-white/10 bg-white/[0.06] text-[11px] text-white hover:bg-white/[0.10]"
				>
					<SlidersHorizontal size={14} />
					Открыть редактор
				</Button>
				<Button
					type="button"
					onClick={yandexConnected ? onPublish : onConfigureYandex}
					className="h-9 gap-2 bg-emerald-400 text-[11px] font-semibold text-emerald-950 hover:bg-emerald-300"
				>
					<CloudUpload size={14} />
					{yandexConnected ? "Опубликовать" : "Настроить Яндекс Диск"}
				</Button>
			</div>
		</div>
	);
}
