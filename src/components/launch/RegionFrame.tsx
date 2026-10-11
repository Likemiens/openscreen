// Keep in sync with REGION_FRAME_MARGIN in electron/windows.ts: the window is this much
// larger than the recorded area on every side.
const FRAME_MARGIN = 6;
const STROKE = 2;

/**
 * Outline shown around the area while it is being recorded. The window is excluded
 * from capture, and the stroke sits just outside the area so it never covers what is
 * being filmed.
 */
export function RegionFrame() {
	return (
		<div
			aria-hidden="true"
			style={{
				position: "fixed",
				inset: FRAME_MARGIN - STROKE,
				border: `${STROKE}px solid #ff453a`,
				borderRadius: 4,
				boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.35)",
				pointerEvents: "none",
			}}
		/>
	);
}
