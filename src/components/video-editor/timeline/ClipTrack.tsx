import { useTimelineContext } from "dnd-timeline";
import { Scissors } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { type ClipPiece, isSameClipPiece } from "./clipPieces";
import type { CutMark } from "./cutTime";
import type { FilmstripFrames } from "./useFilmstripFrames";

/** Space above and below the clip inside its row. */
const INSET_Y = 4;

interface ClipTrackProps {
	pieces: readonly ClipPiece[];
	videoDurationMs: number;
	selectedPiece: Pick<ClipPiece, "start" | "end"> | null;
	filmstrip: FilmstripFrames;
	/**
	 * With removed parts closed up, the timeline is shorter than the recording: its frames
	 * are drawn piece by piece from where each piece is in the recording.
	 */
	sourceDurationMs?: number;
	toSourceMs?: (cutMs: number, side?: "start" | "end") => number;
	cutMarks?: readonly CutMark[];
	onRestoreCut?: (mark: CutMark) => void;
}

/**
 * The video drawn as one bar across the timeline: a filmstrip of its frames, divided
 * into the pieces it has been split into. It is the row's background and takes no
 * pointer events itself, so scrubbing, selecting and the removed blocks (which are
 * ordinary draggable items above it) all keep working the way the other rows do.
 */
