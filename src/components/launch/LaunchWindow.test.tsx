import "@testing-library/jest-dom";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "../ui/tooltip";
import { LaunchWindow } from "./LaunchWindow";

type SelectedSourceChangedListener = Parameters<
	Window["electronAPI"]["onSelectedSourceChanged"]
>[0];

const platformState = vi.hoisted(() => ({ value: "darwin" }));
const resizeCallbacks = vi.hoisted(() => [] as Array<ResizeObserverCallback>);

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

class CapturingResizeObserver extends StubResizeObserver {
	constructor(callback: ResizeObserverCallback) {
		super();
		resizeCallbacks.push(callback);
	}
}

const recorderState = vi.hoisted(() => ({
	value: {
		recording: false,
		paused: false,
		saving: false,
		starting: false,
		elapsedSeconds: 0,
		countdownSeconds: 3,
		setCountdownSeconds: vi.fn(),
		captureMode: "screen" as "area" | "window" | "screen",
		setCaptureMode: vi.fn(),
		captureRegion: null as import("@/lib/captureRegion").CaptureRegion | null,
		setCaptureRegion: vi.fn(),
		completedRecording: null,
		clearCompletedRecording: vi.fn(),
		demoteCompletedRecordingToDraft: vi.fn(),
		setCompletedRecordingTitle: vi.fn(),
		openCompletedRecordingInEditor: vi.fn(),
		publishCompletedRecording: vi.fn(),
		saveCompletedRecording: vi.fn(),
		defaultExportOptions: { quality: "good", frameRate: 60 },
		setDefaultExportOptions: vi.fn(),
		toggleRecording: vi.fn(),
		togglePaused: vi.fn(),
		canPauseRecording: false,
		restartRecording: vi.fn(),
		cancelRecording: vi.fn(),
		microphoneEnabled: false,
		setMicrophoneEnabled: vi.fn(),
		microphoneDeviceId: undefined,
		microphoneDeviceName: undefined,
		setMicrophoneDeviceId: vi.fn(),
		setMicrophoneDeviceName: vi.fn(),
		webcamEnabled: false,
		setWebcamEnabled: vi.fn(async () => true),
		webcamDeviceId: undefined,
		webcamDeviceName: undefined,
		setWebcamDeviceId: vi.fn(),
		setWebcamDeviceName: vi.fn(),
		systemAudioEnabled: false,
		setSystemAudioEnabled: vi.fn(),
		cursorCaptureMode: "editable-overlay" as "editable-overlay" | "system",
		setCursorCaptureMode: vi.fn(),
		softwareEncoderFallbackNoticeVisible: false,
		dismissSoftwareEncoderFallbackNotice: vi.fn(),
	},
}));

let selectedSourceChangedListeners: SelectedSourceChangedListener[] = [];
let sourceSelectorClosedListeners: Array<() => void> = [];
let hudCommandListeners: Array<Parameters<Window["electronAPI"]["onHudCommand"]>[0]> = [];

vi.mock("../../hooks/useScreenRecorder", () => ({
	useScreenRecorder: () => recorderState.value,
}));

vi.mock("../../hooks/useMicrophoneDevices", () => ({
	useMicrophoneDevices: () => ({
		devices: [],
		selectedDeviceId: "default",
		setSelectedDeviceId: vi.fn(),
	}),
}));

vi.mock("../../hooks/useCameraDevices", () => ({
	useCameraDevices: () => ({
		devices: [],
		selectedDeviceId: "",
		setSelectedDeviceId: vi.fn(),
		isLoading: false,
		error: null,
	}),
}));

vi.mock("../../hooks/useAudioLevelMeter", () => ({
	useAudioLevelMeter: () => ({ level: 0 }),
}));

vi.mock("../../lib/requestCameraAccess", () => ({
	requestCameraAccess: vi.fn(async () => ({ success: true, granted: true, status: "granted" })),
}));

vi.mock("@/native", () => ({
	nativeBridgeClient: {
		system: {
			getPlatform: vi.fn(async () => platformState.value),
		},
	},
}));

const i18nState = vi.hoisted(() => ({
	value: {
		locale: "en",
		setLocale: vi.fn(),
		systemLocaleSuggestion: null as string | null,
		acceptSystemLocaleSuggestion: vi.fn(),
		dismissSystemLocaleSuggestion: vi.fn(),
		resolveSystemLocaleSuggestion: vi.fn(),
	},
}));

