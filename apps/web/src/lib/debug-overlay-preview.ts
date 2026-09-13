export const DEBUG_OVERLAY_SLIDES = [
  { index: 0, label: "対戦カード" },
  { index: 1, label: "アルファチーム 詳細" },
  { index: 2, label: "ブラボーチーム 詳細" },
] as const;

export const DEBUG_OVERLAY_SLIDE_MESSAGE = "inkling:debug-overlay-slide";
export const DEBUG_OVERLAY_AUTOPLAY_MESSAGE =
  "inkling:debug-overlay-autoplay";

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
