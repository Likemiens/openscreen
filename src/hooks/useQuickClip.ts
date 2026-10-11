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

export interface ReadyClip extends FinishedQuickClip {
	title: string;
	thumbnail: string | null;
	share: ClipShareState;
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

	useEffect(() => {
		if (!draft?.quickClip || processingPath.current === draft.filePath) return;
		const sourcePath = draft.filePath;
		processingPath.current = sourcePath;

		setState({ status: "saving", progress: null });
		window.electronAPI.setHudBusy(true);

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

				// The clip now is the recording: drop the raw capture and point Studio at it.
				await window.electronAPI.setCurrentVideoPath(clip.path).catch(() => undefined);
				void window.electronAPI.discardRecordingSource(sourcePath);

				setState({
					status: "ready",
					clip: {
						...clip,
						title: fileTitle(clip.path),
						thumbnail: null,
						share: { status: "idle" },
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
				window.electronAPI.setHudBusy(false);
			}
		})();
	}, [draft]);

	// Keep the card's share state in step with the upload running in the main process.
	useEffect(() => {
		return window.electronAPI?.onYandexDiskUploadStatus?.((status) => {
			if (!status.filePath || !uploadingPaths.current.has(status.filePath)) return;
			const finished = status.state === "success" || status.state === "error";
			if (finished) {
				// Release the HUD even if the card this upload belonged to is gone.
				uploadingPaths.current.delete(status.filePath);
				if (uploadingPaths.current.size === 0) window.electronAPI.setHudBusy(false);
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
	}, []);

	const updateClip = useCallback((patch: Partial<ReadyClip>) => {
		setState((current) =>
			current.status === "ready"
				? { status: "ready", clip: { ...current.clip, ...patch } }
				: current,
		);
	}, []);

	const renameClip = useCallback(
		async (title: string) => {
			if (state.status !== "ready") return;
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
		window.electronAPI.setHudBusy(true);
		const result = await window.electronAPI.uploadRecordingToYandexDisk({
			filePath: state.clip.path,
			// With the extension, so a dot in the title is not mistaken for one.
			fileName: `${state.clip.title}.mp4`,
			// The clip lives in the user's own folder; sharing must never remove it.
			keepLocal: true,
		});
		if (!result.success) {
			uploadingPaths.current.delete(filePath);
			if (uploadingPaths.current.size === 0) window.electronAPI.setHudBusy(false);
			updateClip({ share: { status: "error", message: result.error ?? "Upload failed." } });
		}
	}, [state, updateClip]);

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
	};
}
