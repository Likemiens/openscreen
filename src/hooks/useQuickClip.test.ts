import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CompletedRecordingDraft } from "@/hooks/useScreenRecorder";
import type { YandexDiskUploadStatus } from "@/lib/yandexDisk";
import { useQuickClip } from "./useQuickClip";

const runner = vi.hoisted(() => ({ finalizeQuickClip: vi.fn() }));
vi.mock("@/lib/quickClipRunner", () => runner);

const toastMock = vi.hoisted(() => ({ error: vi.fn(), message: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));

const speech = vi.hoisted(() => ({ transcribeVideoFile: vi.fn() }));
vi.mock("@/lib/captioning/transcribeFile", () => speech);

const RAW = "C:\\data\\recordings\\recording-1.mp4";
const CLIP = "C:\\Users\\me\\Videos\\OpenScreen\\Recording 1.mp4";

const DRAFT: CompletedRecordingDraft = {
	filePath: RAW,
	title: "Recording 1",
	exportOptions: { quality: "good", frameRate: 60 },
	quickClip: true,
	region: null,
};

let uploadListeners: Array<(status: YandexDiskUploadStatus) => void> = [];

function emitUpload(status: Partial<YandexDiskUploadStatus>) {
	act(() => {
		for (const listener of uploadListeners) {
			listener({
				uploadId: "u1",
				state: "uploading",
				fileName: "Recording 1.mp4",
				remotePath: "disk:/OpenScreen Exports/Recording 1.mp4",
				publicUrl: "",
				filePath: CLIP,
				...status,
			});
		}
	});
}

function setup(draft: CompletedRecordingDraft | null = DRAFT) {
	const onConsumed = vi.fn();
	const onFallbackToDraft = vi.fn();
	const hook = renderHook(() => useQuickClip({ draft, onConsumed, onFallbackToDraft }));
	return { ...hook, onConsumed, onFallbackToDraft };
}

async function readyClip() {
	const view = setup();
	await waitFor(() => expect(view.result.current.state.status).toBe("ready"));
	return view;
}

describe("useQuickClip", () => {
	beforeEach(() => {
		uploadListeners = [];
		toastMock.error.mockClear();
		runner.finalizeQuickClip.mockReset();
		runner.finalizeQuickClip.mockResolvedValue({
			path: CLIP,
			sizeBytes: 1_000_000,
			width: 1280,
			height: 720,
			durationSeconds: 5,
			mode: "transcode",
		});
		window.electronAPI = {
			setHudBusy: vi.fn(),
			setCurrentVideoPath: vi.fn(async () => ({ success: true })),
			clearCurrentVideoPath: vi.fn(async () => ({ success: true })),
			discardRecordingSource: vi.fn(async () => ({ success: true })),
			getClipThumbnail: vi.fn(async () => ({ success: true, dataUrl: "data:image/png;base64,AA" })),
			uploadRecordingToYandexDisk: vi.fn(async () => ({ success: true, queued: true })),
			renameClip: vi.fn(async (_path: string, title: string) => ({
				success: true,
				path: `C:\\Users\\me\\Videos\\OpenScreen\\${title}.mp4`,
			})),
			trashClip: vi.fn(async () => ({ success: true })),
			saveClipTranscript: vi.fn(async () => ({ success: true })),
			openClipTranscript: vi.fn(async () => ({ success: true })),
			copyClipTranscript: vi.fn(async () => ({ success: true })),
			onYandexDiskUploadStatus: vi.fn((listener) => {
				uploadListeners.push(listener);
				return () => {
					uploadListeners = uploadListeners.filter((item) => item !== listener);
				};
			}),
		} as unknown as Window["electronAPI"];
	});

	it("saves a quick clip, then drops the raw capture and hands the clip to Studio", async () => {
		const { result, onConsumed, onFallbackToDraft } = await readyClip();

		expect(runner.finalizeQuickClip).toHaveBeenCalledWith(
			expect.objectContaining({
				sourcePath: RAW,
				title: "Recording 1",
				quality: "good",
				frameRate: 60,
				region: null,
			}),
		);
		expect(result.current.state).toMatchObject({
			status: "ready",
			clip: { path: CLIP, title: "Recording 1", share: { status: "idle" } },
		});
		expect(window.electronAPI.discardRecordingSource).toHaveBeenCalledWith(RAW, CLIP);
		expect(window.electronAPI.setCurrentVideoPath).toHaveBeenCalledWith(CLIP);
		expect(onConsumed).toHaveBeenCalledTimes(1);
		expect(onFallbackToDraft).not.toHaveBeenCalled();
		// Busy while saving, released afterwards so the idle HUD can be freed.
		expect(window.electronAPI.setHudBusy).toHaveBeenNthCalledWith(1, true);
		expect(window.electronAPI.setHudBusy).toHaveBeenLastCalledWith(false);

		await waitFor(() => {
			expect(result.current.state).toMatchObject({ clip: { thumbnail: expect.any(String) } });
		});
	});

	it("keeps the raw recording and falls back to the export step when saving fails", async () => {
		runner.finalizeQuickClip.mockRejectedValue(new Error("no encoder"));
		const { result, onConsumed, onFallbackToDraft } = setup();

		await waitFor(() => expect(onFallbackToDraft).toHaveBeenCalledTimes(1));

		expect(result.current.state.status).toBe("idle");
		expect(onConsumed).not.toHaveBeenCalled();
		expect(window.electronAPI.discardRecordingSource).not.toHaveBeenCalled();
		expect(toastMock.error).toHaveBeenCalled();
		expect(window.electronAPI.setHudBusy).toHaveBeenLastCalledWith(false);
	});

	it("leaves recordings that need Studio alone", () => {
		const { result } = setup({ ...DRAFT, quickClip: false });

		expect(result.current.state.status).toBe("idle");
		expect(runner.finalizeQuickClip).not.toHaveBeenCalled();
	});

	it("shares the saved file itself and never asks for it to be deleted", async () => {
		const { result } = await readyClip();

		await act(() => result.current.shareClip());

		expect(window.electronAPI.uploadRecordingToYandexDisk).toHaveBeenCalledWith({
			filePath: CLIP,
			fileName: "Recording 1.mp4",
			keepLocal: true,
		});

		emitUpload({ state: "uploading", progress: 0.5 });
		expect(result.current.state).toMatchObject({
			clip: { share: { status: "uploading", progress: 0.5 } },
		});

		emitUpload({ state: "success", publicUrl: "https://disk.yandex.ru/i/abc" });
		expect(result.current.state).toMatchObject({
			clip: { share: { status: "copied", url: "https://disk.yandex.ru/i/abc" } },
		});
		expect(window.electronAPI.setHudBusy).toHaveBeenLastCalledWith(false);
	});

	it("reports a rejected upload on the card", async () => {
		window.electronAPI.uploadRecordingToYandexDisk = vi.fn(async () => ({
			success: false,
			error: "Yandex Disk is not connected.",
		}));
		const { result } = await readyClip();

		await act(() => result.current.shareClip());

		expect(result.current.state).toMatchObject({
			clip: { share: { status: "error", message: "Yandex Disk is not connected." } },
		});
		expect(window.electronAPI.setHudBusy).toHaveBeenLastCalledWith(false);
	});

	it("releases the HUD when an upload finishes after its card was dismissed", async () => {
		const { result } = await readyClip();
		await act(() => result.current.shareClip());
		expect(window.electronAPI.setHudBusy).toHaveBeenLastCalledWith(true);

		act(() => result.current.dismissClip());
		expect(result.current.state.status).toBe("idle");

		emitUpload({ state: "success", publicUrl: "https://disk.yandex.ru/i/abc" });

		expect(window.electronAPI.setHudBusy).toHaveBeenLastCalledWith(false);
	});

	it("renames the file and follows it", async () => {
		const { result } = await readyClip();

		await act(() => result.current.renameClip("Pricing bug"));

		expect(window.electronAPI.renameClip).toHaveBeenCalledWith(CLIP, "Pricing bug");
		expect(result.current.state).toMatchObject({
			clip: { title: "Pricing bug", path: "C:\\Users\\me\\Videos\\OpenScreen\\Pricing bug.mp4" },
		});
	});

	it("removes the card once the clip is in the trash", async () => {
		const { result } = await readyClip();

		await act(() => result.current.deleteClip());

		expect(window.electronAPI.trashClip).toHaveBeenCalledWith(CLIP);
		expect(result.current.state.status).toBe("idle");
	});

	describe("transcription", () => {
		beforeEach(() => {
			speech.transcribeVideoFile.mockReset();
			toastMock.success.mockClear();
		});

		it("saves the text and subtitles next to the clip and holds the HUD meanwhile", async () => {
			let finish: (segments: unknown[]) => void = () => undefined;
			speech.transcribeVideoFile.mockImplementation(
				(_path: string, options: { onProgress?: (p: unknown) => void }) => {
					options.onProgress?.({ phase: "transcribe", fraction: 0.5, kind: "gpu" });
					return new Promise((resolve) => {
						finish = resolve;
					});
				},
			);
			const { result } = await readyClip();
			vi.mocked(window.electronAPI.setHudBusy).mockClear();

			act(() => {
				void result.current.transcribeClip();
			});
			await waitFor(() =>
				expect(result.current.state).toMatchObject({
					clip: { transcript: { status: "working", progress: 0.5, device: "gpu" } },
				}),
			);
			expect(speech.transcribeVideoFile).toHaveBeenCalledWith(CLIP, expect.anything());
			expect(window.electronAPI.setHudBusy).toHaveBeenLastCalledWith(true);

			await act(async () => {
				finish([
					{ startSec: 0, endSec: 2, text: "Коллеги, добрый день." },
					{ startSec: 2.2, endSec: 4, text: "Начнём." },
				]);
			});

			await waitFor(() =>
				expect(result.current.state).toMatchObject({ clip: { transcript: { status: "done" } } }),
			);
			expect(window.electronAPI.saveClipTranscript).toHaveBeenCalledWith(
				CLIP,
				"[00:00] Коллеги, добрый день. Начнём.",
				expect.stringContaining("00:00:00,000 --> 00:00:02,000"),
			);
			expect(window.electronAPI.setHudBusy).toHaveBeenLastCalledWith(false);
			// The card still shows this clip, so no toast is needed.
			expect(toastMock.success).not.toHaveBeenCalled();
		});

		it("keeps the HUD held when an upload ends during a transcription", async () => {
			speech.transcribeVideoFile.mockImplementation(() => new Promise(() => undefined));
			const { result } = await readyClip();

			await act(async () => {
				await result.current.shareClip();
			});
			act(() => {
				void result.current.transcribeClip();
			});
			emitUpload({ state: "success", publicUrl: "https://yadi.sk/d/x" });

			expect(window.electronAPI.setHudBusy).toHaveBeenLastCalledWith(true);
		});

		it("goes back to the start when stopped, and reports a recording without speech", async () => {
			speech.transcribeVideoFile.mockImplementation(
				(_path: string, options: { signal: AbortSignal }) =>
					new Promise((_resolve, reject) => {
						options.signal.addEventListener("abort", () =>
							reject(new DOMException("Aborted", "AbortError")),
						);
					}),
			);
			const { result } = await readyClip();

			act(() => {
				void result.current.transcribeClip();
			});
			await waitFor(() =>
				expect(result.current.state).toMatchObject({ clip: { transcript: { status: "working" } } }),
			);
			act(() => result.current.cancelTranscript());
			await waitFor(() =>
				expect(result.current.state).toMatchObject({ clip: { transcript: { status: "idle" } } }),
			);

			speech.transcribeVideoFile.mockResolvedValue([]);
			await act(async () => {
				await result.current.transcribeClip();
			});
			expect(result.current.state).toMatchObject({
				clip: {
					transcript: { status: "error", message: "No speech was heard in this recording." },
				},
			});
			expect(window.electronAPI.saveClipTranscript).not.toHaveBeenCalled();
		});

		it("does not rename a clip while its transcript is being made", async () => {
			speech.transcribeVideoFile.mockImplementation(() => new Promise(() => undefined));
			const { result } = await readyClip();

			act(() => {
				void result.current.transcribeClip();
			});
			await act(async () => {
				await result.current.renameClip("Weekly sync");
			});

			expect(window.electronAPI.renameClip).not.toHaveBeenCalled();
		});
	});
});
