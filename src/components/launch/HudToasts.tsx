import { AlertTriangle, CheckCircle2, Info, Loader2, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { toast as sonner, useSonner } from "sonner";
import styles from "./hud.module.css";

const DEFAULT_DURATION_MS = 4_500;
const MAX_VISIBLE = 2;

function resolve(node: unknown): React.ReactNode {
	return typeof node === "function" ? (node as () => React.ReactNode)() : (node as React.ReactNode);
}

/**
 * Renders toasts in the HUD's own layout. The HUD window is sized to its content, so
 * a floating toaster would be clipped; here notices take part in the stack that the
 * window is measured from, and share the HUD material.
 */
export function HudToasts() {
	const { toasts } = useSonner();
	const timers = useRef(new Map<string | number, number>());

	useEffect(() => {
		const active = new Set(toasts.map((toast) => toast.id));
		for (const [id, timer] of timers.current) {
			if (!active.has(id)) {
				window.clearTimeout(timer);
				timers.current.delete(id);
			}
		}
		for (const toast of toasts) {
			// A loading toast stays until it is replaced or dismissed by its owner.
			if (toast.type === "loading") {
				const pending = timers.current.get(toast.id);
				if (pending) {
					window.clearTimeout(pending);
					timers.current.delete(toast.id);
				}
				continue;
			}
			if (timers.current.has(toast.id)) continue;
			timers.current.set(
				toast.id,
				window.setTimeout(() => sonner.dismiss(toast.id), toast.duration ?? DEFAULT_DURATION_MS),
			);
		}
	}, [toasts]);

	useEffect(() => {
		const pending = timers.current;
		return () => {
			for (const timer of pending.values()) window.clearTimeout(timer);
			pending.clear();
		};
	}, []);

	if (toasts.length === 0) return null;

	return (
		<div className="flex flex-col items-center gap-1.5" aria-live="polite">
			{toasts.slice(0, MAX_VISIBLE).map((toast) => {
				const isError = toast.type === "error";
				const Icon =
					toast.type === "loading"
						? Loader2
						: toast.type === "success"
							? CheckCircle2
							: isError || toast.type === "warning"
								? AlertTriangle
								: Info;
				const description = resolve(toast.description);
				return (
					<div
						key={toast.id}
						role={isError ? "alert" : "status"}
						data-hud-interactive="true"
						className={`${styles.panel} ${styles.materialize} ${styles.noDrag} flex max-w-[420px] items-start gap-2.5 py-2 pl-3 pr-2`}
					>
						<Icon
							size={15}
							aria-hidden="true"
							className={`mt-px flex-none ${
								toast.type === "loading"
									? styles.spinner
									: isError
										? styles.statusError
										: toast.type === "success"
											? styles.statusOk
											: "text-white/60"
							}`}
						/>
						<div className="min-w-0 flex-1">
							<div className="font-medium">{resolve(toast.title)}</div>
							{description ? <div className={`${styles.caption} mt-0.5`}>{description}</div> : null}
						</div>
						<button
							type="button"
							aria-label="Dismiss"
							className={`${styles.button} ${styles.buttonGhost} ${styles.iconOnly} h-6 w-6 flex-none`}
							onClick={() => sonner.dismiss(toast.id)}
						>
							<X size={13} aria-hidden="true" />
						</button>
					</div>
				);
			})}
		</div>
	);
}
