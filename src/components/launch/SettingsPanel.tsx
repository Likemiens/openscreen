import { Clapperboard, Film, FolderOpen, Layers3, Power } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import yandexDiskLogo from "@/assets/yandex-disk.svg";
import {
	type AppSettingsView,
	acceleratorFromKeyboardEvent,
	formatAccelerator,
} from "@/lib/appSettings";
import styles from "./hud.module.css";

interface SettingsPanelProps {
	settings: AppSettingsView | null;
	yandexConnected: boolean;
	onSettingsChange: (settings: AppSettingsView) => void;
	onOpenYandexDisk: () => void;
	onOpenPresets: () => void;
	onOpenStudio: () => void;
	onOpenVideo: () => void;
	onQuit: () => void;
}

/** Shows the tail of a long path, which is the part that tells folders apart. */
function shortenPath(value: string, maxLength = 27): string {
	if (value.length <= maxLength) return value;
	return `…${value.slice(value.length - maxLength + 1)}`;
}

function ShortcutField({
	settings,
	onSettingsChange,
}: {
	settings: AppSettingsView;
	onSettingsChange: (settings: AppSettingsView) => void;
}) {
	const [capturing, setCapturing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const buttonRef = useRef<HTMLButtonElement | null>(null);

	// The current hotkey is global: release it while typing so pressing it again (to
	// keep it) is captured here instead of starting a recording.
	useEffect(() => {
		if (!capturing) return;
		window.electronAPI.setShortcutCaptureActive(true);
		return () => window.electronAPI.setShortcutCaptureActive(false);
	}, [capturing]);

	useEffect(() => {
		if (!capturing) return;

		const handleKeyDown = (event: KeyboardEvent) => {
			event.preventDefault();
			event.stopPropagation();
			if (event.key === "Escape") {
				setCapturing(false);
				return;
			}
			const accelerator = acceleratorFromKeyboardEvent(event);
			if (!accelerator) return;

			setCapturing(false);
			void window.electronAPI
				.updateAppSettings({ quickRecordShortcut: accelerator })
				.then((result) => {
					onSettingsChange(result.settings);
					setError(result.success ? null : (result.error ?? "That shortcut is unavailable."));
				});
		};

		// Capture phase, so the panel's own Escape handler does not close it mid-capture.
		window.addEventListener("keydown", handleKeyDown, true);
		return () => window.removeEventListener("keydown", handleKeyDown, true);
	}, [capturing, onSettingsChange]);

	const label = formatAccelerator(settings.activeQuickRecordShortcut, settings.platform);

	return (
		<div>
			<div className={styles.row}>
				<div>
					<div className={styles.rowLabel}>Record shortcut</div>
					<div className={styles.rowHint}>Start or stop from any app.</div>
				</div>
				<button
					ref={buttonRef}
					type="button"
					data-testid="hud-shortcut-field"
					className={`${styles.button} min-w-[112px]`}
					aria-label="Change record shortcut"
					onClick={() => {
						setError(null);
						setCapturing((current) => !current);
					}}
					onBlur={() => setCapturing(false)}
				>
					{capturing ? "Press keys…" : label || "Not set"}
				</button>
			</div>
			{error && <div className={`${styles.rowHint} ${styles.statusError}`}>{error}</div>}
			{!error && !settings.activeQuickRecordShortcut && (
				<div className={`${styles.rowHint} ${styles.statusError}`}>
					No free shortcut was found. Click to choose one.
				</div>
			)}
		</div>
	);
}

/** App-level settings and the less frequent destinations, one level below the bar. */
export function SettingsPanel({
	settings,
	yandexConnected,
	onSettingsChange,
	onOpenYandexDisk,
	onOpenPresets,
	onOpenStudio,
	onOpenVideo,
	onQuit,
}: SettingsPanelProps) {
	const pickFolder = async () => {
		const result = await window.electronAPI.pickSaveFolder();
		onSettingsChange(result.settings);
	};

	const toggleLaunchAtLogin = async () => {
		if (!settings) return;
		const result = await window.electronAPI.updateAppSettings({
			launchAtLogin: !settings.launchAtLogin,
		});
		onSettingsChange(result.settings);
	};

	return (
		<div className="flex w-[340px] flex-col gap-2.5 p-3.5" data-testid="hud-settings-panel">
			{settings && (
				<>
					<div className={styles.row}>
						<div className="min-w-0">
							<div className={styles.rowLabel}>Save clips to</div>
							<button
								type="button"
								className={`${styles.link} ${styles.rowHint} block max-w-full truncate text-left`}
								title={`Open ${settings.resolvedSaveFolder}`}
								onClick={() => void window.electronAPI.openSaveFolder()}
							>
								{shortenPath(settings.resolvedSaveFolder)}
							</button>
						</div>
						<button type="button" className={styles.button} onClick={() => void pickFolder()}>
							<FolderOpen size={13} aria-hidden="true" />
							Change…
						</button>
					</div>

					<ShortcutField settings={settings} onSettingsChange={onSettingsChange} />

					<div className={styles.row}>
						<div>
							<div className={styles.rowLabel}>Launch at login</div>
							<div className={styles.rowHint}>
								{settings.canLaunchAtLogin
									? "Waits in the tray, ready for the shortcut."
									: "Available in the installed app."}
							</div>
						</div>
						<button
							type="button"
							role="switch"
							aria-checked={settings.launchAtLogin}
							aria-label="Launch at login"
							disabled={!settings.canLaunchAtLogin}
							className={`${styles.switch} ${settings.launchAtLogin ? styles.switchOn : ""}`}
							onClick={() => void toggleLaunchAtLogin()}
						/>
					</div>

					<div className={styles.separator} />
				</>
			)}

			<div className="-mx-1.5 flex flex-col">
				<button type="button" className={styles.menuItem} onClick={onOpenYandexDisk}>
					<img
						src={yandexDiskLogo}
						alt=""
						className={`h-[15px] w-[15px] ${yandexConnected ? "" : "opacity-50 grayscale"}`}
					/>
					<span className="flex-1">Yandex Disk</span>
					<span className={styles.caption}>{yandexConnected ? "Connected" : "Not connected"}</span>
				</button>
				<button
					type="button"
					className={styles.menuItem}
					data-testid="launch-recording-recipes-button"
					onClick={onOpenPresets}
				>
					<Layers3 size={15} className={styles.menuItemIcon} aria-hidden="true" />
					<span className="flex-1">Recording presets</span>
				</button>
				<button
					type="button"
					className={styles.menuItem}
					data-testid="launch-open-studio-button"
					onClick={onOpenStudio}
				>
					<Clapperboard size={15} className={styles.menuItemIcon} aria-hidden="true" />
					<span className="flex-1">Open Studio</span>
				</button>
				<button
					type="button"
					className={styles.menuItem}
					data-testid="launch-open-video-button"
					onClick={onOpenVideo}
				>
					<Film size={15} className={styles.menuItemIcon} aria-hidden="true" />
					<span className="flex-1">Edit a video file…</span>
				</button>
				<button type="button" className={styles.menuItem} onClick={onQuit}>
					<Power size={15} className={styles.menuItemIcon} aria-hidden="true" />
					<span className="flex-1">Quit OpenScreen</span>
				</button>
			</div>
		</div>
	);
}
