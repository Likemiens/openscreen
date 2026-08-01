import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { YANDEX_DISK_OAUTH_URL, type YandexDiskSettings } from "@/lib/yandexDisk";
import { YandexDiskSettingsPanel } from "./YandexDiskSettingsPanel";

const DISCONNECTED: YandexDiskSettings = {
	folder: "OpenScreen Exports",
	deleteLocalAfterUpload: true,
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

	it("keeps safe local cleanup enabled and opens the configured OAuth app", async () => {
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

		expect(
			(
				screen.getByRole("checkbox", {
					name: /Delete the local recording after upload/,
				}) as HTMLInputElement
			).checked,
		).toBe(true);
		await user.click(screen.getByRole("button", { name: "Get OAuth token" }));
		expect(window.electronAPI.openExternalUrl).toHaveBeenCalledWith(YANDEX_DISK_OAUTH_URL);
	});

	it("sends the token once and returns only public settings", async () => {
		const user = userEvent.setup();
		const onClose = vi.fn();
		const onSettingsChange = vi.fn();
		const connected: YandexDiskSettings = {
			...DISCONNECTED,
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

		await user.clear(screen.getByLabelText("Folder in your Yandex Disk root"));
		await user.type(screen.getByLabelText("Folder in your Yandex Disk root"), "Product demos");
		await user.type(screen.getByLabelText("OAuth token"), "secret-token");
		await user.click(screen.getByRole("button", { name: "Connect and save" }));

		expect(window.electronAPI.saveYandexDiskSettings).toHaveBeenCalledWith({
			folder: "Product demos",
			deleteLocalAfterUpload: true,
			accessToken: "secret-token",
		});
		expect(onSettingsChange).toHaveBeenCalledWith(connected);
		expect(onClose).toHaveBeenCalledOnce();
	});
});
