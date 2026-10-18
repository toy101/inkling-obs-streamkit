export const DEBUG_OVERLAY_SLIDES = [
  { index: 0, label: "対戦カード" },
  { index: 1, label: "アルファチーム 詳細" },
  { index: 2, label: "ブラボーチーム 詳細" },
] as const;

export const DEBUG_OVERLAY_SLIDE_MESSAGE = "inkling:debug-overlay-slide";
export const DEBUG_OVERLAY_AUTOPLAY_MESSAGE = "inkling:debug-overlay-autoplay";
export const DEBUG_OVERLAY_STAGE_REVEAL_MESSAGE =
  "inkling:debug-overlay-stage-reveal";
export const DEBUG_OVERLAY_STAGE_REVEAL_SELECTION_MESSAGE =
  "inkling:debug-overlay-stage-reveal-selection";
export const DEBUG_OVERLAY_READY_MESSAGE = "inkling:debug-overlay-ready";

export type DebugOverlaySlideIndex =
  (typeof DEBUG_OVERLAY_SLIDES)[number]["index"];

export type DebugOverlaySlideMessage = {
  slideIndex: DebugOverlaySlideIndex;
  type: typeof DEBUG_OVERLAY_SLIDE_MESSAGE;
};

export type DebugOverlayAutoplayMessage = {
  autoplay: boolean;
  type: typeof DEBUG_OVERLAY_AUTOPLAY_MESSAGE;
};

export type DebugOverlayStageRevealMessage = {
  type: typeof DEBUG_OVERLAY_STAGE_REVEAL_MESSAGE;
};

export type DebugStageRevealSelection = {
  ruleId: string;
  stageId: string;
};

export type DebugOverlayStageRevealSelectionMessage = {
  type: typeof DEBUG_OVERLAY_STAGE_REVEAL_SELECTION_MESSAGE;
  selection: DebugStageRevealSelection;
};

export type DebugOverlayReadyMessage = {
  type: typeof DEBUG_OVERLAY_READY_MESSAGE;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDebugOverlaySlideIndex(
  value: unknown,
): value is DebugOverlaySlideIndex {
  return DEBUG_OVERLAY_SLIDES.some(({ index }) => index === value);
}

export function isDebugOverlaySlideMessage(
  value: unknown,
): value is DebugOverlaySlideMessage {
  return (
    isRecord(value) &&
    value.type === DEBUG_OVERLAY_SLIDE_MESSAGE &&
    isDebugOverlaySlideIndex(value.slideIndex)
  );
}

export function isDebugOverlayAutoplayMessage(
  value: unknown,
): value is DebugOverlayAutoplayMessage {
  return (
    isRecord(value) &&
    value.type === DEBUG_OVERLAY_AUTOPLAY_MESSAGE &&
    typeof value.autoplay === "boolean"
  );
}

export function isDebugOverlayStageRevealMessage(
  value: unknown,
): value is DebugOverlayStageRevealMessage {
  return isRecord(value) && value.type === DEBUG_OVERLAY_STAGE_REVEAL_MESSAGE;
}

export function isDebugOverlayStageRevealSelectionMessage(
  value: unknown,
): value is DebugOverlayStageRevealSelectionMessage {
  return (
    isRecord(value) &&
    value.type === DEBUG_OVERLAY_STAGE_REVEAL_SELECTION_MESSAGE &&
    isRecord(value.selection) &&
    !Array.isArray(value.selection) &&
    typeof value.selection.ruleId === "string" &&
    typeof value.selection.stageId === "string"
  );
}

export function isDebugOverlayReadyMessage(
  value: unknown,
): value is DebugOverlayReadyMessage {
  return isRecord(value) && value.type === DEBUG_OVERLAY_READY_MESSAGE;
}
