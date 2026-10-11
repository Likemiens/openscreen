import "@testing-library/jest-dom";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExportMenu } from "./ExportMenu";

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

type ExportMenuProps = ComponentProps<typeof ExportMenu>;

function renderMenu(overrides: Partial<ExportMenuProps> = {}) {
	const props: ExportMenuProps = {
		format: "mp4",
		onFormatChange: vi.fn(),
		quality: "good",
		onQualityChange: vi.fn(),
		sourceSize: { width: 640, height: 474 },
		gifFrameRate: 15,
		onGifFrameRateChange: vi.fn(),
		gifSizePreset: "medium",
		onGifSizePresetChange: vi.fn(),
		gifLoop: true,
		onGifLoopChange: vi.fn(),
		gifOutputSize: { width: 972, height: 720 },
		yandexConnected: true,
		onSave: vi.fn(),
		onPublish: vi.fn(),
		onConnectYandex: vi.fn(),
		onOpen: vi.fn(),
		...overrides,
	};
	const view = render(<ExportMenu {...props} />);
	return { props, ...view };
}

function openMenu() {
	fireEvent.click(screen.getByTestId("testId-export-panel-button"));
}

beforeEach(() => {
	vi.stubGlobal("ResizeObserver", StubResizeObserver);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("ExportMenu", () => {
	it("is one button until it is opened, and refreshes what it shows on opening", () => {
		const { props } = renderMenu();
		expect(screen.getByRole("button", { name: /export/i })).toBeInTheDocument();
		expect(screen.queryByTestId("studio-export-menu")).not.toBeInTheDocument();
		openMenu();
		expect(screen.getByTestId("studio-export-menu")).toBeInTheDocument();
		expect(props.onOpen).toHaveBeenCalledTimes(1);
	});

	it("cannot be opened without a video or during an export", () => {
		renderMenu({ disabled: true });
		expect(screen.getByTestId("testId-export-panel-button")).toBeDisabled();
	});

	it("saves to a file and closes", () => {
		const { props } = renderMenu();
		openMenu();
		fireEvent.click(screen.getByTestId("testId-export-button"));
		expect(props.onSave).toHaveBeenCalledTimes(1);
		expect(screen.queryByTestId("studio-export-menu")).not.toBeInTheDocument();
	});

	it("publishes when Yandex Disk is connected", () => {
		const { props } = renderMenu({ yandexConnected: true });
		openMenu();
		fireEvent.click(screen.getByTestId("studio-export-publish"));
		expect(props.onPublish).toHaveBeenCalledTimes(1);
		expect(props.onConnectYandex).not.toHaveBeenCalled();
	});

	it("offers to connect Yandex Disk instead of failing when it is not connected", () => {
		const { props } = renderMenu({ yandexConnected: false });
		openMenu();
		expect(screen.queryByTestId("studio-export-publish")).not.toBeInTheDocument();
		fireEvent.click(screen.getByTestId("studio-export-connect-yandex"));
		expect(props.onConnectYandex).toHaveBeenCalledTimes(1);
		expect(props.onPublish).not.toHaveBeenCalled();
	});

	it("waits for the connection state before offering to publish", () => {
		renderMenu({ yandexConnected: null });
		openMenu();
		expect(screen.getByTestId("studio-export-publish")).toBeDisabled();
	});

	it("names the source size and warns when a preset would enlarge it", () => {
		const { props } = renderMenu({ quality: "good" });
		openMenu();
		expect(screen.getByRole("radio", { name: "Source · 474p" })).toBeInTheDocument();
		expect(screen.getByText(/640 × 474/)).toHaveTextContent("enlarges");
		fireEvent.click(screen.getByRole("radio", { name: "Source · 474p" }));
		expect(props.onQualityChange).toHaveBeenCalledWith("source");
	});

	it("does not warn when the preset is no larger than the source", () => {
		renderMenu({ quality: "medium", sourceSize: { width: 1920, height: 1080 } });
		openMenu();
		expect(screen.getByText(/1920 × 1080/)).not.toHaveTextContent("enlarges");
	});

	it("switches format with the same test ids the export specs use", () => {
		const { props } = renderMenu();
		openMenu();
		fireEvent.click(screen.getByTestId("testId-gif-format-button"));
		expect(props.onFormatChange).toHaveBeenCalledWith("gif");
		expect(screen.getByTestId("testId-mp4-format-button")).toHaveAttribute("aria-checked", "true");
	});

	it("shows GIF options for a GIF, and publishes links as MP4 only", () => {
		const { props } = renderMenu({ format: "gif" });
		openMenu();
		expect(screen.queryByRole("radiogroup", { name: "Quality" })).not.toBeInTheDocument();
		fireEvent.click(screen.getByRole("radio", { name: "30 fps" }));
		expect(props.onGifFrameRateChange).toHaveBeenCalledWith(30);
		fireEvent.click(screen.getByTestId("testId-gif-size-button-original"));
		expect(props.onGifSizePresetChange).toHaveBeenCalledWith("original");
		fireEvent.click(screen.getByRole("switch", { name: "Loop forever" }));
		expect(props.onGifLoopChange).toHaveBeenCalledWith(false);
		expect(screen.getByText("972 × 720 px")).toBeInTheDocument();
		expect(screen.getByTestId("studio-export-publish")).toBeDisabled();
		expect(screen.getByText(/Links are published as MP4/)).toBeInTheDocument();
	});

	it("offers to save an export that rendered but was never written", () => {
		const onSaveUnsavedExport = vi.fn();
		renderMenu({ hasUnsavedExport: true, onSaveUnsavedExport });
		openMenu();
		fireEvent.click(screen.getByRole("button", { name: /choose where to save it/i }));
		expect(onSaveUnsavedExport).toHaveBeenCalledTimes(1);
	});
});
