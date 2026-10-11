import { useEffect, useRef, useState } from "react";

interface WebcamPreviewProps {
	deviceId?: string;
}

export function WebcamPreview({ deviceId }: WebcamPreviewProps) {
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const [error, setError] = useState(false);

	useEffect(() => {
		let disposed = false;
		let stream: MediaStream | null = null;
		setError(false);

		if (!navigator.mediaDevices?.getUserMedia) {
			setError(true);
			return;
		}

		void navigator.mediaDevices
			.getUserMedia({
				video: deviceId ? { deviceId: { exact: deviceId } } : true,
				audio: false,
			})
			.then((nextStream) => {
				if (disposed) {
					nextStream.getTracks().forEach((track) => track.stop());
					return;
				}
				stream = nextStream;
				if (videoRef.current) videoRef.current.srcObject = nextStream;
			})
			.catch((previewError) => {
				console.warn("Failed to start webcam preview:", previewError);
				if (!disposed) setError(true);
			});

		return () => {
			disposed = true;
			if (videoRef.current) videoRef.current.srcObject = null;
			stream?.getTracks().forEach((track) => track.stop());
		};
	}, [deviceId]);

	return (
		<div className="relative aspect-video w-full overflow-hidden rounded-xl border border-white/10 bg-black/50">
			<video
				ref={videoRef}
				autoPlay
				muted
				playsInline
				className="h-full w-full -scale-x-100 object-cover"
			/>
			<div className="pointer-events-none absolute inset-x-2 bottom-2 flex items-center justify-between">
				<span className="rounded-md bg-black/60 px-1.5 py-0.5 text-[9px] font-medium text-white/75 backdrop-blur">
					Camera preview
				</span>
				<span className="rounded-md bg-emerald-400/15 px-1.5 py-0.5 text-[9px] font-medium text-emerald-200">
					PiP
				</span>
			</div>
			{error ? (
				<div className="absolute inset-0 flex items-center justify-center bg-[#111318] px-4 text-center text-[10px] leading-relaxed text-white/55">
					The camera could not be shown. Check the camera permission in system settings.
				</div>
			) : null}
		</div>
	);
}
