import { Check, Save, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { ExportQuality, Mp4FrameRate } from "@/lib/exporter";
import {
	getRecordingRecipeSummary,
	type RecordingCountdownSeconds,
	type RecordingRecipe,
	type RecordingRecipeSettings,
} from "@/lib/recordingRecipes";
import { Button } from "../ui/button";
import hud from "./hud.module.css";

interface RecordingRecipePanelProps {
	recipes: RecordingRecipe[];
	selectedRecipe: RecordingRecipe | null;
	modified: boolean;
	currentSettings: RecordingRecipeSettings;
	onApply: (recipe: RecordingRecipe) => void;
	onSave: (name: string) => void;
	onDelete: (recipeId: string) => void;
	onChangeCountdown: (value: RecordingCountdownSeconds) => void;
	onChangeExportQuality: (value: ExportQuality) => void;
	onChangeFrameRate: (value: Mp4FrameRate) => void;
	onClose: () => void;
}

const COUNTDOWN_OPTIONS: RecordingCountdownSeconds[] = [0, 3, 5];
const QUALITY_OPTIONS: Array<{ value: ExportQuality; label: string }> = [
	{ value: "medium", label: "720p" },
	{ value: "good", label: "1080p" },
	{ value: "source", label: "Source" },
];
const FRAME_RATE_OPTIONS: Mp4FrameRate[] = [30, 60];

export function RecordingRecipePanel({
	recipes,
	selectedRecipe,
	modified,
	currentSettings,
	onApply,
	onSave,
	onDelete,
	onChangeCountdown,
	onChangeExportQuality,
	onChangeFrameRate,
	onClose,
}: RecordingRecipePanelProps) {
	const [name, setName] = useState("");
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [onClose]);

	const saveRecipe = () => {
		onSave(name);
		setName("");
	};

	return (
		<div className={`${hud.panel} ${hud.materialize} w-[390px] overflow-hidden text-white`}>
			<div className="flex items-start justify-between border-b border-white/[0.07] px-4 py-3">
				<div>
					<div className="text-[13px] font-semibold">Recording presets</div>
					<div className="mt-0.5 text-[11px] text-white/50">
						Restore a whole recording setup in one click.
					</div>
				</div>
				<button
					type="button"
					onClick={onClose}
					aria-label="Close recording presets"
					className="flex h-7 w-7 items-center justify-center rounded-lg text-white/45 transition-colors hover:bg-white/[0.08] hover:text-white"
				>
					<X size={15} />
				</button>
			</div>

			<div className="max-h-[250px] space-y-1 overflow-y-auto p-2">
				{recipes.map((recipe) => {
					const selected = selectedRecipe?.id === recipe.id;
					return (
						<div
							key={recipe.id}
							className={`group flex items-center rounded-xl border transition-colors ${
								selected
									? "border-emerald-400/35 bg-emerald-400/[0.08]"
									: "border-transparent hover:border-white/[0.07] hover:bg-white/[0.04]"
							}`}
						>
							<button
								type="button"
								onClick={() => onApply(recipe)}
								className="min-w-0 flex-1 px-3 py-2.5 text-left"
							>
								<div className="flex items-center gap-2">
									<span className="text-[11px] font-semibold text-white/90">{recipe.name}</span>
									{recipe.builtIn && (
										<span className="rounded-full bg-white/[0.07] px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-white/40">
											Built in
										</span>
									)}
									{selected && modified && (
										<span className="text-[9px] font-medium text-amber-300/80">Edited</span>
									)}
									{selected && !modified && <Check size={13} className="text-emerald-300" />}
								</div>
								<div className="mt-1 truncate text-[9px] text-white/38">
									{getRecordingRecipeSummary(recipe.settings)}
								</div>
							</button>
							{!recipe.builtIn && (
								<button
									type="button"
									onClick={() => onDelete(recipe.id)}
									aria-label={`Delete ${recipe.name}`}
									className="mr-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white/25 opacity-0 transition-all hover:bg-red-400/10 hover:text-red-300 group-hover:opacity-100 focus:opacity-100"
								>
									<Trash2 size={13} />
								</button>
							)}
						</div>
					);
				})}
			</div>

			<div className="border-t border-white/[0.07] bg-white/[0.018] px-3 py-3">
				<div className="grid grid-cols-[1fr_1.35fr_0.8fr] gap-2">
					<RecipeSegment
						label="Countdown"
						options={COUNTDOWN_OPTIONS.map((value) => ({
							value,
							label: value === 0 ? "Off" : `${value}s`,
						}))}
						value={currentSettings.countdownSeconds}
						onChange={onChangeCountdown}
					/>
					<RecipeSegment
						label="Quality"
						options={QUALITY_OPTIONS}
						value={currentSettings.exportQuality}
						onChange={onChangeExportQuality}
					/>
					<RecipeSegment
						label="FPS"
						options={FRAME_RATE_OPTIONS.map((value) => ({ value, label: String(value) }))}
						value={currentSettings.frameRate}
						onChange={onChangeFrameRate}
					/>
				</div>

				<div className="mt-3 flex gap-2">
					<input
						type="text"
						value={name}
						onChange={(event) => setName(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter") saveRecipe();
						}}
						maxLength={40}
						placeholder="Recipe name"
						aria-label="Recipe name"
						className="h-8 min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-white/[0.045] px-2.5 text-[10px] text-white outline-none placeholder:text-white/25 focus:border-emerald-400/45"
					/>
					<Button
						type="button"
						onClick={saveRecipe}
						disabled={!name.trim()}
						className="h-8 gap-1.5 rounded-lg bg-white px-3 text-[10px] font-semibold text-[#171012] hover:bg-white/90 disabled:opacity-30"
					>
						<Save size={12} />
						Save current
					</Button>
				</div>
			</div>
		</div>
	);
}

function RecipeSegment<T extends string | number>({
	label,
	options,
	value,
	onChange,
}: {
	label: string;
	options: Array<{ value: T; label: string }>;
	value: T;
	onChange: (value: T) => void;
}) {
	return (
		<fieldset>
			<legend className="mb-1 text-[8px] font-semibold uppercase tracking-[0.1em] text-white/30">
				{label}
			</legend>
			<div className="flex rounded-lg bg-white/[0.045] p-0.5">
				{options.map((option) => (
					<button
						key={option.value}
						type="button"
						onClick={() => onChange(option.value)}
						aria-pressed={value === option.value}
						className={`h-6 min-w-0 flex-1 rounded-md px-1 text-[8px] font-medium transition-colors ${
							value === option.value
								? "bg-white text-[#171012] shadow-sm"
								: "text-white/40 hover:text-white/70"
						}`}
					>
						{option.label}
					</button>
				))}
			</div>
		</fieldset>
	);
}
