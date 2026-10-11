import "@testing-library/jest-dom";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RegionSelectorContext } from "@/lib/quickCaptureContracts";
import { RegionSelector } from "./RegionSelector";

const DISPLAY = { id: 7, width: 1920, height: 1080, scaleFactor: 1.5 };

function stubApi(context: RegionSelectorContext) {
	window.electronAPI = {
		getRegionSelectorContext: vi.fn(async () => context),
		confirmRegionSelection: vi.fn(async () => ({ success: true })),
		cancelRegionSelection: vi.fn(async () => ({ success: true })),
	} as unknown as Window["electronAPI"];
}

async function renderSelector() {
	render(<RegionSelector />);
	return screen.findByTestId("region-selector");
}

function drag(overlay: HTMLElement, from: [number, number], to: [number, number]) {
	fireEvent.pointerDown(overlay, { button: 0, pointerId: 1, clientX: from[0], clientY: from[1] });
	fireEvent.pointerMove(overlay, { pointerId: 1, clientX: to[0], clientY: to[1] });
	fireEvent.pointerUp(overlay, { pointerId: 1, clientX: to[0], clientY: to[1] });
}

describe("RegionSelector", () => {
	beforeEach(() => {
		// jsdom has no Pointer Capture API.
		HTMLElement.prototype.setPointerCapture = vi.fn();
		HTMLElement.prototype.hasPointerCapture = vi.fn(() => true);
		HTMLElement.prototype.releasePointerCapture = vi.fn();
		stubApi({ display: DISPLAY, initialRegion: null });
	});

	afterEach(cleanup);

	it("prompts for a selection and has nothing to confirm yet", async () => {
		await renderSelector();

		expect(screen.getByText("Drag to select the area to record")).toBeInTheDocument();
		expect(screen.queryByTestId("region-selection")).not.toBeInTheDocument();

		fireEvent.keyDown(window, { key: "Enter" });
		expect(window.electronAPI.confirmRegionSelection).not.toHaveBeenCalled();
	});

	it("records the dragged area, labelled in real pixels", async () => {
		const overlay = await renderSelector();

		drag(overlay, [100, 100], [740, 460]);

		// 640 x 360 DIP at 150% scaling is 960 x 540 pixels of video.
		expect(screen.getByText("960 × 540")).toBeInTheDocument();
		fireEvent.click(screen.getByTestId("region-record-button"));

		expect(window.electronAPI.confirmRegionSelection).toHaveBeenCalledWith(
			{ x: 100, y: 100, width: 640, height: 360 },
			true,
		);
	});

	it("keeps the area without recording when Done is chosen", async () => {
		const overlay = await renderSelector();

		drag(overlay, [100, 100], [740, 460]);
		fireEvent.click(screen.getByRole("button", { name: "Done" }));

		expect(window.electronAPI.confirmRegionSelection).toHaveBeenCalledWith(
			{ x: 100, y: 100, width: 640, height: 360 },
			false,
		);
	});

	it("treats a click without a drag as no selection", async () => {
		const overlay = await renderSelector();

		drag(overlay, [300, 300], [305, 303]);

		expect(screen.queryByTestId("region-selection")).not.toBeInTheDocument();
	});

	it("offers the previous area so Enter repeats the capture", async () => {
		stubApi({
			display: DISPLAY,
			initialRegion: {
				displayId: 7,
				x: 200,
				y: 150,
				width: 800,
				height: 450,
				displayWidth: 1920,
				displayHeight: 1080,
				scaleFactor: 1.5,
			},
		});
		await renderSelector();

		expect(await screen.findByTestId("region-selection")).toBeInTheDocument();
		fireEvent.keyDown(window, { key: "Enter" });

		expect(window.electronAPI.confirmRegionSelection).toHaveBeenCalledWith(
			{ x: 200, y: 150, width: 800, height: 450 },
			true,
		);
	});

	it("moves the selection with the mouse and nudges it with the arrow keys", async () => {
		const overlay = await renderSelector();
		drag(overlay, [100, 100], [740, 460]);
		const selection = screen.getByTestId("region-selection");

		fireEvent.pointerDown(selection, { button: 0, pointerId: 2, clientX: 300, clientY: 300 });
		fireEvent.pointerMove(overlay, { pointerId: 2, clientX: 350, clientY: 320 });
		fireEvent.pointerUp(overlay, { pointerId: 2, clientX: 350, clientY: 320 });
		fireEvent.keyDown(window, { key: "ArrowRight", shiftKey: true });
		fireEvent.keyDown(window, { key: "ArrowUp" });
		fireEvent.keyDown(window, { key: "Enter" });

		expect(window.electronAPI.confirmRegionSelection).toHaveBeenCalledWith(
			{ x: 160, y: 119, width: 640, height: 360 },
			true,
		);
	});

	it("snaps the selection to a chosen aspect ratio and to exact sizes", async () => {
		const overlay = await renderSelector();
		drag(overlay, [100, 100], [900, 300]);

		fireEvent.click(screen.getByRole("radio", { name: "1:1" }));
		const squared = selectionSize();
		expect(squared.width).toBe(squared.height);

		// "720p" means 1280 x 720 pixels of video: 853 x 480 DIP at 150% scaling.
		fireEvent.click(screen.getByRole("button", { name: "720p" }));
		expect(screen.getByText("1280 × 720")).toBeInTheDocument();
	});

	it("cancels with Escape", async () => {
		await renderSelector();

		fireEvent.keyDown(window, { key: "Escape" });

		expect(window.electronAPI.cancelRegionSelection).toHaveBeenCalledTimes(1);
	});
});

function selectionSize() {
	const style = screen.getByTestId("region-selection").style;
	return { width: Number.parseFloat(style.width), height: Number.parseFloat(style.height) };
}
