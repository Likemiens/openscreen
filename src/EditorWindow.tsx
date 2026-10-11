import { useEffect } from "react";
import { ShortcutsConfigDialog } from "./components/video-editor/ShortcutsConfigDialog";
import VideoEditor from "./components/video-editor/VideoEditor";
import { ShortcutsProvider } from "./contexts/ShortcutsContext";
import { loadAllCustomFonts } from "./lib/customFonts";
import "./editorFonts.css";

/** Everything only Studio needs, kept out of the recorder's startup path. */
export default function EditorWindow() {
	useEffect(() => {
		loadAllCustomFonts().catch((error) => {
			console.error("Failed to load custom fonts:", error);
		});
	}, []);

	return (
		<ShortcutsProvider>
			<VideoEditor />
			<ShortcutsConfigDialog />
		</ShortcutsProvider>
	);
}
