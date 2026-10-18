export const DEBUG_OVERLAY_SLIDES = [
  { index: 0, label: "対戦カード" },
  { index: 1, label: "アルファチーム 詳細" },
  { index: 2, label: "ブラボーチーム 詳細" },
] as const;

export const DEBUG_OVERLAY_SLIDE_MESSAGE = "inkling:debug-overlay-slide";
export const DEBUG_OVERLAY_AUTOPLAY_MESSAGE =
  "inkling:debug-overlay-autoplay";
export const DEBUG_OVERLAY_STAGE_REVEAL_MESSAGE =
  "inkling:debug-overlay-stage-reveal";
export const DEBUG_OVERLAY_STAGE_REVEAL_TEXT_MESSAGE =
  "inkling:debug-overlay-stage-reveal-text";
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

export type DebugStageRevealText = {
  ruleName: string;
  ruleEn: string;
  ruleDescription: string;
  stageName: string;
  stageEn: string;
};

export type DebugOverlayStageRevealTextMessage = {
  type: typeof DEBUG_OVERLAY_STAGE_REVEAL_TEXT_MESSAGE;
  text: DebugStageRevealText;
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

export function isDebugOverlayStageRevealTextMessage(
  value: unknown,
): value is DebugOverlayStageRevealTextMessage {
  return (
    isRecord(value) &&
    value.type === DEBUG_OVERLAY_STAGE_REVEAL_TEXT_MESSAGE &&
    isRecord(value.text) &&
    !Array.isArray(value.text) &&
    typeof value.text.ruleName === "string" &&
    typeof value.text.ruleEn === "string" &&
    typeof value.text.ruleDescription === "string" &&
    typeof value.text.stageName === "string" &&
    typeof value.text.stageEn === "string"
  );
}

export function isDebugOverlayReadyMessage(
  value: unknown,
): value is DebugOverlayReadyMessage {
  return isRecord(value) && value.type === DEBUG_OVERLAY_READY_MESSAGE;
}
