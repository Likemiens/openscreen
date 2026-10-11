import { useCallback, useEffect, useRef, useState } from "react";
import {
	applyAspectRatio,
	formatRegionSize,
	MIN_REGION_SIZE,
	moveRect,
	REGION_ASPECT_PRESETS,
	REGION_RESIZE_HANDLES,
	REGION_SIZE_PRESETS,
	type RegionRect,
	type RegionResizeHandle,
	rectFromDrag,
	resizeRect,
	resizeRectToPixelSize,
} from "@/lib/captureRegion";
import type { RegionSelectorContext } from "@/lib/quickCaptureContracts";
import hud from "./hud.module.css";
import styles from "./RegionSelector.module.css";

type Interaction =
	| { type: "create"; anchor: { x: number; y: number } }
	| { type: "move"; last: { x: number; y: number } }
	| { type: "resize"; handle: RegionResizeHandle };

const TOOLBAR_HEIGHT = 50;
const TOOLBAR_GAP = 12;
// Half of the toolbar's rendered width, used to keep it fully on the display.
const TOOLBAR_HALF_WIDTH = 260;
const NUDGE_STEP = 1;
const NUDGE_STEP_LARGE = 10;

const HANDLE_POSITION: Record<RegionResizeHandle, { left: string; top: string; cursor: string }> = {
	nw: { left: "0%", top: "0%", cursor: "nwse-resize" },
	n: { left: "50%", top: "0%", cursor: "ns-resize" },
	ne: { left: "100%", top: "0%", cursor: "nesw-resize" },
	e: { left: "100%", top: "50%", cursor: "ew-resize" },
	se: { left: "100%", top: "100%", cursor: "nwse-resize" },
	s: { left: "50%", top: "100%", cursor: "ns-resize" },
	sw: { left: "0%", top: "100%", cursor: "nesw-resize" },
	w: { left: "0%", top: "50%", cursor: "ew-resize" },
};

function isUsable(rect: RegionRect | null): rect is RegionRect {
	return Boolean(rect && rect.width >= MIN_REGION_SIZE && rect.height >= MIN_REGION_SIZE);
}

/**
 * Full-display overlay for choosing the area to record. Drag to draw, then move or
 * resize; Enter records, Esc cancels. The last area is offered again, so repeating a
 * capture is hotkey → Enter.
 */
