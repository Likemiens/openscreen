import { Check, ExternalLink, Loader2, LogOut, X } from "lucide-react";
import { forwardRef, useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	DEFAULT_YANDEX_DISK_FOLDER,
	YANDEX_DISK_OAUTH_URL,
	YANDEX_DISK_PUBLIC_FOLDER_URL,
	type YandexDiskSettings,
} from "@/lib/yandexDisk";
import hud from "./hud.module.css";

interface YandexDiskSettingsPanelProps {
	open: boolean;
	settings: YandexDiskSettings | null;
	isRussian: boolean;
	onClose: () => void;
	onSettingsChange: (settings: YandexDiskSettings) => void;
}

const COPY = {
	en: {
		title: "Yandex Disk",
		connected: "Connected",
		disconnected: "Not connected",
		description: "Publish finished videos manually to your shared OpenScreen folder.",
		folder: "Folder in your Yandex Disk root",
		openFolder: "Open shared folder",
		deleteLocal: "Delete the local recording after upload",
		deleteHint:
			"Applies to Studio exports, after Yandex confirms the file. Clips saved to your folder are always kept.",
		token: "OAuth token",
		tokenHint:
			"Use cloud_api:disk.read and cloud_api:disk.write. The token is encrypted by the operating system.",
		getToken: "Get OAuth token",
		save: "Save",
		connect: "Connect and save",
		disconnect: "Disconnect",
		missingToken: "Paste a Yandex OAuth token first.",
		secureStorageUnavailable: "Secure token storage is unavailable on this system.",
	},
	ru: {
		title: "Яндекс Диск",
		connected: "Подключён",
		disconnected: "Не подключён",
		description: "Публикует готовые видео вручную в вашу общую папку OpenScreen.",
		folder: "Папка в корне Яндекс Диска",
		openFolder: "Открыть общую папку",
		deleteLocal: "Удалять локальную запись после загрузки",
		deleteHint:
			"Относится к экспорту из Studio, после проверки файла. Клипы в вашей папке не удаляются.",
		token: "OAuth-токен",
		tokenHint:
			"Выберите cloud_api:disk.read и cloud_api:disk.write. Токен шифруется операционной системой.",
		getToken: "Получить OAuth-токен",
		save: "Сохранить",
		connect: "Подключить и сохранить",
		disconnect: "Отключить",
		missingToken: "Сначала вставьте OAuth-токен Яндекса.",
		secureStorageUnavailable: "На этой системе недоступно безопасное хранение токена.",
	},
} as const;

