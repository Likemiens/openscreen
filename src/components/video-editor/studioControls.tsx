import * as SliderPrimitive from "@radix-ui/react-slider";
import { ChevronDown } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The building blocks of the Studio inspector: a labelled section with a hairline,
 * a segmented picker, a slider that carries its own label and value, a select, and a
 * number field. One neutral graphite surface throughout — the selection is a lighter
 * fill rather than a colour, so the picture being edited stays the only colourful
 * thing on screen.
 */

export function StudioSection({
	label,
	action,
	children,
	className,
}: {
	label: string;
	action?: ReactNode;
	children: ReactNode;
	className?: string;
}) {
	return (
		<section className={cn("space-y-2.5", className)}>
			<div className="flex items-center gap-2.5">
				<h3 className="text-[11px] font-medium text-white/45">{label}</h3>
				<span className="h-px flex-1 bg-white/[0.09]" />
				{action}
			</div>
			{children}
		</section>
	);
}

export function StudioSegmented<T extends string>({
	label,
	options,
	value,
	onChange,
	disabled,
	className,
}: {
	label: string;
	options: ReadonlyArray<{ value: T; label: string; title?: string; testId?: string }>;
	value: T;
	onChange: (value: T) => void;
	disabled?: boolean;
	className?: string;
}) {
	return (
		<div
			role="radiogroup"
			aria-label={label}
			className={cn("flex rounded-xl bg-white/[0.055] p-[3px]", className)}
		>
			{options.map((option) => {
				const selected = option.value === value;
				return (
					<button
						key={option.value}
						type="button"
						role="radio"
						aria-checked={selected}
						title={option.title}
						data-testid={option.testId}
						disabled={disabled}
						onClick={() => onChange(option.value)}
						className={cn(
							"h-8 min-w-0 flex-1 rounded-[9px] px-1.5 text-[12px] font-medium transition-colors duration-150",
							"disabled:pointer-events-none disabled:opacity-40",
							selected
								? "bg-white/[0.17] text-white shadow-[0_1px_2px_rgba(0,0,0,0.35),inset_0_0.5px_0_rgba(255,255,255,0.14)]"
								: "text-white/55 hover:text-white/90",
						)}
					>
						<span className="block truncate">{option.label}</span>
					</button>
				);
			})}
		</div>
	);
}

export function StudioSelect<T extends string>({
	label,
	options,
	value,
	onChange,
}: {
	label: string;
	options: ReadonlyArray<{ value: T; label: string }>;
	value: T;
	onChange: (value: T) => void;
}) {
	return (
		<div className="relative">
			<select
				aria-label={label}
				value={value}
				onChange={(event) => {
					onChange(event.target.value as T);
					// Hand the keyboard back to the editor once a choice is made with the
					// pointer; keyboard users keep focus to go on arrowing through options.
					if (!event.currentTarget.matches(":focus-visible")) event.currentTarget.blur();
				}}
				className="h-10 w-full cursor-pointer appearance-none rounded-xl border-0 bg-white/[0.065] pl-3.5 pr-9 text-[13px] font-medium text-white outline-none transition-colors hover:bg-white/[0.09] focus-visible:ring-2 focus-visible:ring-[#0A84FF]/70"
			>
				{options.map((option) => (
					<option key={option.value} value={option.value} className="bg-[#2c2c2e] text-white">
						{option.label}
					</option>
				))}
			</select>
			<ChevronDown
				aria-hidden="true"
				className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45"
			/>
		</div>
	);
}

/** A slider drawn as one row: the label on the left, the value on the right. */
export function StudioSliderRow({
	label,
	value,
	display,
	min,
	max,
	step = 1,
	onChange,
	onCommit,
	disabled,
}: {
	label: string;
	value: number;
	display: string;
	min: number;
	max: number;
	step?: number;
	onChange: (value: number) => void;
	onCommit?: () => void;
	disabled?: boolean;
}) {
	return (
		<SliderPrimitive.Root
			value={[value]}
			min={min}
			max={max}
			step={step}
			disabled={disabled}
			onValueChange={(values) => onChange(values[0])}
			onValueCommit={() => onCommit?.()}
			className={cn(
				"relative flex h-10 w-full touch-none select-none items-center overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03]",
				disabled && "opacity-40",
			)}
		>
			<SliderPrimitive.Track className="relative h-full w-full">
				<SliderPrimitive.Range className="absolute h-full bg-white/[0.085]" />
			</SliderPrimitive.Track>
			<SliderPrimitive.Thumb
				aria-label={label}
				data-studio-thumb=""
				className="block h-4 w-[2px] rounded-full bg-white/55 outline-none transition-[height,background-color] hover:h-5 hover:bg-white focus-visible:h-5 focus-visible:bg-white"
			/>
			<span className="pointer-events-none absolute left-3.5 text-[12.5px] font-medium text-white/75">
				{label}
			</span>
			<span className="pointer-events-none absolute right-3.5 text-[12.5px] tabular-nums text-white/60">
				{display}
			</span>
		</SliderPrimitive.Root>
	);
}