export default function ClipTrack({
	pieces,
	videoDurationMs,
	selectedPiece,
	filmstrip,
	sourceDurationMs = videoDurationMs,
	toSourceMs,
	cutMarks = [],
	onRestoreCut,
}: ClipTrackProps) {
	const { range } = useTimelineContext();
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [size, setSize] = useState({ width: 0, height: 0 });
	const visibleMs = range.end - range.start;

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas || typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver((entries) => {
			const { width, height } = entries[0].contentRect;
			setSize({ width, height });
		});
		observer.observe(canvas);
		return () => observer.disconnect();
	}, []);

	// Each frame stands for an equal slice of the video and is repeated across the width
	// that slice takes on screen, so the strip stays in place while zooming and panning.
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas || size.width <= 0 || size.height <= 0) return;
		const ratio = window.devicePixelRatio || 1;
		canvas.width = Math.round(size.width * ratio);
		canvas.height = Math.round(size.height * ratio);
		const context = canvas.getContext("2d");
		if (!context) return;
		context.scale(ratio, ratio);
		context.clearRect(0, 0, size.width, size.height);

		const { frames, aspect } = filmstrip;
		if (frames.length === 0 || aspect <= 0 || visibleMs <= 0 || sourceDurationMs <= 0) return;

		const top = INSET_Y;
		const frameHeight = size.height - INSET_Y * 2;
		const frameWidth = frameHeight * aspect;
		if (frameHeight <= 0 || frameWidth <= 0) return;
		const sliceMs = sourceDurationMs / frames.length;
		const toX = (timeMs: number) => ((timeMs - range.start) / visibleMs) * size.width;

		// Each stretch of the timeline shows the frames of the recording it plays: the whole
		// video, or with removed parts closed up, each piece from where it is in the recording
		// (`offset` is how far its recording time is ahead of its timeline time).
		const stretches = toSourceMs
			? pieces
					.filter((piece) => !piece.trimId)
					.map((piece) => ({
						start: piece.start,
						end: piece.end,
						offset: toSourceMs(piece.start, "start") - piece.start,
					}))
			: [{ start: 0, end: videoDurationMs, offset: 0 }];

		for (const stretch of stretches) {
			const stretchLeft = Math.max(0, toX(stretch.start));
			const stretchRight = Math.min(size.width, toX(stretch.end));
			if (stretchRight <= stretchLeft) continue;
			const firstFrame = Math.max(0, Math.floor((stretch.start + stretch.offset) / sliceMs));
			const lastFrame = Math.min(
				frames.length - 1,
				Math.floor((stretch.end + stretch.offset) / sliceMs),
			);
			for (let index = firstFrame; index <= lastFrame; index += 1) {
				const frame = frames[index];
				if (!frame) continue;
				const sliceStart = toX(index * sliceMs - stretch.offset);
				const left = Math.max(stretchLeft, sliceStart);
				const right = Math.min(stretchRight, toX((index + 1) * sliceMs - stretch.offset));
				if (right <= left) continue;
				context.save();
				context.beginPath();
				context.rect(left, top, right - left, frameHeight);
				context.clip();
				// Tiles are laid from the slice's own start, so they do not slide when panning.
				const firstTile = Math.floor((left - sliceStart) / frameWidth);
				try {
					for (let x = sliceStart + firstTile * frameWidth; x < right; x += frameWidth) {
						context.drawImage(frame, x, top, frameWidth, frameHeight);
					}
				} catch {
					// A frame released while the video was being swapped: leave its slice plain.
				}
				context.restore();
			}
		}

		// Toned down so the labels and the playhead stay readable on top of the picture.
		context.fillStyle = "rgba(20, 20, 22, 0.38)";
		context.fillRect(0, top, size.width, frameHeight);
	}, [
		filmstrip,
		range.start,
		visibleMs,
		size,
		videoDurationMs,
		sourceDurationMs,
		toSourceMs,
		pieces,
	]);

	const hasPictures = filmstrip.frames.some(Boolean);

	return (
		<div className="pointer-events-none absolute inset-0" data-testid="clip-track">
			<canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
			{visibleMs > 0 &&
				pieces.map((piece) => {
					if (piece.trimId || piece.end <= range.start || piece.start >= range.end) return null;
					const selected = isSameClipPiece(piece, selectedPiece);
					return (
						<div
							key={`${piece.start}-${piece.end}`}
							data-testid="clip-piece"
							data-selected={selected ? "true" : undefined}
							className={cn(
								"absolute rounded-[7px] border transition-[border-color,background-color] duration-150",
								// The ring is the row's own colour: it is the gap between two pieces
								// and trims the filmstrip to the piece's rounded corners.
								"shadow-[0_0_0_2px_#1e1e20]",
								selected
									? "z-[2] border-2 border-[#0A84FF] bg-[#0A84FF]/[0.16]"
									: cn("border-white/[0.16]", hasPictures ? "bg-transparent" : "bg-white/[0.07]"),
							)}
							style={{
								top: INSET_Y,
								bottom: INSET_Y,
								left: `calc(${((piece.start - range.start) / visibleMs) * 100}% + 1px)`,
								width: `calc(${((piece.end - piece.start) / visibleMs) * 100}% - 2px)`,
							}}
						/>
					);
				})}
			{visibleMs > 0 &&
				onRestoreCut &&
				cutMarks.map((mark) => {
					if (mark.atMs < range.start || mark.atMs > range.end) return null;
					const left = `${((mark.atMs - range.start) / visibleMs) * 100}%`;
					return (
						<div key={mark.id}>
							<span
								className="absolute top-0 bottom-0 z-[3] w-[2px] -translate-x-1/2 rounded-full bg-[#FF9F0A]/75"
								style={{ left }}
							/>
							{/* Beside the line, not on it: right after a cut the playhead sits on the line. */}
							<button
								type="button"
								data-testid="clip-cut-mark"
								title="A part was removed here. Click to put it back."
								aria-label="Put the removed part back"
								className="pointer-events-auto absolute top-1 z-[5] ml-[3px] flex h-4 w-4 items-center justify-center rounded-full bg-[#FF9F0A] text-black shadow-[0_1px_3px_rgba(0,0,0,0.5)] transition-transform hover:scale-110"
								style={{ left }}
								// The press is the mark's own: no seeking or picking a piece under it.
								onPointerDown={(event) => event.stopPropagation()}
								onClick={(event) => {
									event.stopPropagation();
									onRestoreCut(mark);
								}}
							>
								<Scissors size={9} strokeWidth={2.4} aria-hidden="true" />
							</button>
						</div>
					);
				})}
		</div>
	);
}
