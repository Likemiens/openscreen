import "@testing-library/jest-dom";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReadyClip } from "@/hooks/useQuickClip";
import { TooltipProvider } from "../ui/tooltip";
import { ClipCard } from "./ClipCard";

const CLIP: ReadyClip = {
	path: "C:\\Users\\me\\Videos\\OpenScreen\\Checkout flow.mp4",
	title: "Checkout flow",
	sizeBytes: 6.4 * 1024 * 1024,
	width: 1280,
	height: 720,
	durationSeconds: 14,
	mode: "transcode",
	thumbnail: null,
	share: { status: "idle" },
};

function renderCard(overrides: Partial<React.ComponentProps<typeof ClipCard>> = {}) {
	const props = {
		clip: CLIP,
		yandexConnected: true,
		onRename: vi.fn(),
		onShare: vi.fn(),
		onConnectYandex: vi.fn(),
		onCopyFile: vi.fn(async () => true),
		onReveal: vi.fn(),
		onStartDrag: vi.fn(),
		onOpenStudio: vi.fn(),
		onDelete: vi.fn(),
		onDismiss: vi.fn(),
		onOpenLink: vi.fn(),
		...overrides,
	};
	render(
		<TooltipProvider>
			<ClipCard {...props} />
		</TooltipProvider>,
	);
	return props;
}

describe("ClipCard", () => {
	afterEach(cleanup);

	it("describes the saved file and where it went", () => {
		renderCard();

		expect(screen.getByLabelText("Clip name")).toHaveValue("Checkout flow");
		expect(screen.getByText("1280 × 720 · 6.4 MB")).toBeInTheDocument();
		expect(screen.getByText("0:14")).toBeInTheDocument();
		expect(screen.getByText("Saved to Videos\\OpenScreen")).toBeInTheDocument();
	});

	it("shares by link when Yandex Disk is connected", () => {
		const props = renderCard();

		fireEvent.click(screen.getByRole("button", { name: "Copy link" }));

		expect(props.onShare).toHaveBeenCalledTimes(1);
		expect(props.onConnectYandex).not.toHaveBeenCalled();
	});

	it("offers setup instead of a link, and makes Copy file the main action, when disconnected", () => {
		const props = renderCard({ yandexConnected: false });

		expect(screen.queryByRole("button", { name: "Copy link" })).not.toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Set up link sharing" }));

		expect(props.onConnectYandex).toHaveBeenCalledTimes(1);
		expect(props.onShare).not.toHaveBeenCalled();
	});

	it("shows upload progress and blocks a second upload", () => {
		const props = renderCard({
			clip: { ...CLIP, share: { status: "uploading", progress: 0.42 } },
		});

		const button = screen.getByRole("button", { name: "Uploading 42%" });
		expect(button).toBeDisabled();
		fireEvent.click(button);
		expect(props.onShare).not.toHaveBeenCalled();
		// The file is being read by the uploader: it must not be renamed or trashed now.
		expect(screen.getByLabelText("Clip name")).toBeDisabled();
		expect(screen.getByRole("button", { name: "Move to trash" })).toBeDisabled();
	});

	it("shows the copied link and opens it", () => {
		const props = renderCard({
			clip: { ...CLIP, share: { status: "copied", url: "https://disk.yandex.ru/i/abc" } },
		});

		expect(screen.getByRole("button", { name: "Link copied" })).toBeEnabled();
		fireEvent.click(screen.getByRole("button", { name: "Open" }));

		expect(props.onOpenLink).toHaveBeenCalledWith("https://disk.yandex.ru/i/abc");
	});

	it("reports an upload error", () => {
		renderCard({ clip: { ...CLIP, share: { status: "error", message: "Disk is full." } } });

		expect(screen.getByRole("alert")).toHaveTextContent("Disk is full.");
	});

	it("renames on Enter and restores the name on Escape", () => {
		const props = renderCard();
		const input = screen.getByLabelText("Clip name");

		fireEvent.change(input, { target: { value: "Pricing bug" } });
		fireEvent.keyDown(input, { key: "Enter" });
		fireEvent.blur(input);
		expect(props.onRename).toHaveBeenCalledWith("Pricing bug");

		fireEvent.change(input, { target: { value: "Something else" } });
		fireEvent.keyDown(input, { key: "Escape" });
		expect(input).toHaveValue("Checkout flow");
		expect(props.onRename).toHaveBeenCalledTimes(1);
	});

	it("confirms that the file was copied", async () => {
		const props = renderCard();

		fireEvent.click(screen.getByRole("button", { name: "Copy file" }));

		expect(props.onCopyFile).toHaveBeenCalledTimes(1);
		expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
	});

	it("hands the file to the OS when the thumbnail is dragged", () => {
		const props = renderCard();
		const thumbnail = screen.getByText("0:14").parentElement as HTMLElement;

		fireEvent.dragStart(thumbnail);

		expect(props.onStartDrag).toHaveBeenCalledTimes(1);
	});

	it("exposes the remaining actions", () => {
		const props = renderCard();

		fireEvent.click(screen.getByRole("button", { name: "Show in folder" }));
		fireEvent.click(screen.getByRole("button", { name: "Edit in Studio" }));
		fireEvent.click(screen.getByRole("button", { name: "Move to trash" }));
		fireEvent.click(screen.getByRole("button", { name: "Close" }));

		expect(props.onReveal).toHaveBeenCalledTimes(1);
		expect(props.onOpenStudio).toHaveBeenCalledTimes(1);
		expect(props.onDelete).toHaveBeenCalledTimes(1);
		expect(props.onDismiss).toHaveBeenCalledTimes(1);
	});
});
