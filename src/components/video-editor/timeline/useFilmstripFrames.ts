import { useEffect, useState } from "react";

/** Height the frames are kept at; the track is far shorter, so this stays sharp. */
const FRAME_HEIGHT = 72;

export interface FilmstripFrames {
	/** One frame per equal slice of the video; `null` until that slice has been read. */
	frames: Array<ImageBitmap | null>;
	/** Width / height of the frames, or 0 before the first one arrives. */
	aspect: number;
}

const EMPTY: FilmstripFrames = { frames: [], aspect: 0 };

/**
 * Reads `count` evenly spaced frames from the video for the clip track. It decodes
 * through its own muted `<video>`, so the preview is never seeked. Frames arrive one by
 * one; if the file cannot be read the track simply stays plain.
 */
export function useFilmstripFrames(
	videoUrl: string | undefined,
	durationMs: number,
	count = 14,
): FilmstripFrames {
	const [state, setState] = useState<FilmstripFrames>(EMPTY);
	// The duration settles in small steps while a file loads (a WebM reports it late);
	// only a real change is worth reading the frames again.
	const durationKey = Math.round(durationMs / 250) * 250;

	useEffect(() => {
		setState(EMPTY);
		const durationMs = durationKey;
		if (!videoUrl || !(durationMs > 0) || count <= 0) return;
		if (typeof createImageBitmap !== "function") return;

		let cancelled = false;
		const collected: Array<ImageBitmap | null> = new Array(count).fill(null);
		const video = document.createElement("video");
		video.muted = true;
		video.preload = "auto";
		video.playsInline = true;

		const waitFor = (event: "loadeddata" | "seeked") =>
			new Promise<void>((resolve, reject) => {
				const done = () => {
					video.removeEventListener(event, done);
					video.removeEventListener("error", failed);
					resolve();
				};
				const failed = () => {
					video.removeEventListener(event, done);
					video.removeEventListener("error", failed);
					reject(new Error("The video could not be read for the filmstrip."));
				};
				video.addEventListener(event, done);
				video.addEventListener("error", failed);
			});

		const releaseVideo = () => {
			video.removeAttribute("src");
			video.load();
		};

		const run = async () => {
			const loaded = waitFor("loadeddata");
			video.src = videoUrl;
			await loaded;
			if (cancelled || !video.videoWidth || !video.videoHeight) return;
			const aspect = video.videoWidth / video.videoHeight;
			const sliceSeconds = durationMs / 1000 / count;

			for (let index = 0; index < count; index += 1) {
				const seeked = waitFor("seeked");
				video.currentTime = (index + 0.5) * sliceSeconds;
				await seeked;
				if (cancelled) return;
				const frame = await createImageBitmap(video, {
					resizeHeight: FRAME_HEIGHT,
					resizeWidth: Math.max(1, Math.round(FRAME_HEIGHT * aspect)),
					resizeQuality: "low",
				});
				if (cancelled) {
					frame.close();
					return;
				}
				collected[index] = frame;
				setState({ frames: [...collected], aspect });
			}
		};

		run()
			.catch(() => {
				// A file the browser cannot seek just leaves the track without pictures.
			})
			// The decoder is only needed while the frames are being read.
			.finally(releaseVideo);

		return () => {
			cancelled = true;
			releaseVideo();
			for (const frame of collected) frame?.close();
		};
	}, [videoUrl, durationKey, count]);

	return state;
}