vi.mock("@/i18n/loader", () => ({
	getAvailableLocales: () => ["en"],
	getLocaleName: () => "English",
}));

vi.mock("@/contexts/I18nContext", () => ({
	useI18n: () => i18nState.value,
	useScopedT: () => (key: string) => {
		const translations: Record<string, string> = {
			"sourceSelector.defaultSourceName": "Screen",
			"recording.selectSource": "Please select a source to record",
			"tooltips.useVerticalTray": "Use vertical tray",
			"tooltips.useHorizontalTray": "Use horizontal tray",
			"audio.enableSystemAudio": "Enable system audio",
			"audio.disableSystemAudio": "Disable system audio",
			"audio.enableMicrophone": "Enable microphone",
			"audio.disableMicrophone": "Disable microphone",
			"audio.defaultMicrophone": "Default Microphone",
			"webcam.enableWebcam": "Enable webcam",
			"webcam.disableWebcam": "Disable webcam",
			"webcam.defaultCamera": "Default Camera",
			"webcam.searching": "Searching...",
			"webcam.noneFound": "No camera found",
			"webcam.unavailable": "Camera unavailable",
			"cursor.useEditableCursor": "Use editable cursor",
			"cursor.useSystemCursor": "Use system cursor",
			"tooltips.openStudio": "Open Studio",
			"tooltips.hideHUD": "Hide HUD",
			"tooltips.closeApp": "Close App",
			language: "Language",
			"systemLanguagePrompt.title": "Use your system language?",
			"systemLanguagePrompt.description":
				"We detected English as your system language. Do you want to switch OpenScreen to English?",
			"systemLanguagePrompt.keepDefault": "Keep current language",
			"systemLanguagePrompt.switch": "Switch to English",
			"softwareEncoderFallback.title": "Switched to software encoding",
			"softwareEncoderFallback.description":
				"The default GPU encoder failed to start, so OpenScreen fell back to software H.264 encoding. Recording should continue as normal, but CPU usage may be higher.",
			"softwareEncoderFallback.dismiss": "Got it",
			"softwareEncoderFallback.dontShowAgain": "Don't show again",
		};
		return translations[key] ?? key;
	},
}));

function renderLaunchWindow() {
	return render(
		<TooltipProvider>
			<LaunchWindow />
		</TooltipProvider>,
	);
}

function stubElectronAPI(getSelectedSource: Window["electronAPI"]["getSelectedSource"]) {
	window.electronAPI = {
		...window.electronAPI,
		getSelectedSource,
		openSourceSelector: vi.fn(async () => ({ opened: true })),
		requestScreenAccess: vi.fn(async () => ({
			success: true,
			granted: true,
			status: "granted",
		})),
		getPlatform: vi.fn(async () => "darwin"),
		setHudOverlaySize: vi.fn(),
		setHudOverlayIgnoreMouseEvents: vi.fn(),
		moveHudOverlayBy: vi.fn(),
		hudOverlayHide: vi.fn(),
		hudOverlayClose: vi.fn(),
		showHudOverlay: vi.fn(),
		setHudBusy: vi.fn(),
		consumePendingHudCommand: vi.fn(async () => null),
		onHudCommand: vi.fn((callback) => {
			hudCommandListeners.push(callback);
			return () => {
				hudCommandListeners = hudCommandListeners.filter((listener) => listener !== callback);
			};
		}),
		openRegionSelector: vi.fn(async () => ({ canceled: true as const })),
		switchToEditor: vi.fn(async () => undefined),
		onSelectedSourceChanged: vi.fn((callback) => {
			selectedSourceChangedListeners.push(callback);
			return () => {
				selectedSourceChangedListeners = selectedSourceChangedListeners.filter(
					(listener) => listener !== callback,
				);
			};
		}),
		onSourceSelectorClosed: vi.fn((callback) => {
			sourceSelectorClosedListeners.push(callback);
			return () => {
				sourceSelectorClosedListeners = sourceSelectorClosedListeners.filter(
					(listener) => listener !== callback,
				);
			};
		}),
	} as typeof window.electronAPI;
}

const displayOneSource = {
	id: "screen:1:0",
	name: "Display 1",
	display_id: "1",
	thumbnail: null,
	appIcon: null,
} satisfies ProcessedDesktopSource;

async function waitForSourceSelectionSubscription() {
	await waitFor(() => {
		expect(selectedSourceChangedListeners.length).toBeGreaterThan(0);
	});
}