export const YandexDiskSettingsPanel = forwardRef<HTMLDivElement, YandexDiskSettingsPanelProps>(
	function YandexDiskSettingsPanel({ open, settings, isRussian, onClose, onSettingsChange }, ref) {
		const copy = isRussian ? COPY.ru : COPY.en;
		const [folder, setFolder] = useState(DEFAULT_YANDEX_DISK_FOLDER);
		const [deleteLocalAfterUpload, setDeleteLocalAfterUpload] = useState(true);
		const [accessToken, setAccessToken] = useState("");
		const [pending, setPending] = useState(false);
		const [error, setError] = useState<string | null>(null);
		const fieldId = useId();
		const deleteLocalId = `${fieldId}-delete-local`;
		const folderId = `${fieldId}-folder`;
		const tokenId = `${fieldId}-token`;

		useEffect(() => {
			if (!open || !settings) return;
			setFolder(settings.folder);
			setDeleteLocalAfterUpload(settings.deleteLocalAfterUpload);
			setAccessToken("");
			setError(null);
		}, [open, settings]);

		useEffect(() => {
			if (!open) return;
			const handleKeyDown = (event: KeyboardEvent) => {
				if (event.key === "Escape") onClose();
			};
			window.addEventListener("keydown", handleKeyDown);
			return () => window.removeEventListener("keydown", handleKeyDown);
		}, [onClose, open]);

		if (!open) return null;

		const save = async () => {
			if (!settings) return;
			if (!settings.connected && !accessToken.trim()) {
				setError(copy.missingToken);
				return;
			}
			if (!settings.connected && !settings.encryptionAvailable) {
				setError(copy.secureStorageUnavailable);
				return;
			}

			setPending(true);
			setError(null);
			try {
				const result = await window.electronAPI.saveYandexDiskSettings({
					folder,
					deleteLocalAfterUpload,
					...(accessToken.trim() ? { accessToken: accessToken.trim() } : {}),
				});
				if (!result.success || !result.settings) {
					throw new Error(result.error || "Failed to save Yandex Disk settings.");
				}
				onSettingsChange(result.settings);
				setAccessToken("");
				onClose();
			} catch (saveError) {
				setError(saveError instanceof Error ? saveError.message : String(saveError));
			} finally {
				setPending(false);
			}
		};

		const disconnect = async () => {
			setPending(true);
			setError(null);
			try {
				const result = await window.electronAPI.disconnectYandexDisk();
				if (!result.success || !result.settings) {
					throw new Error(result.error || "Failed to disconnect Yandex Disk.");
				}
				onSettingsChange(result.settings);
				setAccessToken("");
			} catch (disconnectError) {
				setError(
					disconnectError instanceof Error ? disconnectError.message : String(disconnectError),
				);
			} finally {
				setPending(false);
			}
		};

		return (
			<div
				ref={ref}
				data-hud-interactive="true"
				className={`${hud.panel} ${hud.materialize} ${hud.noDrag} w-[360px] p-4 text-white`}
				onPointerDown={(event) => event.stopPropagation()}
			>
				<div className="flex items-start justify-between gap-4">
					<div>
						<div className="flex items-center gap-2">
							<h2 className="text-sm font-semibold">{copy.title}</h2>
							<span
								className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
									settings?.connected
										? "bg-emerald-400/10 text-emerald-300"
										: "bg-white/[0.06] text-white/50"
								}`}
							>
								{settings?.connected ? <Check size={10} /> : null}
								{settings?.connected ? copy.connected : copy.disconnected}
							</span>
						</div>
						<p className="mt-1 text-[11px] leading-relaxed text-white/55">{copy.description}</p>
					</div>
					<button
						type="button"
						aria-label="Close"
						className="rounded-lg p-1 text-white/45 transition-colors hover:bg-white/10 hover:text-white"
						onClick={onClose}
					>
						<X size={15} />
					</button>
				</div>

				<label htmlFor={folderId} className="mt-4 block">
					<span className="text-[10px] font-medium text-white/50">{copy.folder}</span>
					<input
						type="text"
						id={folderId}
						value={folder}
						onChange={(event) => setFolder(event.target.value)}
						className="mt-1 h-8 w-full rounded-lg border border-white/10 bg-black/25 px-2.5 text-[11px] text-white outline-none transition-colors focus:border-emerald-400/50"
						placeholder={DEFAULT_YANDEX_DISK_FOLDER}
					/>
				</label>
				<button
					type="button"
					className="mt-1.5 inline-flex items-center gap-1 text-[9px] font-medium text-emerald-300 hover:text-emerald-200"
					onClick={() => window.electronAPI.openExternalUrl(YANDEX_DISK_PUBLIC_FOLDER_URL)}
				>
					{copy.openFolder}
					<ExternalLink size={9} />
				</button>

				<label
					htmlFor={deleteLocalId}
					className="mt-3 flex items-start justify-between gap-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.05] px-3 py-2.5"
				>
					<span>
						<span className="block text-[11px] font-medium text-amber-100/90">
							{copy.deleteLocal}
						</span>
						<span className="mt-0.5 block text-[9px] leading-relaxed text-white/35">
							{copy.deleteHint}
						</span>
					</span>
					<input
						id={deleteLocalId}
						type="checkbox"
						checked={deleteLocalAfterUpload}
						onChange={(event) => setDeleteLocalAfterUpload(event.target.checked)}
						className="mt-0.5 h-4 w-4 shrink-0 accent-amber-400"
					/>
				</label>

				{!settings?.connected && (
					<div className="mt-3 block">
						<label htmlFor={tokenId} className="text-[10px] font-medium text-white/50">
							{copy.token}
						</label>
						<input
							type="password"
							id={tokenId}
							value={accessToken}
							onChange={(event) => setAccessToken(event.target.value)}
							className="mt-1 h-8 w-full rounded-lg border border-white/10 bg-black/25 px-2.5 text-[11px] text-white outline-none transition-colors focus:border-emerald-400/50"
							autoComplete="off"
						/>
						<div className="mt-1.5 flex items-start justify-between gap-3">
							<p className="text-[9px] leading-relaxed text-white/35">{copy.tokenHint}</p>
							<button
								type="button"
								className="inline-flex shrink-0 items-center gap-1 text-[9px] font-medium text-emerald-300 hover:text-emerald-200"
								onClick={() => window.electronAPI.openExternalUrl(YANDEX_DISK_OAUTH_URL)}
							>
								{copy.getToken}
								<ExternalLink size={9} />
							</button>
						</div>
					</div>
				)}

				{error && (
					<div className="mt-3 rounded-lg border border-red-400/15 bg-red-400/[0.07] px-2.5 py-2 text-[10px] leading-relaxed text-red-200">
						{error}
					</div>
				)}

				<div className="mt-4 flex items-center justify-between gap-2">
					{settings?.connected ? (
						<Button
							type="button"
							variant="ghost"
							size="sm"
							disabled={pending}
							onClick={disconnect}
							className="h-8 gap-1.5 px-2 text-[10px] text-white/55 hover:bg-white/[0.07] hover:text-white"
						>
							<LogOut size={12} />
							{copy.disconnect}
						</Button>
					) : (
						<span />
					)}
					<Button
						type="button"
						size="sm"
						disabled={pending}
						onClick={save}
						className="h-8 min-w-24 bg-white px-3 text-[10px] text-[#10121b] hover:bg-white/90"
					>
						{pending ? <Loader2 size={12} className="animate-spin" /> : null}
						{settings?.connected ? copy.save : copy.connect}
					</Button>
				</div>
			</div>
		);
	},
);
