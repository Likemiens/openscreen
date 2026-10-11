import "@testing-library/jest-dom";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorEmptyState } from "./EditorEmptyState";

vi.mock("@/contexts/I18nContext", () => ({
	useScopedT: () => (key: string) => key,
}));

vi.mock("@/native", () => ({
	nativeBridgeClient: { project: {} },
}));

function dropFiles(container: HTMLElement, names: string[]) {
	const files = names.map((name) => new File(["x"], name));
	fireEvent.drop(container.firstElementChild as HTMLElement, { dataTransfer: { files } });
}

function renderEmptyState(withVideoDrop = true) {
	const props = {
		onVideoImported: vi.fn(),
		onVideoDropped: withVideoDrop ? vi.fn() : undefined,
		onProjectOpened: vi.fn(),
	};
	const view = render(<EditorEmptyState {...props} />);
	return { props, ...view };
}

describe("EditorEmptyState video drop", () => {
	const openVideoFileFromPath = vi.fn();

	beforeEach(() => {
		openVideoFileFromPath.mockReset();
		window.electronAPI = {
			getPathForFile: (file: File) => `C:\\clips\\${file.name}`,
			openVideoFileFromPath,
		} as unknown as typeof window.electronAPI;
	});

	afterEach(() => {
		cleanup();
	});

	it("opens a dropped video through the main process's approval", async () => {
		openVideoFileFromPath.mockResolvedValue({ success: true, path: "C:\\clips\\demo.MOV" });
		const { container, props } = renderEmptyState();
		dropFiles(container, ["notes.txt", "demo.MOV"]);

		await waitFor(() => expect(props.onVideoDropped).toHaveBeenCalledWith("C:\\clips\\demo.MOV"));
		expect(openVideoFileFromPath).toHaveBeenCalledWith("C:\\clips\\demo.MOV");
		expect(props.onProjectOpened).not.toHaveBeenCalled();
	});

	it("reports a video the main process could not read", async () => {
		openVideoFileFromPath.mockResolvedValue({ success: false });
		const { container, props } = renderEmptyState();
		dropFiles(container, ["demo.mp4"]);

		expect(await screen.findByText("emptyState.dropErrors.couldNotOpenTitle")).toBeInTheDocument();
		expect(props.onVideoDropped).not.toHaveBeenCalled();
	});

	it("rejects files that are neither a project nor a video", async () => {
		const { container, props } = renderEmptyState();
		dropFiles(container, ["notes.txt"]);

		expect(
			await screen.findByText("emptyState.dropErrors.unsupportedFormatTitle"),
		).toBeInTheDocument();
		expect(openVideoFileFromPath).not.toHaveBeenCalled();
		expect(props.onVideoDropped).not.toHaveBeenCalled();
	});

	it("does not accept videos where the host gave no handler for them", async () => {
		const { container } = renderEmptyState(false);
		dropFiles(container, ["demo.mp4"]);

		expect(
			await screen.findByText("emptyState.dropErrors.unsupportedFormatTitle"),
		).toBeInTheDocument();
		expect(openVideoFileFromPath).not.toHaveBeenCalled();
	});
});
