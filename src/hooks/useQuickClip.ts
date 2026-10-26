import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { CompletedRecordingDraft } from "@/hooks/useScreenRecorder";
import type { FinishedQuickClip } from "@/lib/quickClipRunner";
import { sanitizeRecordingTitle } from "@/lib/recordingDraft";

export type ClipShareState =
	| { status: "idle" }
	| { status: "uploading"; progress: number }
	| { status: "copied"; url: string }
	| { status: "error"; message: string };

export type ClipTranscriptState =
	| { status: "idle" }
	/** `progress` is `null` until the first measurable step. */
	| {
			status: "working";
			phase: "model" | "transcribe";
			progress: number | null;
			/** Where it runs: the GPU model, or the smaller one on the processor. */
			device?: "gpu" | "cpu";
	  }
	/** `<clip>.txt` and `<clip>.srt` are saved next to the clip. */
	| { status: "done" }
	| { status: "error"; message: string };

export interface ReadyClip extends FinishedQuickClip {
	title: string;
	thumbnail: string | null;
	share: ClipShareState;
	transcript: ClipTranscriptState;
}

export type QuickClipState =
	| { status: "idle" }
	/** `progress` is `null` until the first measurable step. */
	| { status: "saving"; progress: number | null }
	| { status: "ready"; clip: ReadyClip };

interface UseQuickClipOptions {
	draft: CompletedRecordingDraft | null;
	/** The draft was turned into a clip and is no longer needed. */
	onConsumed: () => void;
	/** Saving as a clip failed; hand the draft to the Studio flow instead. */
	onFallbackToDraft: () => void;
}

const NO_SPEECH_MESSAGE = "No speech was heard in this recording.";

/** What went wrong, in words someone can act on. */
function describeTranscriptError(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	if (/fetch|network|offline|502|ERR_/i.test(message)) {
		return "Couldn't download the speech model. Check the connection and try again.";
	}
	return message || "Transcription failed.";
}

function fileTitle(filePath: string): string {
	const name = filePath.split(/[\\/]/).pop() ?? filePath;
	return name.replace(/\.[^.]+$/, "");
}

/**
 * Finishes quick-clip recordings: saves the MP4 the moment recording stops and then
 * owns the resulting clip (rename, copy, share, delete) until it is dismissed.
 */
