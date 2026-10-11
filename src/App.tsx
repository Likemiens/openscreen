import { lazy, Suspense, useEffect } from "react";
import { toast } from "sonner";
import { Toaster } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import { useScopedT } from "./contexts/I18nContext";

// Every window is its own lazy chunk: the recorder HUD and the capture overlays start
// without parsing the editor, and the editor does not carry the recorder.
const LaunchWindow = lazy(() =>
	import("./components/launch/LaunchWindow").then((module) => ({ default: module.LaunchWindow })),
);
const SourceSelector = lazy(() =>
	import("./components/launch/SourceSelector").then((module) => ({
		default: module.SourceSelector,
	})),
);
const CountdownOverlay = lazy(() =>
	import("./components/launch/CountdownOverlay.tsx").then((module) => ({
		default: module.CountdownOverlay,
	})),
);
const RegionSelector = lazy(() =>
	import("./components/launch/RegionSelector").then((module) => ({
		default: module.RegionSelector,
	})),
);
const RegionFrame = lazy(() =>
	import("./components/launch/RegionFrame").then((module) => ({ default: module.RegionFrame })),
);
const EditorWindow = lazy(() => import("./EditorWindow"));

const TRANSPARENT_WINDOW_TYPES = new Set([
	"hud-overlay",
	"source-selector",
	"countdown-overlay",
	"region-selector",
	"region-frame",
]);

function YandexDiskUploadNotifications() {
	useEffect(() => {
		return window.electronAPI?.onYandexDiskUploadStatus?.((status) => {
			const toastId = `yandex-disk-${status.uploadId}`;
			if (status.state === "uploading") {
				toast.loading(`Uploading ${status.fileName} to Yandex Disk…`, { id: toastId });
				return;
			}
			if (status.state === "success") {
				const description =
					status.localDeletion === "deleted"
						? "The link was copied and the local copy was deleted."
						: status.localDeletion === "pending"
							? "The link was copied. The local copy will be deleted after Studio closes."
							: "The public video link was copied to your clipboard.";
				toast.success(`Published ${status.fileName} to Yandex Disk`, {
					id: toastId,
					description,
					action: {
						label: "Open video",
						onClick: () => window.electronAPI.openExternalUrl(status.publicUrl),
					},
				});
				return;
			}
			if (status.state === "local-deleted") {
				toast.success(`Deleted local copy of ${status.fileName}`);
				return;
			}
			if (status.state === "cleanup-error") {
				toast.error("Could not delete local copy", { description: status.error });
				return;
			}
			toast.error("Yandex Disk upload failed", {
				id: toastId,
				description: status.error,
			});
		});
	}, []);

	return null;
}

function EditorLoadingFallback() {
	const tEditor = useScopedT("editor");
	return (
		<div className="flex flex-col items-center justify-center gap-3 h-screen bg-[#161618]">
			<svg
				className="animate-spin text-[#0A84FF]"
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
				width={28}
				height={28}
			>
				<circle
					className="opacity-25"
					cx="12"
					cy="12"
					r="10"
					stroke="currentColor"
					strokeWidth="4"
				/>
				<path
					className="opacity-75"
					fill="currentColor"
					d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
				/>
			</svg>
			<span className="text-white/50 text-sm">{tEditor("loadingEditor")}</span>
		</div>
	);
}

const windowType = new URLSearchParams(window.location.search).get("windowType") || "";

export default function App() {
	useEffect(() => {
		if (TRANSPARENT_WINDOW_TYPES.has(windowType)) {
			document.body.style.background = "transparent";
			document.documentElement.style.background = "transparent";
			document.getElementById("root")?.style.setProperty("background", "transparent");
		}

		// These windows are sized by the main process; pin the document shell and hide
		// overflow so the renderer can't introduce scrollbars (see issue #305).
		if (windowType !== "editor" && windowType !== "source-selector" && windowType !== "") {
			document.documentElement.style.height = "100%";
			document.documentElement.style.overflow = "hidden";
			document.body.style.height = "100%";
			document.body.style.margin = "0";
			document.body.style.overflow = "hidden";
			const root = document.getElementById("root");
			root?.style.setProperty("height", "100%");
			root?.style.setProperty("min-height", "0");
			root?.style.setProperty("overflow", "hidden");
		}
	}, []);

	switch (windowType) {
		// The HUD renders its notices inside its own measured layout (see HudToasts), so
		// it deliberately has no floating toaster.
		case "hud-overlay":
			return (
				<TooltipProvider>
					<Suspense fallback={null}>
						<LaunchWindow />
					</Suspense>
				</TooltipProvider>
			);
		case "source-selector":
			return (
				<Suspense fallback={null}>
					<SourceSelector />
				</Suspense>
			);
		case "countdown-overlay":
			return (
				<Suspense fallback={null}>
					<CountdownOverlay />
				</Suspense>
			);
		case "region-selector":
			return (
				<Suspense fallback={null}>
					<RegionSelector />
				</Suspense>
			);
		case "region-frame":
			return (
				<Suspense fallback={null}>
					<RegionFrame />
				</Suspense>
			);
		case "editor":
			return (
				<TooltipProvider>
					<YandexDiskUploadNotifications />
					<Suspense fallback={<EditorLoadingFallback />}>
						<EditorWindow />
					</Suspense>
					<Toaster theme="dark" />
				</TooltipProvider>
			);
		default:
			return (
				<div>
					<div className="w-full h-full bg-background text-foreground">
						<h1>Openscreen</h1>
					</div>
				</div>
			);
	}
}
