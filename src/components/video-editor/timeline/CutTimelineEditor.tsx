import type { Span } from "dnd-timeline";
import { useMemo } from "react";
import {
	buildCutTimeMap,
	type CutTimeMap,
	getCutMarks,
	toCutMs,
	toCutSpan,
	toCutSplits,
	toSourceMs,
	toSourceSpan,
	toSourceSplits,
} from "./cutTime";
import TimelineEditor, { type TimelineEditorProps } from "./TimelineEditor";

type Timed = { startMs: number; endMs: number };

/** Regions as the timeline shows them; those that were cut out entirely are not shown. */
function onTimeline<T extends Timed>(map: CutTimeMap, regions: T[] | undefined): T[] | undefined {
	return regions?.flatMap((region) => {
		const span = toCutSpan(map, { start: region.startMs, end: region.endMs });
		return span ? [{ ...region, startMs: span.start, endMs: span.end }] : [];
	});
}

/**
 * The timeline as other editors have it: removing a piece of the clip closes the gap, so
 * what follows moves up and the video gets shorter. Takes the same props as TimelineEditor,
 * in the recording's own time, and shows them with the removed parts closed up; a mark
 * where each part was cut out puts it back (as does undo).
 */
export default function CutTimelineEditor(props: TimelineEditorProps) {
	const { videoDuration, trimRegions, clipSplits } = props;
	const map = useMemo(
		() => buildCutTimeMap(Math.round(videoDuration * 1000), trimRegions ?? []),
		[videoDuration, trimRegions],
	);

	const span = (cut: Span): Span => toSourceSpan(map, cut);
	const added = (handler: ((span: Span) => void) | undefined) =>
		handler && ((cut: Span) => handler(span(cut)));
	const changed = (handler: ((id: string, span: Span) => void) | undefined) =>
		handler && ((id: string, cut: Span) => handler(id, span(cut)));

	const {
		currentTime,
		getPlaybackTimeMs,
		onSeek,
		onClipSplitsChange,
		onClipPieceRemove,
		onTrimDelete,
	} = props;

	return (
		<TimelineEditor
			{...props}
			videoDuration={map.cutDurationMs / 1000}
			currentTime={toCutMs(map, currentTime * 1000) / 1000}
			getPlaybackTimeMs={getPlaybackTimeMs && (() => toCutMs(map, getPlaybackTimeMs()))}
			onSeek={onSeek && ((time) => onSeek(toSourceMs(map, time * 1000) / 1000))}
			zoomRegions={onTimeline(map, props.zoomRegions) ?? []}
			onZoomAdded={(cut) => props.onZoomAdded(span(cut))}
			onZoomSpanChange={(id, cut) => props.onZoomSpanChange(id, span(cut))}
			cameraFullscreenRegions={onTimeline(map, props.cameraFullscreenRegions)}
			onCameraFullscreenAdded={added(props.onCameraFullscreenAdded)}
			onCameraFullscreenSpanChange={changed(props.onCameraFullscreenSpanChange)}
			annotationRegions={onTimeline(map, props.annotationRegions)}
			onAnnotationAdded={added(props.onAnnotationAdded)}
			onAnnotationSpanChange={changed(props.onAnnotationSpanChange)}
			blurRegions={onTimeline(map, props.blurRegions)}
			onBlurAdded={added(props.onBlurAdded)}
			onBlurSpanChange={changed(props.onBlurSpanChange)}
			speedRegions={onTimeline(map, props.speedRegions)}
			onSpeedAdded={added(props.onSpeedAdded)}
			onSpeedSpanChange={changed(props.onSpeedSpanChange)}
			// Removed parts take no room: there is nothing of them to show or drag.
			trimRegions={[]}
			onTrimAdded={added(props.onTrimAdded)}
			clipSplits={toCutSplits(map, clipSplits ?? [])}
			onClipSplitsChange={
				onClipSplitsChange &&
				((splits) => onClipSplitsChange(toSourceSplits(map, splits, clipSplits ?? [])))
			}
			onClipPieceRemove={onClipPieceRemove && ((cut) => onClipPieceRemove(span(cut)))}
			sourceDurationMs={map.sourceDurationMs}
			cutToSourceMs={(cutMs, side) => toSourceMs(map, cutMs, side)}
			cutMarks={getCutMarks(map)}
			onRestoreCut={
				onTrimDelete &&
				((mark) => {
					for (const id of mark.trimIds) onTrimDelete(id);
				})
			}
		/>
	);
}

/** The player's time and length as the timeline shows them, for its own controls. */
export function useCutTime(
	videoDurationSeconds: number,
	trimRegions: readonly (Timed & { id: string })[],
) {
	return useMemo(() => {
		const map = buildCutTimeMap(Math.round(videoDurationSeconds * 1000), trimRegions);
		return {
			durationSeconds: map.cutDurationMs / 1000,
			toCutSeconds: (sourceSeconds: number) => toCutMs(map, sourceSeconds * 1000) / 1000,
			toSourceSeconds: (cutSeconds: number) => toSourceMs(map, cutSeconds * 1000) / 1000,
		};
	}, [videoDurationSeconds, trimRegions]);
}
