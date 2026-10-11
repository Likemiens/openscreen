import { AppWindow, Monitor, SquareDashed } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import type { CaptureMode } from "@/lib/captureSettings";
import styles from "./hud.module.css";

interface CaptureModeControlProps {
	mode: CaptureMode;
	/** What the selected mode will record, e.g. "1280 × 720" or a window title. */
	detail: string | null;
	disabled?: boolean;
	onSelect: (mode: CaptureMode) => void;
}

const MODES: Array<{
	mode: CaptureMode;
	label: string;
	hint: string;
	testId: string;
	Icon: typeof Monitor;
}> = [
	{
		mode: "area",
		label: "Area",
		hint: "Record a selected area",
		testId: "launch-capture-mode-area",
		Icon: SquareDashed,
	},
	{
		mode: "window",
		label: "Window",
		hint: "Record a single window",
		testId: "launch-source-selector-button",
		Icon: AppWindow,
	},
	{
		mode: "screen",
		label: "Screen",
		hint: "Record the entire screen",
		testId: "launch-capture-mode-screen",
		Icon: Monitor,
	},
];

/**
 * Picks what to record. Selecting a mode — including the current one — always opens
 * its picker, so the same control both shows and changes the capture target.
 */
export function CaptureModeControl({ mode, detail, disabled, onSelect }: CaptureModeControlProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const segmentRefs = useRef(new Map<CaptureMode, HTMLButtonElement>());
	const [pill, setPill] = useState<{ left: number; width: number } | null>(null);

	// The pill follows the selected segment, whose width changes with its detail text.
	useLayoutEffect(() => {
		const measure = () => {
			const segment = segmentRefs.current.get(mode);
			if (!segment) return;
			setPill((current) =>
				current?.left === segment.offsetLeft && current.width === segment.offsetWidth
					? current
					: { left: segment.offsetLeft, width: segment.offsetWidth },
			);
		};
		measure();

		if (typeof ResizeObserver === "undefined" || !containerRef.current) return;
		const observer = new ResizeObserver(measure);
		observer.observe(containerRef.current);
		return () => observer.disconnect();
	}, [mode]);

	return (
		<div ref={containerRef} className={styles.segmented} role="radiogroup" aria-label="Capture">
			{pill && pill.width > 0 && (
				<span
					className={styles.segmentPill}
					style={{ width: pill.width, transform: `translateX(${pill.left}px)` }}
				/>
			)}
			{MODES.map(({ mode: segmentMode, label, hint, testId, Icon }) => {
				const selected = segmentMode === mode;
				const summary = selected && detail ? `${label}: ${detail}` : hint;
				// "Screen 1" already says what the mode is; don't render "Screen Screen 1".
				const detailNamesMode =
					selected && detail?.toLowerCase().startsWith(label.toLowerCase()) === true;
				return (
					<button
						key={segmentMode}
						ref={(element) => {
							if (element) segmentRefs.current.set(segmentMode, element);
							else segmentRefs.current.delete(segmentMode);
						}}
						type="button"
						role="radio"
						aria-checked={selected}
						aria-label={summary}
						title={summary}
						data-testid={testId}
						disabled={disabled}
						className={`${styles.segment} ${selected ? styles.segmentSelected : ""}`}
						onClick={() => onSelect(segmentMode)}
					>
						<Icon size={15} strokeWidth={1.9} aria-hidden="true" />
						{!detailNamesMode && <span>{label}</span>}
						{selected && detail && (
							<span className={detailNamesMode ? undefined : styles.segmentDetail}>{detail}</span>
						)}
					</button>
				);
			})}
		</div>
	);
}