export function RegionSelector() {
	const [context, setContext] = useState<RegionSelectorContext | null>(null);
	const [rect, setRect] = useState<RegionRect | null>(null);
	const [aspectId, setAspectId] = useState("free");
	const [interacting, setInteracting] = useState(false);
	const interactionRef = useRef<Interaction | null>(null);
	const overlayRef = useRef<HTMLDivElement | null>(null);
	const rectRef = useRef<RegionRect | null>(null);
	rectRef.current = rect;

	const ratio = REGION_ASPECT_PRESETS.find((preset) => preset.id === aspectId)?.ratio ?? null;
	const ratioRef = useRef(ratio);
	ratioRef.current = ratio;

	useEffect(() => {
		let cancelled = false;
		const load = async () => {
			const loaded = (await window.electronAPI?.getRegionSelectorContext?.()) ?? {
				// Plain-browser design preview.
				display: {
					id: 0,
					width: window.innerWidth,
					height: window.innerHeight,
					scaleFactor: window.devicePixelRatio || 1,
				},
				initialRegion: null,
			};
			if (cancelled) return;
			setContext(loaded);
			if (loaded.initialRegion) {
				const { x, y, width, height } = loaded.initialRegion;
				setRect({ x, y, width, height });
			}
		};
		void load();
		return () => {
			cancelled = true;
		};
	}, []);

	const bounds = context?.display ?? { width: 0, height: 0, scaleFactor: 1 };

	const confirm = useCallback((startRecording: boolean) => {
		const current = rectRef.current;
		if (!isUsable(current)) return;
		void window.electronAPI?.confirmRegionSelection(current, startRecording);
	}, []);

	const cancel = useCallback(() => {
		void window.electronAPI?.cancelRegionSelection();
	}, []);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				cancel();
				return;
			}
			if (event.key === "Enter") {
				event.preventDefault();
				confirm(true);
				return;
			}

			const step = event.shiftKey ? NUDGE_STEP_LARGE : NUDGE_STEP;
			const delta: Record<string, [number, number]> = {
				ArrowLeft: [-step, 0],
				ArrowRight: [step, 0],
				ArrowUp: [0, -step],
				ArrowDown: [0, step],
			};
			const move = delta[event.key];
			if (!move || !rectRef.current || !context) return;
			event.preventDefault();
			setRect(moveRect(rectRef.current, move[0], move[1], context.display));
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [cancel, confirm, context]);

	const beginInteraction = (event: React.PointerEvent<HTMLElement>, interaction: Interaction) => {
		if (event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		// Capture on the overlay itself so tracking continues wherever the pointer goes.
		overlayRef.current?.setPointerCapture(event.pointerId);
		interactionRef.current = interaction;
		setInteracting(true);
	};

	const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
		const interaction = interactionRef.current;
		if (!interaction || !context) return;
		const point = { x: event.clientX, y: event.clientY };

		if (interaction.type === "create") {
			setRect(rectFromDrag(interaction.anchor, point, context.display, ratioRef.current));
			return;
		}
		const current = rectRef.current;
		if (!current) return;
		if (interaction.type === "move") {
			setRect(
				moveRect(
					current,
					point.x - interaction.last.x,
					point.y - interaction.last.y,
					context.display,
				),
			);
			interaction.last = point;
			return;
		}
		setRect(resizeRect(current, interaction.handle, point, context.display, ratioRef.current));
	};

	const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
		const interaction = interactionRef.current;
		if (!interaction) return;
		interactionRef.current = null;
		setInteracting(false);
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
		// A click without a drag is not a selection; go back to the empty prompt.
		if (interaction.type === "create" && !isUsable(rectRef.current)) {
			setRect(null);
		}
	};

	const selectAspect = (id: string) => {
		setAspectId(id);
		const preset = REGION_ASPECT_PRESETS.find((candidate) => candidate.id === id);
		if (preset?.ratio && rectRef.current && context) {
			setRect(applyAspectRatio(rectRef.current, preset.ratio, context.display));
		}
	};

	const selectSize = (width: number, height: number) => {
		if (!context) return;
		const base = rectRef.current ?? {
			x: context.display.width / 2,
			y: context.display.height / 2,
			width: 0,
			height: 0,
		};
		setAspectId("free");
		setRect(
			resizeRectToPixelSize(base, width, height, context.display, context.display.scaleFactor),
		);
	};

	if (!context) return null;

	const usable = isUsable(rect);
	// Keep the toolbar next to the selection: below it, above it, or inside at the bottom.
	const toolbarTop = rect
		? rect.y + rect.height + TOOLBAR_GAP + TOOLBAR_HEIGHT <= bounds.height
			? rect.y + rect.height + TOOLBAR_GAP
			: rect.y - TOOLBAR_GAP - TOOLBAR_HEIGHT >= 0
				? rect.y - TOOLBAR_GAP - TOOLBAR_HEIGHT
				: rect.y + rect.height - TOOLBAR_GAP - TOOLBAR_HEIGHT
		: 0;
	const badgeInside = rect ? rect.y < 30 : false;

	return (
		<div
			ref={overlayRef}
			data-testid="region-selector"
			className={`${hud.root} ${styles.overlay} ${rect ? "" : styles.overlayDimmed}`}
			onPointerDown={(event) =>
				beginInteraction(event, {
					type: "create",
					anchor: { x: event.clientX, y: event.clientY },
				})
			}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerEnd}
			onPointerCancel={handlePointerEnd}
		>
			{!rect && (
				<div className={styles.prompt}>
					<div className={styles.promptTitle}>Drag to select the area to record</div>
					<div className={styles.promptHint}>
						<kbd className={hud.kbd}>Esc</kbd> to cancel
					</div>
				</div>
			)}

			{rect && (
				<div
					data-testid="region-selection"
					className={styles.selection}
					style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
					onPointerDown={(event) =>
						beginInteraction(event, {
							type: "move",
							last: { x: event.clientX, y: event.clientY },
						})
					}
					onDoubleClick={() => confirm(true)}
				>
					<div className={`${styles.sizeBadge} ${badgeInside ? styles.sizeBadgeInside : ""}`}>
						{formatRegionSize({ ...rect, scaleFactor: bounds.scaleFactor })}
					</div>
					{REGION_RESIZE_HANDLES.map((handle) => (
						<span
							key={handle}
							className={styles.handle}
							style={HANDLE_POSITION[handle]}
							onPointerDown={(event) => beginInteraction(event, { type: "resize", handle })}
						/>
					))}
				</div>
			)}

			{rect && !interacting && (
				<div
					className={`${hud.bar} ${hud.fadeIn} ${styles.toolbar}`}
					style={{
						top: toolbarTop,
						left: Math.min(
							Math.max(rect.x + rect.width / 2, TOOLBAR_HALF_WIDTH + TOOLBAR_GAP),
							Math.max(
								TOOLBAR_HALF_WIDTH + TOOLBAR_GAP,
								bounds.width - TOOLBAR_HALF_WIDTH - TOOLBAR_GAP,
							),
						),
					}}
					onPointerDown={(event) => event.stopPropagation()}
				>
					<div className={hud.picker} role="radiogroup" aria-label="Aspect ratio">
						{REGION_ASPECT_PRESETS.map((preset) => (
							<button
								key={preset.id}
								type="button"
								role="radio"
								aria-checked={aspectId === preset.id}
								className={`${hud.pickerOption} ${styles.compactOption} ${
									aspectId === preset.id ? hud.pickerOptionSelected : ""
								}`}
								onClick={() => selectAspect(preset.id)}
							>
								{preset.label}
							</button>
						))}
					</div>
					<span className={hud.divider} />
					{REGION_SIZE_PRESETS.slice(0, 2).map((size) => (
						<button
							key={`${size.width}x${size.height}`}
							type="button"
							className={`${hud.control} ${hud.controlLabel} tabular-nums`}
							title={`Exactly ${size.width} × ${size.height} px`}
							onClick={() => selectSize(size.width, size.height)}
						>
							{size.height}p
						</button>
					))}
					<span className={hud.divider} />
					<button type="button" className={`${hud.control} ${hud.controlLabel}`} onClick={cancel}>
						Cancel
					</button>
					<button
						type="button"
						className={`${hud.control} ${hud.controlLabel}`}
						disabled={!usable}
						title="Keep this area without recording yet"
						onClick={() => confirm(false)}
					>
						Done
					</button>
					<button
						type="button"
						data-testid="region-record-button"
						className={hud.recordButton}
						disabled={!usable}
						onClick={() => confirm(true)}
					>
						<span className={hud.recordDot} aria-hidden="true" />
						Record
						<kbd className={hud.shortcutHint}>Enter</kbd>
					</button>
				</div>
			)}
		</div>
	);
}
