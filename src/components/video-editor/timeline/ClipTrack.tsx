import { useTimelineContext } from "dnd-timeline";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { type ClipPiece, isSameClipPiece } from "./clipPieces";
import type { FilmstripFrames } from "./useFilmstripFrames";

/** Space above and below the clip inside its row. */
const INSET_Y = 4;

interface ClipTrackProps {
	pieces: readonly ClipPiece[];
	videoDurationMs: number;
	selectedPiece: Pick<ClipPiece, "start" | "end"> | null;
	filmstrip: FilmstripFrames;
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
		if (frames.length === 0 || aspect <= 0 || visibleMs <= 0 || videoDurationMs <= 0) return;

		const top = INSET_Y;
		const frameHeight = size.height - INSET_Y * 2;
		const frameWidth = frameHeight * aspect;
		if (frameHeight <= 0 || frameWidth <= 0) return;
		const sliceMs = videoDurationMs / frames.length;
		const toX = (timeMs: number) => ((timeMs - range.start) / visibleMs) * size.width;

		frames.forEach((frame, index) => {
			if (!frame) return;
			const left = Math.max(0, toX(index * sliceMs));
			const right = Math.min(size.width, toX((index + 1) * sliceMs));
			if (right <= left) return;
			context.save();
			context.beginPath();
			context.rect(left, top, right - left, frameHeight);
			context.clip();
			// Tiles are laid from the slice's own start, so they do not slide when panning.
			const sliceStart = toX(index * sliceMs);
			const firstTile = Math.floor((left - sliceStart) / frameWidth);
			try {
				for (let x = sliceStart + firstTile * frameWidth; x < right; x += frameWidth) {
					context.drawImage(frame, x, top, frameWidth, frameHeight);
				}
			} catch {
				// A frame released while the video was being swapped: leave its slice plain.
			}
			context.restore();
		});

		// Toned down so the labels and the playhead stay readable on top of the picture.
		context.fillStyle = "rgba(20, 20, 22, 0.38)";
		context.fillRect(0, top, size.width, frameHeight);
	}, [filmstrip, range.start, visibleMs, size, videoDurationMs]);

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
		</div>
	);
}
