import {
	Captions,
	Check,
	Clapperboard,
	Copy,
	FileText,
	Film,
	FolderOpen,
	Link2,
	Loader2,
	Trash2,
	X,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { ReadyClip } from "@/hooks/useQuickClip";
import { formatClipDuration, formatFileSize } from "@/lib/quickClip";
import { Tooltip } from "../ui/tooltip";
import styles from "./hud.module.css";

interface ClipCardProps {
	clip: ReadyClip;
	yandexConnected: boolean;
	onRename: (title: string) => void;
	onShare: () => void;
	onConnectYandex: () => void;
	onCopyFile: () => Promise<boolean>;
	onReveal: () => void;
	onStartDrag: () => void;
	onOpenStudio: () => void;
	onDelete: () => void;
	onDismiss: () => void;
	onOpenLink: (url: string) => void;
	/** Absent when transcription isn't installed: the control is not shown. */
	onTranscribe?: () => void;
	onCancelTranscript: () => void;
	onOpenTranscript: () => void;
	onCopyTranscript: () => Promise<boolean>;
}

const COPIED_FEEDBACK_MS = 1_800;

function transcriptStatusText(transcript: ReadyClip["transcript"]): string {
	if (transcript.status !== "working") return "";
	const percent = transcript.progress === null ? "" : ` ${Math.round(transcript.progress * 100)}%`;
	if (transcript.phase === "model") return `Loading the speech model${percent}`;
	return `Transcribing${percent}${transcript.device === "cpu" ? " · on the processor" : ""}`;
}

/** The last two folders of the clip's own path, shown as where it was saved. */
function folderName(filePath: string): string {
	const parts = filePath.split(/[\\/]/).filter(Boolean);
	return parts.slice(-3, -1).join("\\") || "your clips folder";
}

/**
 * The finished clip, shown the moment recording stops. The file is already on disk;
 * everything here is about getting it to someone: a link, the file itself, or a drag.
 */
export function ClipCard({
	clip,
	yandexConnected,
	onRename,
	onShare,
	onConnectYandex,
	onCopyFile,
	onReveal,
	onStartDrag,
	onOpenStudio,
	onDelete,
	onDismiss,
	onOpenLink,
	onTranscribe,
	onCancelTranscript,
	onOpenTranscript,
	onCopyTranscript,
}: ClipCardProps) {
	const [title, setTitle] = useState(clip.title);
	const [fileCopied, setFileCopied] = useState(false);
	const [textCopied, setTextCopied] = useState(false);

	useEffect(() => {
		setTitle(clip.title);
	}, [clip.title]);

	useEffect(() => {
		if (!fileCopied) return;
		const timer = window.setTimeout(() => setFileCopied(false), COPIED_FEEDBACK_MS);
		return () => window.clearTimeout(timer);
	}, [fileCopied]);

	useEffect(() => {
		if (!textCopied) return;
		const timer = window.setTimeout(() => setTextCopied(false), COPIED_FEEDBACK_MS);
		return () => window.clearTimeout(timer);
	}, [textCopied]);

	const share = clip.share;
	const uploading = share.status === "uploading";
	const transcript = clip.transcript;
	const transcribing = transcript.status === "working";
	const commitTitle = () => {
		if (title.trim() && title !== clip.title) onRename(title);
		else setTitle(clip.title);
	};

	return (
		<div
			className={`${styles.panel} ${styles.materialize} w-[400px] p-3`}
			data-testid="hud-clip-card"
		>
			<div className="flex gap-3">
				<Tooltip content="Drag into a chat or folder">
					<div
						className={styles.thumbnail}
						draggable
						onDragStart={(event) => {
							// The real drag is performed by the OS with the file itself.
							event.preventDefault();
							onStartDrag();
						}}
					>
						{clip.thumbnail ? (
							<img src={clip.thumbnail} alt="" />
						) : (
							<div className="flex h-full w-full items-center justify-center text-white/30">
								<Film size={22} aria-hidden="true" />
							</div>
						)}
						<span className={styles.durationBadge}>{formatClipDuration(clip.durationSeconds)}</span>
					</div>
				</Tooltip>

				<div className="flex min-w-0 flex-1 flex-col">
					<div className="flex items-start gap-1">
						<input
							type="text"
							value={title}
							aria-label="Clip name"
							spellCheck={false}
							// The uploader reads the file by path, and the transcript is saved under its
							// name: renaming mid-way would break either.
							disabled={uploading || transcribing}
							className={styles.titleInput}
							onChange={(event) => setTitle(event.target.value)}
							onBlur={commitTitle}
							onKeyDown={(event) => {
								if (event.key === "Enter") event.currentTarget.blur();
								if (event.key === "Escape") {
									setTitle(clip.title);
									event.stopPropagation();
									event.currentTarget.blur();
								}
							}}
						/>
						<button
							type="button"
							aria-label="Close"
							className={`${styles.button} ${styles.buttonGhost} ${styles.iconOnly} -mr-1 -mt-1 h-6 w-6 flex-none`}
							onClick={onDismiss}
						>
							<X size={14} aria-hidden="true" />
						</button>
					</div>
					<div className={`${styles.caption} mt-0.5 tabular-nums`}>
						{clip.width} × {clip.height} · {formatFileSize(clip.sizeBytes)}
					</div>
					<div className={`${styles.caption} mt-auto flex items-center gap-1 truncate`}>
						<Check size={12} className={styles.statusOk} aria-hidden="true" />
						<span className="truncate">Saved to {folderName(clip.path)}</span>
					</div>
				</div>
			</div>

			<div className="mt-3 flex items-center gap-1.5">
				{yandexConnected ? (
					<button
						type="button"
						data-testid="hud-clip-share"
						className={`${styles.button} ${styles.buttonPrimary} flex-1`}
						disabled={uploading}
						onClick={onShare}
					>
						{uploading ? (
							<Loader2 size={13} className={styles.spinner} aria-hidden="true" />
						) : share.status === "copied" ? (
							<Check size={13} aria-hidden="true" />
						) : (
							<Link2 size={13} aria-hidden="true" />
						)}
						{uploading
							? `Uploading ${Math.round(share.progress * 100)}%`
							: share.status === "copied"
								? "Link copied"
								: "Copy link"}
					</button>
				) : (
					<button type="button" className={`${styles.button} flex-1`} onClick={onConnectYandex}>
						<Link2 size={13} aria-hidden="true" />
						Set up link sharing
					</button>
				)}
				<button
					type="button"
					data-testid="hud-clip-copy-file"
					className={`${styles.button} ${yandexConnected ? "" : styles.buttonPrimary} flex-1`}
					onClick={() => {
						void onCopyFile().then((copied) => setFileCopied(copied));
					}}
				>
					{fileCopied ? (
						<Check size={13} aria-hidden="true" />
					) : (
						<Copy size={13} aria-hidden="true" />
					)}
					{fileCopied ? "Copied" : "Copy file"}
				</button>
				{onTranscribe && (
					<Tooltip
						content={
							transcribing
								? "Stop transcribing"
								: transcript.status === "done"
									? "Open the transcript"
									: "Transcribe to text and subtitles"
						}
					>
						<button
							type="button"
							data-testid="hud-clip-transcribe"
							aria-label={
								transcribing
									? "Stop transcribing"
									: transcript.status === "done"
										? "Open the transcript"
										: "Transcribe"
							}
							className={`${styles.button} ${styles.iconOnly}`}
							onClick={
								transcribing
									? onCancelTranscript
									: transcript.status === "done"
										? onOpenTranscript
										: onTranscribe
							}
						>
							{transcribing ? (
								<Loader2 size={14} className={styles.spinner} aria-hidden="true" />
							) : transcript.status === "done" ? (
								<FileText size={14} aria-hidden="true" />
							) : (
								<Captions size={14} aria-hidden="true" />
							)}
						</button>
					</Tooltip>
				)}
				<Tooltip content="Show in folder">
					<button
						type="button"
						aria-label="Show in folder"
						className={`${styles.button} ${styles.iconOnly}`}
						onClick={onReveal}
					>
						<FolderOpen size={14} aria-hidden="true" />
					</button>
				</Tooltip>
				<Tooltip content="Edit in Studio">
					<button
						type="button"
						aria-label="Edit in Studio"
						className={`${styles.button} ${styles.iconOnly}`}
						onClick={onOpenStudio}
					>
						<Clapperboard size={14} aria-hidden="true" />
					</button>
				</Tooltip>
				<Tooltip content="Move to trash">
					<button
						type="button"
						aria-label="Move to trash"
						className={`${styles.button} ${styles.buttonDanger} ${styles.iconOnly}`}
						disabled={uploading}
						onClick={onDelete}
					>
						<Trash2 size={14} aria-hidden="true" />
					</button>
				</Tooltip>
			</div>

			{uploading && (
				<div className={`${styles.progressTrack} mt-2.5`}>
					<div
						className={styles.progressFill}
						style={{ transform: `scaleX(${Math.max(0.02, share.progress)})` }}
					/>
				</div>
			)}
			{share.status === "copied" && (
				<div className={`${styles.caption} mt-2 flex items-center gap-1.5`}>
					<span className="truncate">{share.url}</span>
					<button type="button" className={styles.link} onClick={() => onOpenLink(share.url)}>
						Open
					</button>
				</div>
			)}
			{share.status === "error" && (
				<div className={`${styles.caption} ${styles.statusError} mt-2`} role="alert">
					{share.message}
				</div>
			)}
			{transcribing && (
				<div className="mt-2.5" data-testid="hud-clip-transcript-status">
					<div className={styles.progressTrack}>
						<div
							className={styles.progressFill}
							style={{ transform: `scaleX(${Math.max(0.02, transcript.progress ?? 0)})` }}
						/>
					</div>
					<div className={`${styles.caption} mt-1.5 tabular-nums`} aria-live="polite">
						{transcriptStatusText(transcript)}
					</div>
				</div>
			)}
			{transcript.status === "done" && (
				<div
					className={`${styles.caption} mt-2 flex items-center gap-1.5`}
					data-testid="hud-clip-transcript-status"
				>
					<Check size={12} className={styles.statusOk} aria-hidden="true" />
					<span className="truncate">Transcript and subtitles saved</span>
					<button
						type="button"
						className={`${styles.link} ml-auto`}
						onClick={() => {
							void onCopyTranscript().then((copied) => setTextCopied(copied));
						}}
					>
						{textCopied ? "Copied" : "Copy text"}
					</button>
					<button type="button" className={styles.link} onClick={onOpenTranscript}>
						Open
					</button>
				</div>
			)}
			{transcript.status === "error" && (
				<div
					className={`${styles.caption} ${styles.statusError} mt-2`}
					role="alert"
					data-testid="hud-clip-transcript-status"
				>
					{transcript.message}
				</div>
			)}
		</div>
	);
}