function emitSelectedSourceChanged(source: ProcessedDesktopSource) {
	act(() => {
		selectedSourceChangedListeners.forEach((listener) => listener(source));
	});
}

function emitSourceSelectorClosed() {
	act(() => {
		sourceSelectorClosedListeners.forEach((listener) => listener());
	});
}

function resetLaunchMocks() {
	localStorage.clear();
	vi.stubGlobal("ResizeObserver", StubResizeObserver);
	recorderState.value.toggleRecording.mockClear();
	recorderState.value.softwareEncoderFallbackNoticeVisible = false;
	recorderState.value.dismissSoftwareEncoderFallbackNotice.mockClear();
	recorderState.value.setCountdownSeconds.mockClear();
	recorderState.value.setDefaultExportOptions.mockClear();
	recorderState.value.setMicrophoneEnabled.mockClear();
	recorderState.value.setWebcamEnabled.mockClear();
	recorderState.value.setSystemAudioEnabled.mockClear();
	recorderState.value.setCursorCaptureMode.mockClear();
	recorderState.value.setCaptureMode.mockClear();
	recorderState.value.setCaptureRegion.mockClear();
	recorderState.value.captureMode = "screen";
	recorderState.value.captureRegion = null;
	recorderState.value.cursorCaptureMode = "editable-overlay";
	recorderState.value.webcamEnabled = false;
	recorderState.value.starting = false;
	selectedSourceChangedListeners = [];
	sourceSelectorClosedListeners = [];
	hudCommandListeners = [];
	i18nState.value.systemLocaleSuggestion = null;
	i18nState.value.acceptSystemLocaleSuggestion.mockClear();
	i18nState.value.dismissSystemLocaleSuggestion.mockClear();
	i18nState.value.resolveSystemLocaleSuggestion.mockClear();
	stubElectronAPI(vi.fn(async () => null));
}

