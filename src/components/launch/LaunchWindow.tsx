import {
	ChevronDown,
	Ellipsis,
	GripVertical,
	Loader2,
	Mic,
	MicOff,
	Pause,
	Play,
	RotateCcw,
	Trash2,
	Video,
	VideoOff,
	Volume2,
	VolumeX,
	X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useScopedT } from "@/contexts/I18nContext";
import { type ReadyClip, useQuickClip } from "@/hooks/useQuickClip";
import { useRecordingRecipes } from "@/hooks/useRecordingRecipes";
import { type AppSettingsView, formatAccelerator } from "@/lib/appSettings";
import { formatRegionSize } from "@/lib/captureRegion";
import type { CaptureMode } from "@/lib/captureSettings";
import type { ExportQuality, Mp4FrameRate } from "@/lib/exporter";
import type { HudCommand } from "@/lib/quickCaptureContracts";
import { QUALITY_LABELS } from "@/lib/quickClip";
import {
	type RecordingCountdownSeconds,
	type RecordingRecipe,
	type RecordingRecipeSettings,
	recordingRecipeMatchesSettings,
} from "@/lib/recordingRecipes";
import type { YandexDiskSettings } from "@/lib/yandexDisk";
import { nativeBridgeClient } from "@/native";
import { useAudioLevelMeter } from "../../hooks/useAudioLevelMeter";
import { useCameraDevices } from "../../hooks/useCameraDevices";
import { useMicrophoneDevices } from "../../hooks/useMicrophoneDevices";
import { useScreenRecorder } from "../../hooks/useScreenRecorder";
import { requestCameraAccess } from "../../lib/requestCameraAccess";
import { formatTimePadded } from "../../utils/timeUtils";
import { AudioLevelMeter } from "../ui/audio-level-meter";
import { Tooltip } from "../ui/tooltip";
import { CaptureModeControl } from "./CaptureModeControl";
import { ClipCard } from "./ClipCard";
import { FormatPanel } from "./FormatPanel";
import { HudToasts } from "./HudToasts";
import styles from "./hud.module.css";
import { openSourceSelectorWithPermissionRetry } from "./openSourceSelectorFlow";
import { RecordingCompletePanel } from "./RecordingCompletePanel";
import { RecordingRecipePanel } from "./RecordingRecipePanel";
import { SettingsPanel } from "./SettingsPanel";
import { WebcamPreview } from "./WebcamPreview";
import { YandexDiskSettingsPanel } from "./YandexDiskSettingsPanel";

type HudPanel = "format" | "settings" | "yandex" | "presets";

const ICON_SIZE = 17;
const ICON_STROKE = 1.9;

// Transparent margin around the content so shadows never reach the window edge and
// tooltips above the topmost surface have room to render.
const SIDE_MARGIN = 72;
const TOP_MARGIN = 40;
// Distance from the window's bottom edge to the bar; matches the `bottom-6` on the stack.
const STACK_BOTTOM = 24;
const MIN_WIDTH = 220;

const PREVIEW_CLIP: ReadyClip = {
	path: "C:\\Users\\you\\Videos\\OpenScreen\\Checkout flow.mp4",
	title: "Checkout flow",
	sizeBytes: 6_400_000,
	width: 1280,
	height: 720,
	durationSeconds: 14,
	mode: "transcode",
	thumbnail: null,
	share: { status: "idle" },
};

function isHudPanel(value: string | null): value is HudPanel {
	return value === "format" || value === "settings" || value === "yandex" || value === "presets";
}

function sourceKind(source: ProcessedDesktopSource): "window" | "screen" {
	return source.id.startsWith("window:") ? "window" : "screen";
}

