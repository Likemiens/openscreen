import "@testing-library/jest-dom";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCropInset } from "@/lib/cropInsets";
import { DEFAULT_DEVICE_FRAME } from "@/lib/deviceFrame";
import { FramePanel } from "./FramePanel";
import { DEFAULT_CROP_REGION } from "./types";

class StubResizeObserver {
	observe() {
		return undefined;
	}
	unobserve() {
		return undefined;
	}
	disconnect() {
		return undefined;
	}
}

type FramePanelProps = ComponentProps<typeof FramePanel>;

function fakeVideo(width: number, height: number, duration = 2): HTMLVideoElement {
	const video = document.createElement("video");
	Object.defineProperties(video, {
		videoWidth: { value: width },
		videoHeight: { value: height },
		duration: { value: duration },
	});
	return video;
}

function renderPanel(overrides: Partial<FramePanelProps> = {}) {
	const props: FramePanelProps = {
		videoElement: fakeVideo(640, 480),
		sourceName: "demo.mp4",
		onOpenVideo: vi.fn(),
		deviceFrame: DEFAULT_DEVICE_FRAME,
		onDeviceFrameChange: vi.fn(),
		padding: 50,
		onPaddingChange: vi.fn(),
		onPaddingCommit: vi.fn(),
		borderRadius: 0,
		onBorderRadiusChange: vi.fn(),
		onBorderRadiusCommit: vi.fn(),
		aspectRatio: "16:9",
		onAspectRatioChange: vi.fn(),
		cropRegion: DEFAULT_CROP_REGION,
		onCropChange: vi.fn(),
		onOpenCropEditor: vi.fn(),
		...overrides,
	};
	const view = render(<FramePanel {...props} />);
	return { props, ...view };
}