export function useQuickClip({ draft, onConsumed, onFallbackToDraft }: UseQuickClipOptions) {
	const [state, setState] = useState<QuickClipState>({ status: "idle" });
	const processingPath = useRef<string | null>(null);
	// Files with an upload in flight. Tracked separately from the card: the card can be
	// dismissed, or replaced by the next clip, while an upload keeps running in the
	// main process.
	const uploadingPaths = useRef(new Set<string>());
	const callbacks = useRef({ onConsumed, onFallbackToDraft });
	callbacks.current = { onConsumed, onFallbackToDraft };
	// Transcriptions in flight, by clip path; each can be stopped.
	const transcriptions = useRef(new Map<string, AbortController>());
	const latestState = useRef(state);
	latestState.current = state;

	// Saving, uploads and transcriptions each keep the hidden HUD alive; it may be
	// released only once none of them is running.
	const busyReasons = useRef(new Set<string>());
	const holdHud = useCallback((reason: string, busy: boolean) => {
		if (busy) busyReasons.current.add(reason);
		else busyReasons.current.delete(reason);
		window.electronAPI.setHudBusy(busyReasons.current.size > 0);
	}, []);

	useEffect(() => {
		if (!draft?.quickClip || processingPath.current === draft.filePath) return;
		const sourcePath = draft.filePath;
		processingPath.current = sourcePath;

		setState({ status: "saving", progress: null });
		holdHud("saving", true);

		void (async () => {
			try {
				// The encoder stack is only needed here, so it stays out of the HUD's startup.
				const { finalizeQuickClip } = await import("@/lib/quickClipRunner");
				const clip = await finalizeQuickClip({
					sourcePath,
					title: draft.title,
					quality: draft.exportOptions.quality,
					frameRate: draft.exportOptions.frameRate,
					region: draft.region,
					onProgress: (progress) => setState({ status: "saving", progress }),
				});

				// The clip now is the recording: point Studio at it and drop what is left of the
				// raw capture. The main process refuses unless the clip really is on disk.
				await window.electronAPI.setCurrentVideoPath(clip.path).catch(() => undefined);
				void window.electronAPI.discardRecordingSource(sourcePath, clip.path);

				setState({
					status: "ready",
					clip: {
						...clip,
						title: fileTitle(clip.path),
						thumbnail: null,
						share: { status: "idle" },
						transcript: { status: "idle" },
					},
				});
				callbacks.current.onConsumed();

				const thumbnail = await window.electronAPI.getClipThumbnail(clip.path);
				if (thumbnail.success && thumbnail.dataUrl) {
					setState((current) =>
						current.status === "ready" && current.clip.path === clip.path
							? { status: "ready", clip: { ...current.clip, thumbnail: thumbnail.dataUrl ?? null } }
							: current,
					);
				}
			} catch (error) {
				console.error("Failed to save the quick clip:", error);
				toast.error("Could not save the clip automatically", {
					description: "The recording is safe. Choose how to export it below.",
				});
				setState({ status: "idle" });
				callbacks.current.onFallbackToDraft();
			} finally {
				holdHud("saving", false);
			}
		})();
	}, [draft, holdHud]);

	// Keep the card's share state in step with the upload running in the main process.
	useEffect(() => {
		return window.electronAPI?.onYandexDiskUploadStatus?.((status) => {
			if (!status.filePath || !uploadingPaths.current.has(status.filePath)) return;
			const finished = status.state === "success" || status.state === "error";
			if (finished) {
				// Release the HUD even if the card this upload belonged to is gone.
				uploadingPaths.current.delete(status.filePath);
				holdHud(`upload:${status.filePath}`, false);
			}
			setState((current) => {
				if (current.status !== "ready" || current.clip.path !== status.filePath) return current;
				let share: ClipShareState = current.clip.share;
				if (status.state === "uploading") {
					share = { status: "uploading", progress: status.progress ?? 0 };
				} else if (status.state === "success") {
					share = { status: "copied", url: status.publicUrl };
				} else if (status.state === "error") {
					share = { status: "error", message: status.error ?? "Upload failed." };
				} else {
					return current;
				}
				return { status: "ready", clip: { ...current.clip, share } };
			});
		});
	}, [holdHud]);

	const updateClip = useCallback((patch: Partial<ReadyClip>) => {
		setState((current) =>
			current.status === "ready"
				? { status: "ready", clip: { ...current.clip, ...patch } }
				: current,
		);
	}, []);

	const renameClip = useCallback(
		async (title: string) => {
			// The transcript is written next to the clip under its name when it is done.
			if (state.status !== "ready" || transcriptions.current.has(state.clip.path)) return;
			const nextTitle = sanitizeRecordingTitle(title, state.clip.title);
			if (nextTitle === state.clip.title) {
				updateClip({ title: nextTitle });
				return;
			}
			const result = await window.electronAPI.renameClip(state.clip.path, nextTitle);
			if (!result.success || !result.path) {
				toast.error(result.error ?? "Could not rename the clip.");
				return;
			}
			updateClip({ path: result.path, title: fileTitle(result.path) });
			void window.electronAPI.setCurrentVideoPath(result.path).catch(() => undefined);
		},
		[state, updateClip],
	);

	const shareClip = useCallback(async () => {
		if (state.status !== "ready" || uploadingPaths.current.has(state.clip.path)) return;
		const filePath = state.clip.path;
		uploadingPaths.current.add(filePath);
		updateClip({ share: { status: "uploading", progress: 0 } });
		holdHud(`upload:${filePath}`, true);
		const result = await window.electronAPI.uploadRecordingToYandexDisk({
			filePath: state.clip.path,
			// With the extension, so a dot in the title is not mistaken for one.
			fileName: `${state.clip.title}.mp4`,
			// The clip lives in the user's own folder; sharing must never remove it.
			keepLocal: true,
		});
		if (!result.success) {
			uploadingPaths.current.delete(filePath);
			holdHud(`upload:${filePath}`, false);
			updateClip({ share: { status: "error", message: result.error ?? "Upload failed." } });
		}
	}, [state, updateClip, holdHud]);

	const setTranscript = useCallback((filePath: string, transcript: ClipTranscriptState) => {
		setState((current) =>
			current.status === "ready" && current.clip.path === filePath
				? { status: "ready", clip: { ...current.clip, transcript } }
				: current,
		);
	}, []);

	/**
	 * Transcribes the clip with the local speech model (downloaded once on first use)
	 * and saves `<clip>.txt` and `<clip>.srt` next to it. Keeps running if the card is
	 * closed, and says so when it is done.
	 */
	const transcribeClip = useCallback(async () => {
		if (state.status !== "ready" || transcriptions.current.has(state.clip.path)) return;
		const filePath = state.clip.path;
		const controller = new AbortController();
		transcriptions.current.set(filePath, controller);
		holdHud(`transcribe:${filePath}`, true);
		setTranscript(filePath, { status: "working", phase: "model", progress: null });
		try {
			const [{ transcribeVideoFile }, { formatSrt, formatTranscriptText }] = await Promise.all([
				import("@/lib/captioning/transcribeFile"),
				import("@/lib/captioning/transcript"),
			]);
			const segments = await transcribeVideoFile(filePath, {
				signal: controller.signal,
				onProgress: (progress) =>
					setTranscript(filePath, {
						status: "working",
						phase: progress.phase,
						progress: progress.fraction,
						device: progress.kind,
					}),
			});
			if (segments.length === 0) {
				setTranscript(filePath, { status: "error", message: NO_SPEECH_MESSAGE });
				return;
			}
			const saved = await window.electronAPI.saveClipTranscript(
				filePath,
				formatTranscriptText(segments),
				formatSrt(segments),
			);
			if (!saved.success) throw new Error(saved.error ?? "Could not save the transcript.");
			setTranscript(filePath, { status: "done" });
			const current = latestState.current;
			if (current.status !== "ready" || current.clip.path !== filePath) {
				toast.success("Transcript saved next to the clip", {
					action: {
						label: "Open",
						onClick: () => void window.electronAPI.openClipTranscript(filePath),
					},
				});
			}
		} catch (error) {
			if (controller.signal.aborted) {
				setTranscript(filePath, { status: "idle" });
				return;
			}
			console.error("Transcription failed:", error);
			setTranscript(filePath, { status: "error", message: describeTranscriptError(error) });
		} finally {
			transcriptions.current.delete(filePath);
			holdHud(`transcribe:${filePath}`, false);
		}
	}, [state, holdHud, setTranscript]);

	const cancelTranscript = useCallback(() => {
		if (state.status === "ready") transcriptions.current.get(state.clip.path)?.abort();
	}, [state]);

	const openTranscript = useCallback(async () => {
		if (state.status !== "ready") return;
		const result = await window.electronAPI.openClipTranscript(state.clip.path);
		if (!result.success) toast.error(result.error ?? "Could not open the transcript.");
	}, [state]);

	const copyTranscript = useCallback(async () => {
		if (state.status !== "ready") return false;
		const result = await window.electronAPI.copyClipTranscript(state.clip.path);
		if (!result.success) toast.error(result.error ?? "Could not copy the transcript.");
		return result.success;
	}, [state]);

	const copyClipFile = useCallback(async () => {
		if (state.status !== "ready") return false;
		const result = await window.electronAPI.copyClipFile(state.clip.path);
		if (!result.success) {
			toast.error(result.error ?? "Could not copy the clip.");
			return false;
		}
		if (result.copied === "path") toast.message("Copied the file path");
		return true;
	}, [state]);

	const revealClip = useCallback(() => {
		if (state.status === "ready") void window.electronAPI.revealInFolder(state.clip.path);
	}, [state]);

	const startClipDrag = useCallback(() => {
		if (state.status === "ready") window.electronAPI.startClipDrag(state.clip.path);
	}, [state]);

	const dismissClip = useCallback(() => {
		setState((current) => (current.status === "ready" ? { status: "idle" } : current));
	}, []);

	const deleteClip = useCallback(async () => {
		if (state.status !== "ready") return;
		transcriptions.current.get(state.clip.path)?.abort();
		const result = await window.electronAPI.trashClip(state.clip.path);
		if (!result.success) {
			toast.error(result.error ?? "Could not delete the clip.");
			return;
		}
		void window.electronAPI.clearCurrentVideoPath().catch(() => undefined);
		setState({ status: "idle" });
	}, [state]);

	const openClipInStudio = useCallback(async () => {
		if (state.status !== "ready") return;
		const selected = await window.electronAPI.setCurrentVideoPath(state.clip.path);
		if (!selected.success) {
			toast.error("Could not open the clip in Studio.");
			return;
		}
		setState({ status: "idle" });
		await window.electronAPI.switchToEditor({ title: state.clip.title });
	}, [state]);

	return {
		state,
		renameClip,
		shareClip,
		copyClipFile,
		revealClip,
		startClipDrag,
		dismissClip,
		deleteClip,
		openClipInStudio,
		transcribeClip,
		cancelTranscript,
		openTranscript,
		copyTranscript,
	};
}
