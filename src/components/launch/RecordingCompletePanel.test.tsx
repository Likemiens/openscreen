import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RecordingCompletePanel } from "./RecordingCompletePanel";

const baseProps = {
	draft: { filePath: "C:\\recordings\\recording.webm", title: "Product demo" },
	yandexConnected: true,
	onTitleChange: vi.fn(),
	onPublish: vi.fn(),
	onSaveAnywhere: vi.fn(),
	onOpenEditor: vi.fn(),
	onConfigureYandex: vi.fn(),
};

describe("RecordingCompletePanel", () => {
	it("keeps the recording local and passes selected export settings to each action", async () => {
		const user = userEvent.setup();
		const onSaveAnywhere = vi.fn();
		const onOpenEditor = vi.fn();

		render(
			<RecordingCompletePanel
				{...baseProps}
				onSaveAnywhere={onSaveAnywhere}
				onOpenEditor={onOpenEditor}
			/>,
		);

		expect(screen.getByText("Recording ready")).toBeTruthy();
		await user.click(screen.getByRole("button", { name: "720p" }));
		await user.click(screen.getByRole("button", { name: "30 FPS" }));
		await user.click(screen.getByRole("button", { name: "Save anywhere" }));
		expect(onSaveAnywhere).toHaveBeenCalledWith({ quality: "medium", frameRate: 30 });

		await user.click(screen.getByRole("button", { name: "Edit in Studio" }));
		expect(onOpenEditor).toHaveBeenCalledWith({ quality: "medium", frameRate: 30 });
	});

	it("publishes with the default 1080p at 60 FPS", async () => {
		const user = userEvent.setup();
		const onPublish = vi.fn();

		render(<RecordingCompletePanel {...baseProps} onPublish={onPublish} />);
		await user.click(screen.getByRole("button", { name: "Publish & get link" }));

		expect(onPublish).toHaveBeenCalledWith({ quality: "good", frameRate: 60 });
	});

	it("opens setup instead of publishing when Yandex Disk is disconnected", async () => {
		const user = userEvent.setup();
		const onConfigureYandex = vi.fn();
		const onPublish = vi.fn();

		render(
			<RecordingCompletePanel
				{...baseProps}
				yandexConnected={false}
				onPublish={onPublish}
				onConfigureYandex={onConfigureYandex}
			/>,
		);

		await user.click(screen.getByRole("button", { name: "Connect Yandex Disk" }));
		expect(onConfigureYandex).toHaveBeenCalledOnce();
		expect(onPublish).not.toHaveBeenCalled();
	});
});