/** A labelled on/off row, the same height as a slider row. */
export function StudioToggleRow({
	label,
	checked,
	onChange,
	disabled,
}: {
	label: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
	disabled?: boolean;
}) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			aria-label={label}
			disabled={disabled}
			onClick={() => onChange(!checked)}
			className={cn(
				"flex min-h-10 w-full items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] py-2 pl-3.5 pr-2.5 text-left transition-colors hover:bg-white/[0.05]",
				"disabled:pointer-events-none disabled:opacity-40",
			)}
		>
			<span className="min-w-0 flex-1 text-[12.5px] font-medium leading-snug text-white/75">
				{label}
			</span>
			<span
				aria-hidden="true"
				className={cn(
					"flex h-[22px] w-[38px] flex-none items-center rounded-full p-[2px] transition-colors duration-200",
					checked ? "bg-[#0A84FF]" : "bg-white/[0.16]",
				)}
			>
				<span
					className={cn(
						"h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.4)] transition-transform duration-200",
						checked && "translate-x-4",
					)}
				/>
			</span>
		</button>
	);
}

/**
 * A whole-number field that commits on Enter or blur, so typing "125" is one edit
 * (and one undo step) rather than three.
 */
export function StudioNumberField({
	label,
	value,
	suffix = "px",
	max,
	onCommit,
	disabled,
}: {
	label: string;
	value: number;
	suffix?: string;
	max?: number;
	onCommit: (value: number) => void;
	disabled?: boolean;
}) {
	const [draft, setDraft] = useState(String(value));
	// Escape blurs the field too; this keeps that blur from committing the abandoned text.
	const cancelledRef = useRef(false);

	useEffect(() => {
		setDraft(String(value));
	}, [value]);

	const commit = () => {
		if (cancelledRef.current) {
			cancelledRef.current = false;
			setDraft(String(value));
			return;
		}
		const parsed = Number.parseInt(draft, 10);
		const next = Number.isFinite(parsed) ? Math.max(0, Math.min(parsed, max ?? parsed)) : value;
		setDraft(String(next));
		if (next !== value) onCommit(next);
	};

	return (
		<label
			className={cn(
				"flex h-10 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 transition-colors focus-within:border-[#0A84FF]/80 focus-within:bg-black/20",
				disabled && "opacity-40",
			)}
		>
			<span className="text-[12px] font-medium text-white/55">{label}</span>
			<input
				type="text"
				inputMode="numeric"
				aria-label={label}
				value={draft}
				disabled={disabled}
				onChange={(event) => setDraft(event.target.value.replace(/[^\d]/g, ""))}
				onBlur={commit}
				onKeyDown={(event) => {
					if (event.key === "Enter") event.currentTarget.blur();
					if (event.key === "Escape") {
						cancelledRef.current = true;
						setDraft(String(value));
						event.currentTarget.blur();
					}
					if (event.key === "ArrowUp" || event.key === "ArrowDown") {
						event.preventDefault();
						const step = (event.shiftKey ? 10 : 1) * (event.key === "ArrowUp" ? 1 : -1);
						const next = Math.max(
							0,
							Math.min((Number.parseInt(draft, 10) || 0) + step, max ?? 1e9),
						);
						setDraft(String(next));
						if (next !== value) onCommit(next);
					}
				}}
				className="min-w-0 flex-1 select-text bg-transparent text-right text-[12.5px] tabular-nums text-white outline-none"
			/>
			<span className="text-[11px] text-white/35">{suffix}</span>
		</label>
	);
}
