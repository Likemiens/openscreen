import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { YandexDiskSettings } from "@/lib/yandexDisk";
import { YandexDiskSettingsPanel } from "./YandexDiskSettingsPanel";

const DISCONNECTED: YandexDiskSettings = {
	autoUpload: false,
	folder: "Recordings",
	connected: false,
	encryptionAvailable: true,
};

describe("YandexDiskSettingsPanel", () => {
	beforeEach(() => {
		window.electronAPI = {
			saveYandexDiskSettings: vi.fn(),
			disconnectYandexDisk: vi.fn(),
			openExternalUrl: vi.fn(),
		} as unknown as Window["electronAPI"];
	});

	it("does not submit a disconnected integration without a token", async () => {
		const user = userEvent.setup();
		render(
			<YandexDiskSettingsPanel
				open
				settings={DISCONNECTED}
				isRussian={false}
				bottomOffset={68}
				onClose={vi.fn()}
				onSettingsChange={vi.fn()}
			/>,
		);

		await user.click(screen.getByRole("button", { name: "Connect and save" }));

		expect(screen.getByText("Paste a Yandex OAuth token first.")).toBeTruthy();
		expect(window.electronAPI.saveYandexDiskSettings).not.toHaveBeenCalled();
	});

	it("sends the token once and returns only public settings", async () => {
		const user = userEvent.setup();
		const onClose = vi.fn();
		const onSettingsChange = vi.fn();
		const connected: YandexDiskSettings = {
			...DISCONNECTED,
			autoUpload: true,
			folder: "Product demos",
			connected: true,
		};
		vi.mocked(window.electronAPI.saveYandexDiskSettings).mockResolvedValue({
			success: true,
			settings: connected,
		});

		render(
			<YandexDiskSettingsPanel
				open
				settings={DISCONNECTED}
				isRussian={false}
				bottomOffset={68}
				onClose={onClose}
				onSettingsChange={onSettingsChange}
			/>,
		);

		await user.clear(screen.getByLabelText("Folder inside the OpenScreen app folder"));
		await user.type(
			screen.getByLabelText("Folder inside the OpenScreen app folder"),
			"Product demos",
		);
		await user.type(screen.getByLabelText("OAuth token"), "secret-token");
		await user.click(screen.getByLabelText("Upload after every recording"));
		await user.click(screen.getByRole("button", { name: "Connect and save" }));

		expect(window.electronAPI.saveYandexDiskSettings).toHaveBeenCalledWith({
			autoUpload: true,
			folder: "Product demos",
			accessToken: "secret-token",
		});
		expect(onSettingsChange).toHaveBeenCalledWith(connected);
		expect(onClose).toHaveBeenCalledOnce();
	});
});