/** The floating recorder: pick what to record, record it, and hand over the clip. */
export function LaunchWindow() {
	const t = useScopedT("launch");
	const api = window.electronAPI as Window["electronAPI"] | undefined;
	const isBrowserPreview = !api;
	// Design previews in a plain browser: ?preview=recording|saving|clip|draft&panel=format
	const [preview] = useState(() => {
		const params =
			isBrowserPreview && import.meta.env.DEV ? new URLSearchParams(window.location.search) : null;
		return { state: params?.get("preview") ?? null, panel: params?.get("panel") ?? null };
	});

	const {
		recording,
		paused,
		saving,
		starting,
		elapsedSeconds,
		countdownSeconds,
		setCountdownSeconds,
		captureMode,
		setCaptureMode,
		captureRegion,
		setCaptureRegion,
		defaultExportOptions,
		setDefaultExportOptions,
		toggleRecording,
		togglePaused,
		canPauseRecording,
		restartRecording,
		cancelRecording,
		microphoneEnabled,
		setMicrophoneEnabled,
		microphoneDeviceId,
		setMicrophoneDeviceId,
		microphoneDeviceName,
		setMicrophoneDeviceName,
		systemAudioEnabled,
		setSystemAudioEnabled,
		webcamEnabled,
		setWebcamEnabled,
		webcamDeviceId,
		setWebcamDeviceId,
		webcamDeviceName,
		setWebcamDeviceName,
		cursorCaptureMode,
		setCursorCaptureMode,
		softwareEncoderFallbackNoticeVisible,
		dismissSoftwareEncoderFallbackNotice,
		completedRecording,
		clearCompletedRecording,
		demoteCompletedRecordingToDraft,
		setCompletedRecordingTitle,
		openCompletedRecordingInEditor,
		publishCompletedRecording,
		saveCompletedRecording,
	} = useScreenRecorder();

	const { recipes, selectedRecipe, selectRecipe, saveCurrentAsRecipe, deleteRecipe } =
		useRecordingRecipes();

	const [openPanel, setOpenPanel] = useState<HudPanel | null>(
		isHudPanel(preview.panel) ? preview.panel : null,
	);
	const [appSettings, setAppSettings] = useState<AppSettingsView | null>(null);
	const [yandexDiskSettings, setYandexDiskSettings] = useState<YandexDiskSettings | null>(() =>
		preview.state
			? {
					folder: "OpenScreen Exports",
					deleteLocalAfterUpload: true,
					connected: true,
					encryptionAvailable: true,
				}
			: null,
	);
	const [supportsCursorModeToggle, setSupportsCursorModeToggle] = useState(false);
	const [isLinuxHud, setIsLinuxHud] = useState(false);

	const quickClip = useQuickClip({
		draft: completedRecording,
		onConsumed: clearCompletedRecording,
		onFallbackToDraft: demoteCompletedRecordingToDraft,
	});
	const readyClip =
		quickClip.state.status === "ready"
			? quickClip.state.clip
			: preview.state === "clip"
				? PREVIEW_CLIP
				: null;
	// A quick-clip draft exists for an instant before its save begins; count it as saving
	// so the bar goes straight from recording to "Saving" without flashing idle.
	const clipSaving =
		quickClip.state.status === "saving" ||
		Boolean(completedRecording?.quickClip) ||
		preview.state === "saving";
	const clipProgress =
		quickClip.state.status === "saving"
			? quickClip.state.progress
			: preview.state === "saving"
				? 0.42
				: null;
	const busy = saving || clipSaving;
	const draft = completedRecording && !completedRecording.quickClip ? completedRecording : null;
	const isAreaMode = captureMode === "area";

	const showDeviceTray = !recording && !busy && openPanel === null;
	const showMicControls = microphoneEnabled && showDeviceTray;
	const showWebcamControls = webcamEnabled && !isAreaMode && showDeviceTray;

	const {
		devices: micDevices,
		selectedDeviceId: selectedMicId,
		setSelectedDeviceId: setSelectedMicId,
	} = useMicrophoneDevices(microphoneEnabled);
	const {
		devices: cameraDevices,
		selectedDeviceId: selectedCameraId,
		setSelectedDeviceId: setSelectedCameraId,
		isLoading: isCameraDevicesLoading,
		error: cameraDevicesError,
	} = useCameraDevices(webcamEnabled);

	const selectedMicLabel =
		micDevices.find((d) => d.deviceId === (microphoneDeviceId || selectedMicId))?.label ||
		t("audio.defaultMicrophone");
	const selectedCameraDevice = cameraDevices.find(
		(d) => d.deviceId === (webcamDeviceId || selectedCameraId),
	);
	const selectedCameraLabel = isCameraDevicesLoading
		? t("webcam.searching")
		: cameraDevicesError
			? t("webcam.unavailable")
			: cameraDevices.length === 0
				? t("webcam.noneFound")
				: selectedCameraDevice?.label || t("webcam.defaultCamera");

	const { level } = useAudioLevelMeter({
		enabled: showMicControls,
		deviceId: microphoneDeviceId,
	});

	useEffect(() => {
		if (selectedMicId && selectedMicId !== "default") {
			setMicrophoneDeviceId(selectedMicId);
			setMicrophoneDeviceName(micDevices.find((d) => d.deviceId === selectedMicId)?.label);
		}
	}, [selectedMicId, micDevices, setMicrophoneDeviceId, setMicrophoneDeviceName]);

	useEffect(() => {
		if (selectedCameraId) {
			setWebcamDeviceId(selectedCameraId);
			setWebcamDeviceName(cameraDevices.find((d) => d.deviceId === selectedCameraId)?.label);
		}
	}, [selectedCameraId, cameraDevices, setWebcamDeviceId, setWebcamDeviceName]);

	useEffect(() => {
		let cancelled = false;
		nativeBridgeClient.system
			.getPlatform()
			.then((platform) => {
				if (!cancelled) {
					setSupportsCursorModeToggle(platform === "win32" || platform === "darwin");
					setIsLinuxHud(platform === "linux");
				}
			})
			.catch(() => {
				if (!cancelled) {
					setSupportsCursorModeToggle(false);
					setIsLinuxHud(false);
				}
			});

		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		let cancelled = false;
		void window.electronAPI
			?.getYandexDiskSettings?.()
			.then((result) => {
				if (!cancelled && result.success && result.settings) {
					setYandexDiskSettings(result.settings);
				}
			})
			.catch((error) => console.warn("Failed to load Yandex Disk settings:", error));
		void window.electronAPI
			?.getAppSettings?.()
			.then((settings) => {
				if (!cancelled) setAppSettings(settings);
			})
			.catch((error) => console.warn("Failed to load app settings:", error));
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		if (!import.meta.env.DEV) {
			return;
		}

		void requestCameraAccess().catch((error) => {
			console.warn("Failed to trigger camera access request during development:", error);
		});
	}, []);

	// --- Window size ---------------------------------------------------------------
	// The overlay window is resized to fit its content. Everything visible lives in one
	// bottom-anchored stack, so a single measurement is authoritative; the main process
	// keeps the window's bottom-centre fixed, which keeps the bar still while it grows.
	const stackRef = useRef<HTMLDivElement | null>(null);
	const lastHudSizeRef = useRef({ width: 0, height: 0 });
	const isDraggingHudRef = useRef(false);
	const measureHudSize = useCallback(() => {
		const stack = stackRef.current;
		if (!stack || !window.electronAPI?.setHudOverlaySize) return;
		// A resize re-centres the window from its bottom-centre, which would fight the
		// position the drag is applying frame by frame. Re-measure once the drag ends.
		if (isDraggingHudRef.current) return;

		const width = Math.max(MIN_WIDTH, Math.ceil(stack.scrollWidth) + SIDE_MARGIN);
		const height = Math.ceil(stack.scrollHeight) + STACK_BOTTOM + TOP_MARGIN;
		if (width === lastHudSizeRef.current.width && height === lastHudSizeRef.current.height) {
			return;
		}
		lastHudSizeRef.current = { width, height };
		window.electronAPI.setHudOverlaySize(width, height);
	}, []);

	useEffect(() => {
		const observer = new ResizeObserver(() => measureHudSize());
		if (stackRef.current) observer.observe(stackRef.current);
		measureHudSize();
		return () => observer.disconnect();
	}, [measureHudSize]);

	// --- Click-through -------------------------------------------------------------
	// The window is transparent and ignores the mouse except over its own surfaces, so
	// the desktop underneath stays usable.
	const hudIgnoreMouseEventsRef = useRef<boolean | undefined>(undefined);
	const setHudMouseEventsEnabled = useCallback(
		(enabled: boolean) => {
			const shouldIgnoreMouseEvents = !enabled && !isLinuxHud;
			if (hudIgnoreMouseEventsRef.current === shouldIgnoreMouseEvents) {
				return;
			}
			hudIgnoreMouseEventsRef.current = shouldIgnoreMouseEvents;
			window.electronAPI?.setHudOverlayIgnoreMouseEvents?.(shouldIgnoreMouseEvents);
		},
		[isLinuxHud],
	);

	useEffect(() => {
		setHudMouseEventsEnabled(false);
		return () => {
			window.electronAPI?.setHudOverlayIgnoreMouseEvents?.(false);
		};
	}, [setHudMouseEventsEnabled]);

	// An open panel keeps the whole window interactive so a click beside it can close it.
	useEffect(() => {
		setHudMouseEventsEnabled(openPanel !== null);
	}, [openPanel, setHudMouseEventsEnabled]);

	useEffect(() => {
		if (openPanel !== "format" && openPanel !== "settings") return;
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") setOpenPanel(null);
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [openPanel]);

	const surfaceProps = {
		"data-hud-interactive": "true",
		onPointerEnter: () => setHudMouseEventsEnabled(true),
	} as const;

	// --- Capture target ------------------------------------------------------------
	const defaultSourceName = t("sourceSelector.defaultSourceName");
	const [selectedSource, setSelectedSource] = useState(defaultSourceName);
	const [selectedSourceDetails, setSelectedSourceDetails] = useState<ProcessedDesktopSource | null>(
		null,
	);
	const recordAfterSourceSelectionRef = useRef(false);
	const areaPickInFlightRef = useRef(false);
	const pendingAreaRecordRef = useRef(false);

	// Handlers registered once read the latest state through refs.
	const toggleRecordingRef = useRef(toggleRecording);
	toggleRecordingRef.current = toggleRecording;
	const captureModeRef = useRef(captureMode);
	captureModeRef.current = captureMode;
	const captureRegionRef = useRef(captureRegion);
	captureRegionRef.current = captureRegion;
	const busyRef = useRef(false);
	busyRef.current = busy || recording || starting;

	const applySelectedSource = useCallback(
		(source: ProcessedDesktopSource | null) => {
			setSelectedSourceDetails((current) => {
				if (
					current?.id === source?.id &&
					current?.name === source?.name &&
					current?.display_id === source?.display_id
				) {
					return current;
				}
				return source;
			});
			setSelectedSource(source ? source.name : defaultSourceName);
		},
		[defaultSourceName],
	);

	useEffect(() => {
		const checkSelectedSource = async () => {
			if (!window.electronAPI) {
				return;
			}

			try {
				const source = await window.electronAPI.getSelectedSource();
				applySelectedSource(source);
			} catch (error) {
				console.warn("Failed to refresh selected source:", error);
			}
		};

		// Selection changes are pushed by the main process; this covers the first paint
		// and returning to a HUD that was hidden while something else changed it.
		void checkSelectedSource();
		const handleVisibility = () => {
			if (document.visibilityState === "visible") void checkSelectedSource();
		};
		document.addEventListener("visibilitychange", handleVisibility);
		return () => document.removeEventListener("visibilitychange", handleVisibility);
	}, [applySelectedSource]);

	useEffect(() => {
		const cleanupSourceChanged = window.electronAPI?.onSelectedSourceChanged?.((source) => {
			applySelectedSource(source);
			// Picking a window or screen switches the mode to match. An area capture also
			// selects a screen (the one it sits on), which must not leave area mode.
			if (source && !areaPickInFlightRef.current && captureModeRef.current !== "area") {
				setCaptureMode(sourceKind(source));
			}
			if (!recordAfterSourceSelectionRef.current || recording) {
				return;
			}

			recordAfterSourceSelectionRef.current = false;
			toggleRecording();
		});
		const cleanupSelectorClosed = window.electronAPI?.onSourceSelectorClosed?.(() => {
			recordAfterSourceSelectionRef.current = false;
		});

		return () => {
			cleanupSourceChanged?.();
			cleanupSelectorClosed?.();
		};
	}, [applySelectedSource, recording, setCaptureMode, toggleRecording]);

	const matchingSource =
		!isAreaMode && selectedSourceDetails && sourceKind(selectedSourceDetails) === captureMode
			? selectedSourceDetails
			: null;
	const captureDetail = isAreaMode
		? captureRegion
			? formatRegionSize(captureRegion)
			: null
		: (matchingSource?.name ?? null);

	const openSourceSelector = useCallback(async (tab?: "screens" | "windows") => {
		if (window.electronAPI) {
			return await openSourceSelectorWithPermissionRetry({
				openSourceSelector: () => window.electronAPI.openSourceSelector(tab),
				requestScreenAccess: () => window.electronAPI.requestScreenAccess(),
			});
		}

		return { opened: false, reason: "electron-api-unavailable" };
	}, []);

	/** Asks for a window or screen. Resolves to whether a selection is under way. */
	const requestSource = useCallback(
		async (mode: "window" | "screen") => {
			if (mode === "screen") {
				// With a single display there is nothing to pick.
				const selection = await window.electronAPI?.selectScreenSource?.();
				if (selection?.selected) return true;
			}
			const result = await openSourceSelector(mode === "window" ? "windows" : "screens");
			return result.opened;
		},
		[openSourceSelector],
	);

	const pickArea = useCallback(async () => {
		if (!window.electronAPI?.openRegionSelector || areaPickInFlightRef.current) return;
		areaPickInFlightRef.current = true;
		try {
			const result = await window.electronAPI.openRegionSelector(captureRegionRef.current);
			if (result.canceled) return;
			setCaptureMode("area");
			setCaptureRegion(result.region);
			pendingAreaRecordRef.current = result.startRecording;
		} catch (error) {
			console.warn("Failed to select an area:", error);
			toast.error("Could not open the area picker.");
		} finally {
			areaPickInFlightRef.current = false;
		}
	}, [setCaptureMode, setCaptureRegion]);

	// Start the recording requested from the area picker once the picked area has
	// actually become the recorder's state. (Area mode itself turns the camera track
	// and the editable cursor off inside the recorder; see resolveEffectiveCapture.)
	useEffect(() => {
		if (!pendingAreaRecordRef.current) return;
		if (!isAreaMode || !captureRegion) return;
		pendingAreaRecordRef.current = false;
		toggleRecordingRef.current();
	}, [captureRegion, isAreaMode]);

	const handleModeSelect = (mode: CaptureMode) => {
		if (recording || busy || starting) return;
		setOpenPanel(null);
		setCaptureMode(mode);
		if (mode === "area") {
			void pickArea();
			return;
		}
		recordAfterSourceSelectionRef.current = false;
		void requestSource(mode).catch((error) => {
			console.warn("Failed to open the source picker:", error);
		});
	};

	const handleRecordButtonClick = () => {
		if (busy || starting) {
			return;
		}
		if (recording) {
			toggleRecording();
			return;
		}
		setOpenPanel(null);
		if (isAreaMode) {
			// Always through the picker: it shows the remembered area, ready to confirm.
			void pickArea();
			return;
		}
		if (!matchingSource) {
			recordAfterSourceSelectionRef.current = true;
			void requestSource(captureMode)
				.then((selecting) => {
					if (!selecting) {
						recordAfterSourceSelectionRef.current = false;
					}
				})
				.catch(() => {
					recordAfterSourceSelectionRef.current = false;
				});
			return;
		}

		toggleRecording();
	};

	// --- Commands from the tray and the global record hotkey ------------------------
	const handleHudCommand = async (command: HudCommand) => {
		if (busyRef.current || !window.electronAPI) return;
		setOpenPanel(null);

		if (command === "record-area" || captureModeRef.current === "area") {
			// The area picker covers the screen, so the HUD stays out of the way until
			// the area is confirmed.
			await pickArea();
			return;
		}

		window.electronAPI.showHudOverlay();
		const mode = captureModeRef.current;
		// The HUD may have just been created: ask the main process, not stale state.
		const current = await window.electronAPI.getSelectedSource().catch(() => null);
		applySelectedSource(current);
		if (current && sourceKind(current) === mode) {
			toggleRecordingRef.current();
			return;
		}
		recordAfterSourceSelectionRef.current = true;
		const selecting = await requestSource(mode).catch(() => false);
		if (!selecting) recordAfterSourceSelectionRef.current = false;
	};
	const handleHudCommandRef = useRef(handleHudCommand);
	handleHudCommandRef.current = handleHudCommand;

	useEffect(() => {
		if (!window.electronAPI?.onHudCommand) return;
		const cleanup = window.electronAPI.onHudCommand((command) => {
			void handleHudCommandRef.current(command);
		});
		// Anything requested while this window was still loading is waiting in the queue.
		void window.electronAPI.consumePendingHudCommand().then((command) => {
			if (command) void handleHudCommandRef.current(command);
		});
		return cleanup;
	}, []);

	// --- Presets -------------------------------------------------------------------
	const currentRecipeSettings: RecordingRecipeSettings = {
		microphone: {
			enabled: microphoneEnabled,
			...(microphoneDeviceId ? { deviceId: microphoneDeviceId } : {}),
			...(microphoneDeviceName ? { deviceName: microphoneDeviceName } : {}),
		},
		webcam: {
			enabled: webcamEnabled,
			...(webcamDeviceId ? { deviceId: webcamDeviceId } : {}),
			...(webcamDeviceName ? { deviceName: webcamDeviceName } : {}),
		},
		systemAudioEnabled,
		cursorCaptureMode,
		countdownSeconds,
		exportQuality: defaultExportOptions.quality,
		frameRate: defaultExportOptions.frameRate,
		...(selectedSourceDetails
			? {
					source: {
						id: selectedSourceDetails.id,
						name: selectedSourceDetails.name,
						displayId: selectedSourceDetails.display_id,
						kind: sourceKind(selectedSourceDetails),
					},
				}
			: {}),
	};
	const selectedRecipeModified = selectedRecipe
		? !recordingRecipeMatchesSettings(selectedRecipe, currentRecipeSettings)
		: false;

	const restoreRecipeSource = useCallback(async (recipe: RecordingRecipe) => {
		const storedSource = recipe.settings.source;
		if (!storedSource || !window.electronAPI?.getSources) return;

		try {
			const sources = await window.electronAPI.getSources({
				types: ["screen", "window"],
				thumbnailSize: { width: 0, height: 0 },
				fetchWindowIcons: true,
			});
			const match =
				sources.find((source) => source.id === storedSource.id) ??
				sources.find(
					(source) => sourceKind(source) === storedSource.kind && source.name === storedSource.name,
				);
			if (!match) {
				toast.warning(`Source “${storedSource.name}” is unavailable. Choose another source.`);
				return;
			}
			await window.electronAPI.selectSource(match);
		} catch (error) {
			console.warn("Failed to restore recording recipe source:", error);
			toast.warning("The saved source is unavailable. Your current source was kept.");
		}
	}, []);

	const applyRecordingRecipe = useCallback(
		async (recipe: RecordingRecipe) => {
			const { settings } = recipe;
			setMicrophoneDeviceId(settings.microphone.deviceId);
			setMicrophoneDeviceName(settings.microphone.deviceName);
			if (settings.microphone.deviceId) {
				setSelectedMicId(settings.microphone.deviceId);
			}
			setMicrophoneEnabled(settings.microphone.enabled);

			setWebcamDeviceId(settings.webcam.deviceId);
			setWebcamDeviceName(settings.webcam.deviceName);
			if (settings.webcam.deviceId) {
				setSelectedCameraId(settings.webcam.deviceId);
			}
			const webcamUpdate = setWebcamEnabled(settings.webcam.enabled);

			setSystemAudioEnabled(settings.systemAudioEnabled);
			setCursorCaptureMode(settings.cursorCaptureMode);
			setCountdownSeconds(settings.countdownSeconds);
			setDefaultExportOptions({
				quality: settings.exportQuality,
				frameRate: settings.frameRate,
			});
			await Promise.all([webcamUpdate, restoreRecipeSource(recipe)]);
			selectRecipe(recipe.id);
			setOpenPanel(null);
		},
		[
			restoreRecipeSource,
			selectRecipe,
			setCountdownSeconds,
			setCursorCaptureMode,
			setDefaultExportOptions,
			setMicrophoneDeviceId,
			setMicrophoneDeviceName,
			setMicrophoneEnabled,
			setSelectedCameraId,
			setSelectedMicId,
			setSystemAudioEnabled,
			setWebcamDeviceId,
			setWebcamDeviceName,
			setWebcamEnabled,
		],
	);

	const changeCountdown = (value: RecordingCountdownSeconds) => setCountdownSeconds(value);
	const changeQuality = (value: ExportQuality) =>
		setDefaultExportOptions({ ...defaultExportOptions, quality: value });
	const changeFrameRate = (value: Mp4FrameRate) =>
		setDefaultExportOptions({ ...defaultExportOptions, frameRate: value });

	/** Picks any video on disk and opens it in Studio (to crop it, frame it, export it). */
	const openVideoInStudio = async () => {
		const api = window.electronAPI;
		if (!api) return;
		const picked = await api.openVideoFilePicker();
		if (picked.canceled || !picked.success || !picked.path) return;
		const selected = await api.setCurrentVideoPath(picked.path);
		if (!selected.success) {
			toast.error("Could not open that video.");
			return;
		}
		await api.switchToEditor();
	};

	const togglePanel = (panel: HudPanel) =>
		setOpenPanel((current) => (current === panel ? null : panel));

	// --- Dragging the HUD -----------------------------------------------------------
	const dragLastPositionRef = useRef<{ x: number; y: number } | null>(null);
	const dragAnimationFrameRef = useRef<number | null>(null);
	const pendingDragDeltaRef = useRef({ x: 0, y: 0 });
	const flushHudDragMove = useCallback(() => {
		dragAnimationFrameRef.current = null;
		const { x, y } = pendingDragDeltaRef.current;
		pendingDragDeltaRef.current = { x: 0, y: 0 };
		if (x === 0 && y === 0) return;
		window.electronAPI?.moveHudOverlayBy?.(x, y);
	}, []);
	const scheduleHudDragMove = useCallback(
		(deltaX: number, deltaY: number) => {
			pendingDragDeltaRef.current = {
				x: pendingDragDeltaRef.current.x + deltaX,
				y: pendingDragDeltaRef.current.y + deltaY,
			};

			if (dragAnimationFrameRef.current === null) {
				dragAnimationFrameRef.current = window.requestAnimationFrame(flushHudDragMove);
			}
		},
		[flushHudDragMove],
	);
	const flushPendingHudDragMove = useCallback(() => {
		if (dragAnimationFrameRef.current !== null) {
			window.cancelAnimationFrame(dragAnimationFrameRef.current);
			dragAnimationFrameRef.current = null;
		}
		const { x, y } = pendingDragDeltaRef.current;
		pendingDragDeltaRef.current = { x: 0, y: 0 };
		if (x === 0 && y === 0) return;
		window.electronAPI?.moveHudOverlayBy?.(x, y);
	}, []);
	useEffect(() => {
		return () => {
			if (dragAnimationFrameRef.current !== null) {
				window.cancelAnimationFrame(dragAnimationFrameRef.current);
			}
		};
	}, []);
	const handleHudDragPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
		event.preventDefault();
		event.stopPropagation();
		setHudMouseEventsEnabled(true);
		event.currentTarget.setPointerCapture(event.pointerId);
		dragLastPositionRef.current = { x: event.screenX, y: event.screenY };
		isDraggingHudRef.current = true;
	};
	const handleHudDragPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
		const lastPosition = dragLastPositionRef.current;
		if (!lastPosition) return;
		const deltaX = event.screenX - lastPosition.x;
		const deltaY = event.screenY - lastPosition.y;
		dragLastPositionRef.current = { x: event.screenX, y: event.screenY };
		scheduleHudDragMove(deltaX, deltaY);
	};
	const handleHudDragPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
		dragLastPositionRef.current = null;
		flushPendingHudDragMove();
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
		setHudMouseEventsEnabled(openPanel !== null);
		isDraggingHudRef.current = false;
		measureHudSize();
	};

	// --- Labels --------------------------------------------------------------------
	const recordShortcutLabel = appSettings
		? formatAccelerator(appSettings.activeQuickRecordShortcut, appSettings.platform)
		: "";
	const recordTargetLabel = isAreaMode
		? captureRegion
			? `Record area · ${formatRegionSize(captureRegion)}`
			: "Select an area to record"
		: matchingSource
			? selectedSource
			: t("recording.selectSource");
	const recordButtonLabel = busy
		? t("recording.saving")
		: recording
			? "Stop recording"
			: recordTargetLabel;
	const formatLabel = `${QUALITY_LABELS[defaultExportOptions.quality]} · ${defaultExportOptions.frameRate}`;

	const withShortcut = (label: string) =>
		recordShortcutLabel ? (
			<span className="flex items-center gap-2">
				{label}
				<kbd className={styles.kbd}>{recordShortcutLabel}</kbd>
			</span>
		) : (
			label
		);

	const dragHandle = (
		<div
			data-testid="hud-drag-handle"
			aria-hidden="true"
			className={`${styles.dragHandle} ${styles.noDrag}`}
			onPointerDown={handleHudDragPointerDown}
			onPointerMove={handleHudDragPointerMove}
			onPointerUp={handleHudDragPointerEnd}
			onPointerCancel={handleHudDragPointerEnd}
		>
			<GripVertical size={14} strokeWidth={ICON_STROKE} />
		</div>
	);

	return (
		// Avoid w-screen/h-screen: 100vw can exceed the inner layout width when scrollbars
		// affect the viewport (Windows), causing a horizontal scrollbar (issue #305).
		<div
			className={`${styles.root} h-full w-full min-w-0 max-w-full overflow-hidden ${
				isBrowserPreview
					? "bg-[radial-gradient(circle_at_20%_15%,#7aa7ff_0%,#4f6bd9_38%,#1c2452_100%)]"
					: "bg-transparent"
			}`}
			onPointerMove={(event) => {
				const target = event.target as HTMLElement | null;
				setHudMouseEventsEnabled(
					openPanel !== null ||
						isDraggingHudRef.current ||
						Boolean(target?.closest("[data-hud-interactive='true']")),
				);
			}}
			onPointerLeave={() => {
				if (openPanel === null && !isDraggingHudRef.current) {
					setHudMouseEventsEnabled(false);
				}
			}}
			onPointerDown={(event) => {
				// A click on the empty window area dismisses whatever panel is open.
				const target = event.target as HTMLElement | null;
				if (openPanel !== null && !target?.closest("[data-hud-interactive='true']")) {
					setOpenPanel(null);
				}
			}}
		>
			<div
				ref={stackRef}
				data-hud-stack="true"
				className="fixed bottom-6 left-1/2 flex w-max -translate-x-1/2 flex-col items-center gap-2.5"
			>
				<HudToasts />

				{softwareEncoderFallbackNoticeVisible && (
					<div
						{...surfaceProps}
						className={`${styles.panel} ${styles.materialize} ${styles.noDrag} w-[420px] p-3.5`}
					>
						<div className={styles.title}>{t("softwareEncoderFallback.title")}</div>
						<div className={`${styles.caption} mt-1 leading-relaxed`}>
							{t("softwareEncoderFallback.description")}
						</div>
						<div className="mt-3 flex items-center justify-end gap-1.5">
							<button
								type="button"
								className={`${styles.button} ${styles.buttonGhost}`}
								onClick={() => dismissSoftwareEncoderFallbackNotice(true)}
							>
								{t("softwareEncoderFallback.dontShowAgain")}
							</button>
							<button
								type="button"
								className={styles.button}
								onClick={() => dismissSoftwareEncoderFallbackNotice()}
							>
								{t("softwareEncoderFallback.dismiss")}
							</button>
						</div>
					</div>
				)}

				{openPanel === "presets" && (
					<div {...surfaceProps} className={styles.noDrag}>
						<RecordingRecipePanel
							recipes={recipes}
							selectedRecipe={selectedRecipe}
							modified={selectedRecipeModified}
							currentSettings={currentRecipeSettings}
							onApply={(recipe) => void applyRecordingRecipe(recipe)}
							onSave={(name) => saveCurrentAsRecipe(name, currentRecipeSettings)}
							onDelete={deleteRecipe}
							onChangeCountdown={changeCountdown}
							onChangeExportQuality={changeQuality}
							onChangeFrameRate={changeFrameRate}
							onClose={() => setOpenPanel(null)}
						/>
					</div>
				)}

				<YandexDiskSettingsPanel
					open={openPanel === "yandex"}
					settings={yandexDiskSettings}
					isRussian={false}
					onClose={() => setOpenPanel(null)}
					onSettingsChange={setYandexDiskSettings}
				/>

				{openPanel === "format" && (
					<div
						{...surfaceProps}
						className={`${styles.panel} ${styles.materialize} ${styles.noDrag}`}
					>
						<FormatPanel
							quality={defaultExportOptions.quality}
							frameRate={defaultExportOptions.frameRate}
							countdownSeconds={countdownSeconds}
							cursorCaptureMode={cursorCaptureMode}
							supportsCursorMode={supportsCursorModeToggle}
							cursorModeLocked={isAreaMode}
							onQualityChange={changeQuality}
							onFrameRateChange={changeFrameRate}
							onCountdownChange={changeCountdown}
							onCursorCaptureModeChange={setCursorCaptureMode}
						/>
					</div>
				)}

				{openPanel === "settings" && (
					<div
						{...surfaceProps}
						className={`${styles.panel} ${styles.materialize} ${styles.noDrag}`}
					>
						<SettingsPanel
							settings={appSettings}
							yandexConnected={Boolean(yandexDiskSettings?.connected)}
							onSettingsChange={setAppSettings}
							onOpenYandexDisk={() => setOpenPanel("yandex")}
							onOpenPresets={() => setOpenPanel("presets")}
							onOpenStudio={() => void window.electronAPI?.switchToEditor()}
							onOpenVideo={() => void openVideoInStudio()}
							onQuit={() => window.electronAPI?.quitApp()}
						/>
					</div>
				)}

				{(showMicControls || showWebcamControls) && (
					<div {...surfaceProps} className={`flex items-end gap-2 ${styles.noDrag}`}>
						{showMicControls && (
							<div
								className={`${styles.panel} ${styles.materialize} flex h-10 w-[250px] items-center gap-2.5 rounded-xl px-2.5`}
							>
								<AudioLevelMeter level={level} className="h-4 w-9 flex-none" />
								<div className="relative min-w-0 flex-1">
									<select
										aria-label="Microphone"
										value={microphoneDeviceId || selectedMicId}
										onChange={(e) => {
											const selectedDevice = micDevices.find((d) => d.deviceId === e.target.value);
											setSelectedMicId(e.target.value);
											setMicrophoneDeviceId(e.target.value);
											setMicrophoneDeviceName(selectedDevice?.label);
										}}
										className={`${styles.field} h-7 appearance-none truncate pr-6`}
									>
										{micDevices.map((device) => (
											<option
												key={device.deviceId}
												value={device.deviceId}
												className="bg-[#2c2c2e]"
											>
												{device.label}
											</option>
										))}
									</select>
									<ChevronDown
										size={12}
										className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-white/45"
									/>
								</div>
							</div>
						)}

						{showWebcamControls && (
							<div className={`${styles.panel} ${styles.materialize} w-[220px] rounded-2xl p-2`}>
								<WebcamPreview deviceId={webcamDeviceId || selectedCameraId} />
								<div className="relative mt-2">
									{isCameraDevicesLoading || cameraDevicesError || cameraDevices.length === 0 ? (
										<div className={`${styles.caption} flex h-7 items-center truncate px-2`}>
											{selectedCameraLabel}
										</div>
									) : (
										<>
											<select
												aria-label="Camera"
												value={webcamDeviceId || selectedCameraId}
												onChange={(event) => {
													const device = cameraDevices.find(
														(item) => item.deviceId === event.target.value,
													);
													setSelectedCameraId(event.target.value);
													setWebcamDeviceId(event.target.value);
													setWebcamDeviceName(device?.label);
												}}
												className={`${styles.field} h-7 appearance-none truncate pr-6`}
											>
												{cameraDevices.map((device) => (
													<option
														key={device.deviceId}
														value={device.deviceId}
														className="bg-[#2c2c2e]"
													>
														{device.label}
													</option>
												))}
											</select>
											<ChevronDown
												size={12}
												className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-white/45"
											/>
										</>
									)}
								</div>
							</div>
						)}
					</div>
				)}

				{draft && !recording && (
					<div
						{...surfaceProps}
						className={`${styles.panel} ${styles.materialize} ${styles.noDrag}`}
					>
						<RecordingCompletePanel
							draft={draft}
							yandexConnected={Boolean(yandexDiskSettings?.connected)}
							onTitleChange={setCompletedRecordingTitle}
							onPublish={(options) => void publishCompletedRecording(options)}
							onSaveAnywhere={(options) => void saveCompletedRecording(options)}
							onOpenEditor={(options) => void openCompletedRecordingInEditor(options)}
							onConfigureYandex={() => setOpenPanel("yandex")}
							onDismiss={clearCompletedRecording}
						/>
					</div>
				)}

				{readyClip && !recording && !clipSaving && (
					<div {...surfaceProps} className={styles.noDrag}>
						<ClipCard
							clip={readyClip}
							yandexConnected={Boolean(yandexDiskSettings?.connected)}
							onRename={(title) => void quickClip.renameClip(title)}
							onShare={() => void quickClip.shareClip()}
							onConnectYandex={() => setOpenPanel("yandex")}
							onCopyFile={quickClip.copyClipFile}
							onReveal={quickClip.revealClip}
							onStartDrag={quickClip.startClipDrag}
							onOpenStudio={() => void quickClip.openClipInStudio()}
							onDelete={() => void quickClip.deleteClip()}
							onDismiss={quickClip.dismissClip}
							onOpenLink={(url) => void window.electronAPI?.openExternalUrl(url)}
						/>
					</div>
				)}

				{/* The bar: always the bottom of the stack, so it never moves as panels come and go. */}
				<div
					{...surfaceProps}
					data-testid="hud-toolbar"
					data-hud-state={recording ? "recording" : busy ? "saving" : "idle"}
					className={`${styles.bar} ${styles.noDrag} relative`}
					onPointerDown={() => setHudMouseEventsEnabled(true)}
					onMouseEnter={() => setHudMouseEventsEnabled(true)}
					onMouseLeave={() => {
						if (openPanel === null && !isDraggingHudRef.current) {
							setHudMouseEventsEnabled(false);
						}
					}}
				>
					{dragHandle}

					{recording ? (
						<>
							<div className="flex items-center gap-2.5 pl-1 pr-1.5">
								<span
									className={`${styles.liveDot} ${paused ? styles.liveDotPaused : ""}`}
									aria-hidden="true"
								/>
								<span className={styles.timer} role="timer" aria-label="Recording time">
									{formatTimePadded(elapsedSeconds)}
								</span>
							</div>
							<span className={styles.divider} />
							{canPauseRecording && (
								<Tooltip
									content={paused ? t("tooltips.resumeRecording") : t("tooltips.pauseRecording")}
								>
									<button
										type="button"
										aria-label={paused ? "Resume" : "Pause"}
										className={styles.control}
										onClick={() => togglePaused()}
									>
										{paused ? (
											<Play size={ICON_SIZE} strokeWidth={ICON_STROKE} />
										) : (
											<Pause size={ICON_SIZE} strokeWidth={ICON_STROKE} />
										)}
									</button>
								</Tooltip>
							)}
							<Tooltip content={t("tooltips.restartRecording")}>
								<button
									type="button"
									aria-label="Restart"
									className={styles.control}
									onClick={() => restartRecording()}
								>
									<RotateCcw size={ICON_SIZE} strokeWidth={ICON_STROKE} />
								</button>
							</Tooltip>
							<Tooltip content={t("tooltips.cancelRecording")}>
								<button
									type="button"
									aria-label="Delete"
									className={styles.control}
									onClick={() => cancelRecording()}
								>
									<Trash2 size={ICON_SIZE} strokeWidth={ICON_STROKE} />
								</button>
							</Tooltip>
							<button
								type="button"
								data-testid="launch-record-button"
								className={`${styles.recordButton} ml-0.5`}
								onClick={handleRecordButtonClick}
								aria-label={recordButtonLabel}
							>
								<span className={styles.stopGlyph} aria-hidden="true" />
								Stop
								{recordShortcutLabel && (
									<kbd className={styles.shortcutHint}>{recordShortcutLabel}</kbd>
								)}
							</button>
						</>
					) : busy ? (
						<>
							<div className="flex min-w-[220px] items-center gap-2.5 pl-1 pr-3">
								<Loader2 size={15} className={styles.spinner} aria-hidden="true" />
								<span className="font-medium" role="status">
									{clipSaving ? "Saving clip" : t("recording.saving")}
									{clipProgress !== null && clipProgress > 0 ? (
										<span className="ml-1.5 tabular-nums text-white/55">
											{Math.round(clipProgress * 100)}%
										</span>
									) : null}
								</span>
							</div>
							<div className={`${styles.progressTrack} absolute inset-x-3.5 bottom-[5px]`}>
								<div
									className={`${styles.progressFill} ${
										clipProgress === null ? styles.progressIndeterminate : ""
									}`}
									style={
										clipProgress === null
											? undefined
											: { transform: `scaleX(${Math.max(0.02, clipProgress)})` }
									}
								/>
							</div>
						</>
					) : (
						<>
							<CaptureModeControl
								mode={captureMode}
								detail={captureDetail}
								onSelect={handleModeSelect}
							/>

							<span className={styles.divider} />

							<Tooltip
								content={
									systemAudioEnabled ? t("audio.disableSystemAudio") : t("audio.enableSystemAudio")
								}
							>
								<button
									type="button"
									data-testid="launch-system-audio-button"
									aria-pressed={systemAudioEnabled}
									aria-label="System audio"
									className={`${styles.control} ${systemAudioEnabled ? styles.controlOn : ""}`}
									onClick={() => setSystemAudioEnabled(!systemAudioEnabled)}
								>
									{systemAudioEnabled ? (
										<Volume2 size={ICON_SIZE} strokeWidth={ICON_STROKE} />
									) : (
										<VolumeX size={ICON_SIZE} strokeWidth={ICON_STROKE} />
									)}
								</button>
							</Tooltip>
							<Tooltip
								content={
									microphoneEnabled
										? `${t("audio.disableMicrophone")} · ${selectedMicLabel}`
										: t("audio.enableMicrophone")
								}
							>
								<button
									type="button"
									data-testid="launch-microphone-button"
									aria-pressed={microphoneEnabled}
									aria-label="Microphone"
									className={`${styles.control} ${microphoneEnabled ? styles.controlOn : ""}`}
									onClick={() => setMicrophoneEnabled(!microphoneEnabled)}
								>
									{microphoneEnabled ? (
										<Mic size={ICON_SIZE} strokeWidth={ICON_STROKE} />
									) : (
										<MicOff size={ICON_SIZE} strokeWidth={ICON_STROKE} />
									)}
								</button>
							</Tooltip>
							<Tooltip
								content={
									isAreaMode
										? "Camera is available for window and screen recordings"
										: webcamEnabled
											? `${t("webcam.disableWebcam")} · ${selectedCameraLabel}`
											: t("webcam.enableWebcam")
								}
							>
								{/* Wrapper keeps the tooltip working while the button is disabled. */}
								<span className="flex">
									<button
										type="button"
										data-testid="launch-webcam-button"
										aria-pressed={webcamEnabled}
										aria-label="Camera"
										disabled={isAreaMode}
										className={`${styles.control} ${webcamEnabled ? styles.controlOn : ""}`}
										onClick={() => void setWebcamEnabled(!webcamEnabled)}
									>
										{webcamEnabled ? (
											<Video size={ICON_SIZE} strokeWidth={ICON_STROKE} />
										) : (
											<VideoOff size={ICON_SIZE} strokeWidth={ICON_STROKE} />
										)}
									</button>
								</span>
							</Tooltip>

							<span className={styles.divider} />

							<Tooltip content="Quality, frame rate and countdown">
								<button
									type="button"
									data-testid="launch-format-button"
									aria-expanded={openPanel === "format"}
									aria-label={`Recording format: ${formatLabel} fps`}
									className={`${styles.control} ${styles.controlLabel} tabular-nums ${
										openPanel === "format" ? styles.controlOn : ""
									}`}
									onClick={() => togglePanel("format")}
								>
									{formatLabel}
									<ChevronDown
										size={12}
										className={`-mr-1 opacity-60 transition-transform duration-200 ${
											openPanel === "format" ? "rotate-180" : ""
										}`}
										aria-hidden="true"
									/>
								</button>
							</Tooltip>

							<Tooltip content={withShortcut(isAreaMode ? "Select area and record" : "Record")}>
								<button
									type="button"
									data-testid="launch-record-button"
									className={styles.recordButton}
									onClick={handleRecordButtonClick}
									disabled={starting}
									aria-busy={starting}
									aria-label={recordButtonLabel}
								>
									{starting ? (
										<Loader2 size={13} className={styles.spinner} aria-hidden="true" />
									) : (
										<span className={styles.recordDot} aria-hidden="true" />
									)}
									{starting ? "Starting" : "Record"}
								</button>
							</Tooltip>

							<span className={styles.divider} />

							<Tooltip content="Settings">
								<button
									type="button"
									data-testid="launch-settings-button"
									aria-expanded={openPanel === "settings"}
									aria-label="Settings"
									className={`${styles.control} ${
										openPanel !== null && openPanel !== "format" ? styles.controlOn : ""
									}`}
									onClick={() =>
										setOpenPanel((current) =>
											current !== null && current !== "format" ? null : "settings",
										)
									}
								>
									<Ellipsis size={ICON_SIZE} strokeWidth={ICON_STROKE} />
								</button>
							</Tooltip>
							<Tooltip content={isLinuxHud ? t("tooltips.closeApp") : "Hide to tray"}>
								<button
									type="button"
									aria-label={isLinuxHud ? t("tooltips.closeApp") : "Hide to tray"}
									className={styles.control}
									onClick={() => window.electronAPI?.hudOverlayClose?.()}
								>
									<X size={ICON_SIZE} strokeWidth={ICON_STROKE} />
								</button>
							</Tooltip>
						</>
					)}
				</div>
			</div>
		</div>
	);
}