describe("LaunchWindow record button", () => {
	beforeEach(() => {
		platformState.value = "darwin";
		resetLaunchMocks();
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it("opens the source selector instead of disabling the primary action when no source is selected", async () => {
		renderLaunchWindow();

		const recordButton = await screen.findByTestId("launch-record-button");

		expect(recordButton).toBeEnabled();
		expect(recordButton).toHaveAttribute("aria-label", "Please select a source to record");

		fireEvent.click(recordButton);

		await waitFor(() => {
			expect(window.electronAPI.openSourceSelector).toHaveBeenCalledTimes(1);
		});
		expect(recorderState.value.toggleRecording).not.toHaveBeenCalled();
	});

	it("records immediately after source selection when the record button opened the picker", async () => {
		renderLaunchWindow();
		await waitForSourceSelectionSubscription();

		fireEvent.click(await screen.findByTestId("launch-record-button"));
		emitSelectedSourceChanged(displayOneSource);

		await waitFor(() => {
			expect(recorderState.value.toggleRecording).toHaveBeenCalledTimes(1);
		});
		expect(screen.getByTestId("launch-record-button")).toHaveAttribute("aria-label", "Display 1");
	});

	it("does not record after manual source selection", async () => {
		renderLaunchWindow();
		await waitForSourceSelectionSubscription();

		emitSelectedSourceChanged(displayOneSource);

		await waitFor(() => {
			expect(screen.getByTestId("launch-record-button")).toHaveAttribute("aria-label", "Display 1");
		});
		expect(recorderState.value.toggleRecording).not.toHaveBeenCalled();
	});

	it("clears record-after-selection intent when the source picker closes without a selection", async () => {
		renderLaunchWindow();
		await waitForSourceSelectionSubscription();

		fireEvent.click(await screen.findByTestId("launch-record-button"));
		emitSourceSelectorClosed();
		emitSelectedSourceChanged(displayOneSource);

		await waitFor(() => {
			expect(screen.getByTestId("launch-record-button")).toHaveAttribute("aria-label", "Display 1");
		});
		expect(recorderState.value.toggleRecording).not.toHaveBeenCalled();
	});

	it("clears record-after-selection intent when opening the source picker fails", async () => {
		window.electronAPI.openSourceSelector = vi.fn(async () => {
			throw new Error("source selector failed");
		});

		renderLaunchWindow();
		await waitForSourceSelectionSubscription();

		fireEvent.click(await screen.findByTestId("launch-record-button"));

		await waitFor(() => {
			expect(window.electronAPI.openSourceSelector).toHaveBeenCalledTimes(1);
		});

		await act(async () => {
			await Promise.resolve();
		});

		emitSelectedSourceChanged(displayOneSource);

		await waitFor(() => {
			expect(screen.getByTestId("launch-record-button")).toHaveAttribute("aria-label", "Display 1");
		});
		expect(recorderState.value.toggleRecording).not.toHaveBeenCalled();
	});

	it("handles selected source polling failures", async () => {
		const error = new Error("selected source unavailable");
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		stubElectronAPI(
			vi.fn(async () => {
				throw error;
			}),
		);

		renderLaunchWindow();

		await waitFor(() => {
			expect(warnSpy).toHaveBeenCalledWith("Failed to refresh selected source:", error);
		});

		warnSpy.mockRestore();
	});

	it("starts recording when a source is already selected", async () => {
		stubElectronAPI(vi.fn(async () => displayOneSource));

		renderLaunchWindow();

		const recordButton = await screen.findByTestId("launch-record-button");
		await waitFor(() => {
			expect(recordButton).toHaveAttribute("aria-label", "Display 1");
		});

		fireEvent.click(recordButton);

		expect(recorderState.value.toggleRecording).toHaveBeenCalledTimes(1);
		expect(window.electronAPI.openSourceSelector).not.toHaveBeenCalled();
	});

	it("keeps the HUD interactive on Linux so the drag handle can receive pointer events", async () => {
		platformState.value = "linux";

		renderLaunchWindow();

		await waitFor(() => {
			expect(window.electronAPI.setHudOverlayIgnoreMouseEvents).toHaveBeenLastCalledWith(false);
		});
	});
});

describe("LaunchWindow personal HUD", () => {
	beforeEach(() => {
		platformState.value = "darwin";
		resetLaunchMocks();
		resizeCallbacks.length = 0;
		vi.stubGlobal("ResizeObserver", CapturingResizeObserver);
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it("does not expose language or vertical-tray controls", async () => {
		i18nState.value.systemLocaleSuggestion = "zh-CN";

		renderLaunchWindow();

		expect(screen.queryByText("Use your system language?")).not.toBeInTheDocument();
		expect(screen.queryByTestId("launch-tray-layout-button")).not.toBeInTheDocument();
	});

	it("applies a recording recipe to capture and export settings", async () => {
		renderLaunchWindow();

		fireEvent.click(await screen.findByTestId("launch-settings-button"));
		fireEvent.click(await screen.findByTestId("launch-recording-recipes-button"));
		fireEvent.click(await screen.findByRole("button", { name: /Product Demo/ }));

		await waitFor(() => {
			expect(recorderState.value.setMicrophoneEnabled).toHaveBeenCalledWith(true);
			expect(recorderState.value.setWebcamEnabled).toHaveBeenCalledWith(true);
			expect(recorderState.value.setSystemAudioEnabled).toHaveBeenCalledWith(false);
			expect(recorderState.value.setCursorCaptureMode).toHaveBeenCalledWith("editable-overlay");
			expect(recorderState.value.setCountdownSeconds).toHaveBeenCalledWith(3);
			expect(recorderState.value.setDefaultExportOptions).toHaveBeenCalledWith({
				quality: "good",
				frameRate: 60,
			});
		});
	});
});

describe("LaunchWindow capture flow", () => {
	const region = {
		displayId: 1,
		x: 100,
		y: 80,
		width: 640,
		height: 360,
		displayWidth: 1920,
		displayHeight: 1080,
		scaleFactor: 1,
	};

	beforeEach(() => {
		platformState.value = "win32";
		resetLaunchMocks();
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it("goes through the area picker and records once the new area is applied", async () => {
		recorderState.value.captureMode = "area";
		recorderState.value.cursorCaptureMode = "system";
		window.electronAPI.openRegionSelector = vi.fn(async () => ({
			canceled: false as const,
			region,
			startRecording: true,
		}));

		const view = renderLaunchWindow();
		fireEvent.click(await screen.findByTestId("launch-record-button"));

		await waitFor(() => {
			expect(recorderState.value.setCaptureRegion).toHaveBeenCalledWith(region);
		});
		// Recording waits for the picked area to become the recorder's state.
		expect(recorderState.value.toggleRecording).not.toHaveBeenCalled();

		recorderState.value.captureRegion = region;
		view.rerender(
			<TooltipProvider>
				<LaunchWindow />
			</TooltipProvider>,
		);

		await waitFor(() => {
			expect(recorderState.value.toggleRecording).toHaveBeenCalledTimes(1);
		});
		expect(screen.getByTestId("launch-capture-mode-area")).toHaveTextContent("640 × 360");
	});

	it("keeps the area without recording when the picker is confirmed with Done", async () => {
		recorderState.value.captureMode = "area";
		recorderState.value.cursorCaptureMode = "system";
		window.electronAPI.openRegionSelector = vi.fn(async () => ({
			canceled: false as const,
			region,
			startRecording: false,
		}));

		const view = renderLaunchWindow();
		fireEvent.click(await screen.findByTestId("launch-capture-mode-area"));
		await waitFor(() => {
			expect(recorderState.value.setCaptureRegion).toHaveBeenCalledWith(region);
		});

		recorderState.value.captureRegion = region;
		view.rerender(
			<TooltipProvider>
				<LaunchWindow />
			</TooltipProvider>,
		);
		await act(async () => {
			await Promise.resolve();
		});

		expect(recorderState.value.toggleRecording).not.toHaveBeenCalled();
	});

	it("locks the camera and the cursor choice for area clips without changing the preferences", async () => {
		recorderState.value.captureMode = "area";
		recorderState.value.cursorCaptureMode = "system";

		renderLaunchWindow();

		expect(await screen.findByTestId("launch-webcam-button")).toBeDisabled();
		fireEvent.click(screen.getByTestId("launch-format-button"));
		expect(await screen.findByRole("radio", { name: "Editable" })).toBeDisabled();
		// The recorder derives the area-mode overrides itself; the HUD must not rewrite
		// the stored camera/cursor preferences.
		expect(recorderState.value.setWebcamEnabled).not.toHaveBeenCalled();
		expect(recorderState.value.setCursorCaptureMode).not.toHaveBeenCalled();
	});

	it("ignores Record and the hotkey while a capture is already starting", async () => {
		recorderState.value.starting = true;
		stubElectronAPI(vi.fn(async () => displayOneSource));

		renderLaunchWindow();
		await waitFor(() => expect(hudCommandListeners.length).toBeGreaterThan(0));

		const recordButton = await screen.findByTestId("launch-record-button");
		expect(recordButton).toBeDisabled();
		expect(recordButton).toHaveTextContent("Starting");
		await act(async () => {
			hudCommandListeners.forEach((listener) => listener("quick-record"));
		});

		expect(recorderState.value.toggleRecording).not.toHaveBeenCalled();
		expect(window.electronAPI.openRegionSelector).not.toHaveBeenCalled();
	});

	it("lets quality and frame rate be chosen before recording", async () => {
		renderLaunchWindow();

		const formatButton = await screen.findByTestId("launch-format-button");
		expect(formatButton).toHaveTextContent("1080p · 60");

		fireEvent.click(formatButton);
		fireEvent.click(await screen.findByRole("radio", { name: "720p" }));
		expect(recorderState.value.setDefaultExportOptions).toHaveBeenCalledWith({
			quality: "medium",
			frameRate: 60,
		});

		fireEvent.click(screen.getByRole("radio", { name: "30 fps" }));
		expect(recorderState.value.setDefaultExportOptions).toHaveBeenCalledWith({
			quality: "good",
			frameRate: 30,
		});
	});

	it("starts recording the selected screen when the record hotkey arrives", async () => {
		stubElectronAPI(vi.fn(async () => displayOneSource));

		renderLaunchWindow();
		await waitFor(() => expect(hudCommandListeners.length).toBeGreaterThan(0));

		await act(async () => {
			hudCommandListeners.forEach((listener) => listener("quick-record"));
		});

		await waitFor(() => {
			expect(recorderState.value.toggleRecording).toHaveBeenCalledTimes(1);
		});
		expect(window.electronAPI.showHudOverlay).toHaveBeenCalled();
		expect(window.electronAPI.openSourceSelector).not.toHaveBeenCalled();
	});

	it("runs a capture that was requested while the HUD was still loading", async () => {
		recorderState.value.captureMode = "area";
		recorderState.value.cursorCaptureMode = "system";
		window.electronAPI.consumePendingHudCommand = vi.fn(async () => "quick-record" as const);

		renderLaunchWindow();

		await waitFor(() => {
			expect(window.electronAPI.openRegionSelector).toHaveBeenCalledTimes(1);
		});
		// The area picker covers the display, so the HUD is not forced on screen first.
		expect(window.electronAPI.showHudOverlay).not.toHaveBeenCalled();
	});

	it("hides to the tray instead of quitting when closed", async () => {
		renderLaunchWindow();

		fireEvent.click(await screen.findByRole("button", { name: "Hide to tray" }));

		expect(window.electronAPI.hudOverlayClose).toHaveBeenCalledTimes(1);
	});
});

describe("LaunchWindow HUD drag", () => {
	beforeEach(() => {
		platformState.value = "darwin";
		resetLaunchMocks();
		resizeCallbacks.length = 0;
		vi.stubGlobal("ResizeObserver", CapturingResizeObserver);
		// jsdom doesn't implement the Pointer Capture API; stub it so the drag handlers
		// (which call set/has/releasePointerCapture) don't throw.
		HTMLElement.prototype.setPointerCapture = vi.fn();
		HTMLElement.prototype.hasPointerCapture = vi.fn(() => true);
		HTMLElement.prototype.releasePointerCapture = vi.fn();
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it("suppresses ResizeObserver-driven measurement while dragging, and measures once on release", async () => {
		renderLaunchWindow();

		const dragHandle = await screen.findByTestId("hud-drag-handle");

		// Give the stack a non-zero size so a resize observation would actually trigger a
		// `setHudOverlaySize` call if it were not suppressed during the drag.
		const stack = dragHandle.closest("[data-hud-stack]") as HTMLElement | null;
		expect(stack).not.toBeNull();
		if (stack) {
			Object.defineProperty(stack, "scrollHeight", { value: 56, configurable: true });
			Object.defineProperty(stack, "scrollWidth", { value: 400, configurable: true });
		}

		const sizeMock = window.electronAPI.setHudOverlaySize as unknown as {
			mockClear: () => void;
		};
		sizeMock.mockClear();

		fireEvent.pointerDown(dragHandle, { screenX: 100, screenY: 100 });

		// Simulate a ResizeObserver firing mid-drag (e.g. transient reflow) -- this must
		// NOT reposition/resize the HUD while the user's pointer is still down.
		await act(async () => {
			for (const callback of resizeCallbacks) {
				callback([], {} as ResizeObserver);
			}
		});
		expect(window.electronAPI.setHudOverlaySize).not.toHaveBeenCalled();

		fireEvent.pointerMove(dragHandle, { screenX: 140, screenY: 130 });
		fireEvent.pointerUp(dragHandle, { screenX: 140, screenY: 130 });

		// Content is re-measured once the drag ends, so a real size change made mid-drag
		// still gets picked up promptly.
		await waitFor(() => {
			expect(window.electronAPI.setHudOverlaySize).toHaveBeenCalled();
		});
	});
});

describe("LaunchWindow software encoder fallback notice", () => {
	beforeEach(() => {
		platformState.value = "darwin";
		resetLaunchMocks();
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it("stays hidden while the recorder reports no fallback", () => {
		renderLaunchWindow();

		expect(screen.queryByText("Switched to software encoding")).not.toBeInTheDocument();
	});

	it("shows the notice when the recorder reports a software fallback", async () => {
		recorderState.value.softwareEncoderFallbackNoticeVisible = true;

		renderLaunchWindow();

		expect(await screen.findByText("Switched to software encoding")).toBeInTheDocument();
		expect(screen.getByText(/fell back to software H\.264 encoding/)).toBeInTheDocument();
	});

	it("dismisses the notice without persisting when Got it is clicked", async () => {
		recorderState.value.softwareEncoderFallbackNoticeVisible = true;

		renderLaunchWindow();

		fireEvent.click(await screen.findByRole("button", { name: "Got it" }));

		expect(recorderState.value.dismissSoftwareEncoderFallbackNotice).toHaveBeenCalledTimes(1);
		expect(recorderState.value.dismissSoftwareEncoderFallbackNotice).toHaveBeenCalledWith();
	});

	it("persists the suppression when Don't show again is clicked", async () => {
		recorderState.value.softwareEncoderFallbackNoticeVisible = true;

		renderLaunchWindow();

		fireEvent.click(await screen.findByRole("button", { name: "Don't show again" }));

		expect(recorderState.value.dismissSoftwareEncoderFallbackNotice).toHaveBeenCalledTimes(1);
		expect(recorderState.value.dismissSoftwareEncoderFallbackNotice).toHaveBeenCalledWith(true);
	});
});