beforeEach(() => {
	vi.stubGlobal("ResizeObserver", StubResizeObserver);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("FramePanel", () => {
	describe("source video", () => {
		it("shows what is being edited and offers to open another file", () => {
			const { props } = renderPanel();
			expect(screen.getByText("demo.mp4")).toBeInTheDocument();
			expect(screen.getByText("640 × 480 · 0:02")).toBeInTheDocument();
			fireEvent.click(screen.getByTestId("studio-open-video"));
			expect(props.onOpenVideo).toHaveBeenCalledTimes(1);
		});

		it("waits for the video's size before enabling the pixel fields", () => {
			renderPanel({ videoElement: null, sourceName: null });
			expect(screen.getByText("Untitled video")).toBeInTheDocument();
			expect(screen.getByText("Loading…")).toBeInTheDocument();
			expect(screen.getByLabelText("Top")).toBeDisabled();
		});
	});

	describe("device", () => {
		it("picks a device and keeps the other frame settings", () => {
			const { props } = renderPanel();
			fireEvent.change(screen.getByLabelText("Device"), { target: { value: "phone" } });
			expect(props.onDeviceFrameChange).toHaveBeenCalledWith({
				...DEFAULT_DEVICE_FRAME,
				kind: "phone",
			});
		});

		it("shows colour only once there is a device to colour", () => {
			const { rerender, props } = renderPanel();
			expect(screen.queryByLabelText("Device color")).not.toBeInTheDocument();
			rerender(<FramePanel {...props} deviceFrame={{ ...DEFAULT_DEVICE_FRAME, kind: "laptop" }} />);
			fireEvent.change(screen.getByLabelText("Device color"), { target: { value: "silver" } });
			expect(props.onDeviceFrameChange).toHaveBeenCalledWith({
				...DEFAULT_DEVICE_FRAME,
				kind: "laptop",
				color: "silver",
			});
		});

		it("offers camera cutouts for a phone only", () => {
			const { rerender, props } = renderPanel({
				deviceFrame: { ...DEFAULT_DEVICE_FRAME, kind: "tablet" },
			});
			expect(screen.queryByRole("radiogroup", { name: "Camera cutout" })).not.toBeInTheDocument();
			rerender(<FramePanel {...props} deviceFrame={{ ...DEFAULT_DEVICE_FRAME, kind: "phone" }} />);
			fireEvent.click(screen.getByRole("radio", { name: "Notch" }));
			expect(props.onDeviceFrameChange).toHaveBeenCalledWith({
				...DEFAULT_DEVICE_FRAME,
				kind: "phone",
				camera: "notch",
			});
		});

		it("arrives the way each device is usually held", () => {
			const { props } = renderPanel();
			fireEvent.change(screen.getByLabelText("Device"), { target: { value: "tablet" } });
			expect(props.onDeviceFrameChange).toHaveBeenCalledWith({
				...DEFAULT_DEVICE_FRAME,
				kind: "tablet",
				orientation: "landscape",
			});
		});

		it("turns a phone or tablet, but offers no orientation for a laptop or a window", () => {
			const phone = { ...DEFAULT_DEVICE_FRAME, kind: "phone" as const };
			const { rerender, props } = renderPanel({ deviceFrame: phone });
			expect(screen.getByRole("radio", { name: "Portrait" })).toHaveAttribute(
				"aria-checked",
				"true",
			);
			fireEvent.click(screen.getByRole("radio", { name: "Landscape" }));
			expect(props.onDeviceFrameChange).toHaveBeenCalledWith({
				...phone,
				orientation: "landscape",
			});

			rerender(<FramePanel {...props} deviceFrame={{ ...phone, kind: "laptop" }} />);
			expect(screen.queryByRole("radiogroup", { name: "Orientation" })).not.toBeInTheDocument();
			expect(screen.getByRole("radiogroup", { name: "Video on screen" })).toBeInTheDocument();

			rerender(<FramePanel {...props} deviceFrame={{ ...phone, kind: "browser" }} />);
			expect(screen.queryByRole("radiogroup", { name: "Orientation" })).not.toBeInTheDocument();
			expect(screen.queryByRole("radiogroup", { name: "Video on screen" })).not.toBeInTheDocument();
		});

		it("chooses whether the video fills the fixed screen or fits inside it", () => {
			const phone = { ...DEFAULT_DEVICE_FRAME, kind: "phone" as const };
			const { props } = renderPanel({ deviceFrame: phone });
			expect(screen.getByRole("radio", { name: "Fill" })).toHaveAttribute("aria-checked", "true");
			fireEvent.click(screen.getByRole("radio", { name: "Fit" }));
			expect(props.onDeviceFrameChange).toHaveBeenCalledWith({ ...phone, fit: "fit" });
		});

		it("asks which end the camera is on only for a phone on its side with a camera", () => {
			const phone = {
				...DEFAULT_DEVICE_FRAME,
				kind: "phone" as const,
				orientation: "landscape" as const,
			};
			const { rerender, props } = renderPanel({ deviceFrame: phone });
			fireEvent.click(screen.getByRole("radio", { name: "Right" }));
			expect(props.onDeviceFrameChange).toHaveBeenCalledWith({ ...phone, cameraSide: "right" });

			rerender(<FramePanel {...props} deviceFrame={{ ...phone, camera: "none" }} />);
			expect(screen.queryByRole("radiogroup", { name: "Camera side" })).not.toBeInTheDocument();

			// The shape of the video no longer turns the phone: only its orientation does.
			rerender(
				<FramePanel
					{...props}
					deviceFrame={{ ...phone, orientation: "portrait" }}
					videoElement={fakeVideo(1920, 1080)}
				/>,
			);
			expect(screen.queryByRole("radiogroup", { name: "Camera side" })).not.toBeInTheDocument();
		});

		it("explains when the camera layout leaves no room for the device", () => {
			renderPanel({
				deviceFrame: { ...DEFAULT_DEVICE_FRAME, kind: "phone" },
				deviceFrameUnavailable: true,
			});
			expect(screen.getByText(/the device is not drawn/i)).toBeInTheDocument();
		});
	});

	describe("canvas", () => {
		it("switches the aspect ratio with one click", () => {
			const { props } = renderPanel();
			expect(screen.getByRole("radio", { name: "16:9" })).toHaveAttribute("aria-checked", "true");
			fireEvent.click(screen.getByRole("radio", { name: "9:16" }));
			expect(props.onAspectRatioChange).toHaveBeenCalledWith("9:16");
			fireEvent.click(screen.getByRole("radio", { name: "Auto" }));
			expect(props.onAspectRatioChange).toHaveBeenCalledWith("native");
		});

		it("shows no quick pick for a ratio chosen from the timeline's longer list", () => {
			renderPanel({ aspectRatio: "4:5" });
			for (const radio of screen.getAllByRole("radio")) {
				expect(radio).toHaveAttribute("aria-checked", "false");
			}
		});

		it("presents padding as the share of the canvas the video fills", () => {
			const { props } = renderPanel({ padding: 50 });
			expect(screen.getByText("80%")).toBeInTheDocument();
			const scale = screen.getByRole("slider", { name: "Scale" });
			scale.focus();
			fireEvent.keyDown(scale, { key: "ArrowRight" });
			// 81% of the canvas is padding 47.5.
			expect(props.onPaddingChange).toHaveBeenCalledWith(47.5);
		});

		it("disables scale where the stacked layout ignores it", () => {
			renderPanel({ paddingUnavailable: true });
			expect(screen.getByText("—")).toBeInTheDocument();
		});

		it("hands corner rounding to the device once one is selected", () => {
			const { rerender, props } = renderPanel({ borderRadius: 12 });
			expect(screen.getByRole("slider", { name: "Corners" })).toBeInTheDocument();
			rerender(
				<FramePanel {...props} deviceFrame={{ ...DEFAULT_DEVICE_FRAME, kind: "browser" }} />,
			);
			expect(screen.queryByRole("slider", { name: "Corners" })).not.toBeInTheDocument();
		});
	});

	describe("crop", () => {
		it("trims exactly the typed number of source pixels", () => {
			const { props, rerender } = renderPanel();
			const top = screen.getByLabelText("Top");
			fireEvent.change(top, { target: { value: "5" } });
			fireEvent.keyDown(top, { key: "Enter" });
			fireEvent.blur(top);

			expect(props.onCropChange).toHaveBeenCalledTimes(1);
			const crop = vi.mocked(props.onCropChange).mock.calls[0][0];
			expect(crop.y * 480).toBeCloseTo(5, 9);
			expect(crop.height * 480).toBeCloseTo(475, 9);
			expect(crop.x).toBe(0);
			expect(crop.width).toBe(1);

			rerender(<FramePanel {...props} cropRegion={crop} />);
			expect(screen.getByText("Result 640 × 475")).toBeInTheDocument();
			expect(screen.getByLabelText("Top")).toHaveValue("5");
		});

		it("reads an existing crop back as whole pixels on each side", () => {
			let crop = setCropInset(DEFAULT_CROP_REGION, "left", 20, 640, 480);
			crop = setCropInset(crop, "bottom", 8, 640, 480);
			renderPanel({ cropRegion: crop });
			expect(screen.getByLabelText("Left")).toHaveValue("20");
			expect(screen.getByLabelText("Bottom")).toHaveValue("8");
			expect(screen.getByLabelText("Right")).toHaveValue("0");
			expect(screen.getByText("Result 620 × 472")).toBeInTheDocument();
		});

		it("stops at the most that can be cut, so the field never shows an unapplied value", () => {
			const crop = setCropInset(DEFAULT_CROP_REGION, "bottom", 100, 640, 480);
			const { props } = renderPanel({ cropRegion: crop });
			const top = screen.getByLabelText("Top");
			fireEvent.change(top, { target: { value: "480" } });
			fireEvent.blur(top);
			// 480 − 100 already cut from the bottom − the 16 px that must remain.
			expect(top).toHaveValue("364");
			const applied = vi.mocked(props.onCropChange).mock.calls[0][0];
			expect(applied.y * 480).toBeCloseTo(364, 9);
		});

		it("offers a reset only while something is cropped", () => {
			const { props, rerender } = renderPanel();
			expect(screen.queryByRole("button", { name: "Reset crop" })).not.toBeInTheDocument();
			rerender(
				<FramePanel
					{...props}
					cropRegion={setCropInset(DEFAULT_CROP_REGION, "top", 5, 640, 480)}
				/>,
			);
			fireEvent.click(screen.getByRole("button", { name: "Reset crop" }));
			expect(props.onCropChange).toHaveBeenCalledWith(DEFAULT_CROP_REGION);
		});

		it("opens the visual crop editor", () => {
			const { props } = renderPanel();
			fireEvent.click(screen.getByRole("button", { name: /adjust on video/i }));
			expect(props.onOpenCropEditor).toHaveBeenCalledTimes(1);
		});
	});
});
