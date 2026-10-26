import { useEffect, useState } from "react";

/**
 * Whether transcription is installed. The Windows installer can leave its runtime out; then
 * the transcription controls are hidden rather than failing when used.
 */
export function useSpeechRecognitionAvailable(): boolean {
	const [available, setAvailable] = useState(true);
	useEffect(() => {
		let active = true;
		window.electronAPI
			?.isSpeechRecognitionAvailable?.()
			.then((value) => {
				if (active) setAvailable(value);
			})
			.catch(() => undefined);
		return () => {
			active = false;
		};
	}, []);
	return available;
}
