import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RecordingCompletePanel } from "./RecordingCompletePanel";

describe("RecordingCompletePanel", () => {
	it("keeps the recording local until the user chooses an action", async () => {
		const user = userEvent.setup();
		const onTitleChange = vi.fn();
		const onOpenEditor = vi.fn();
		const onPublish = vi.fn();

		render(
			<RecordingCompletePanel
				draft={{ filePath: "C:\\recordings\\recording.webm", title: "Демо продукта" }}
				yandexConnected
				onTitleChange={onTitleChange}
				onPublish={onPublish}
				onOpenEditor={onOpenEditor}
				onConfigureYandex={vi.fn()}
			/>,
		);

		expect(screen.getByText("Запись сохранена локально")).toBeTruthy();
		await user.type(screen.getByLabelText("Название видео"), " 2");
		expect(onTitleChange).toHaveBeenCalled();
		await user.click(screen.getByRole("button", { name: "Открыть редактор" }));
		expect(onOpenEditor).toHaveBeenCalledOnce();
		expect(onPublish).not.toHaveBeenCalled();
	});

	it("opens setup instead of publishing when Yandex Disk is disconnected", async () => {
		const user = userEvent.setup();
		const onConfigureYandex = vi.fn();
		const onPublish = vi.fn();

		render(
			<RecordingCompletePanel
				draft={{ filePath: "C:\\recordings\\recording.webm", title: "Демо" }}
				yandexConnected={false}
				onTitleChange={vi.fn()}
				onPublish={onPublish}
				onOpenEditor={vi.fn()}
				onConfigureYandex={onConfigureYandex}
			/>,
		);

		await user.click(screen.getByRole("button", { name: "Настроить Яндекс Диск" }));
		expect(onConfigureYandex).toHaveBeenCalledOnce();
		expect(onPublish).not.toHaveBeenCalled();
	});
});
