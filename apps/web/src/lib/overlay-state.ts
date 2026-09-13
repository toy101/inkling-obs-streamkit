const STORAGE_KEY = "inkling:overlay-selection";
const STAGE_REVEAL_STORAGE_KEY = "inkling:stage-reveal-request";

export const DEFAULT_ACCENT_COLOR = "#8b5cf6";
export const MATCH_LABEL_MAX_LENGTH = 40;

const ACCENT_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export function isAccentColor(value: unknown): value is string {
  return typeof value === "string" && ACCENT_COLOR_PATTERN.test(value);
}

export type OverlaySelection = {
  tournamentId: string;
  alphaTournamentTeamId: string;
  bravoTournamentTeamId: string;
  ruleId: string;
  stageId: string;
  accentColor: string;
  matchLabel: string;
};

export type StageRevealRequest = {
  requestId: string;
  ruleId: string;
  stageId: string;
};

type Listener = (selection: OverlaySelection | null) => void;
type StageRevealListener = (request: StageRevealRequest) => void;

const listeners = new Set<Listener>();
const stageRevealListeners = new Set<StageRevealListener>();

function normalizeAccentColor(value: unknown): string {
  return isAccentColor(value) ? value.toLowerCase() : DEFAULT_ACCENT_COLOR;
}

function normalizeMatchLabel(value: unknown): string {
  return typeof value === "string"
    ? value.trim().slice(0, MATCH_LABEL_MAX_LENGTH)
    : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function parseOverlaySelection(value: string | null): OverlaySelection | null {
  if (!value) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (isRecord(parsed)) {
      const tournamentId = getString(parsed, "tournamentId");
      const alphaTournamentTeamId =
        getString(parsed, "alphaTournamentTeamId") ??
        getString(parsed, "leftTournamentTeamId");
      const bravoTournamentTeamId =
        getString(parsed, "bravoTournamentTeamId") ??
        getString(parsed, "rightTournamentTeamId");

      if (!tournamentId || !alphaTournamentTeamId || !bravoTournamentTeamId) {
        return null;
      }

      return {
        tournamentId,
        alphaTournamentTeamId,
        bravoTournamentTeamId,
        ruleId: getString(parsed, "ruleId") ?? "",
        stageId: getString(parsed, "stageId") ?? "",
        accentColor: normalizeAccentColor(parsed["accentColor"]),
        matchLabel: normalizeMatchLabel(parsed["matchLabel"]),
      };
    }
  } catch {
    return null;
  }

  return null;
}

function parseStageRevealRequest(value: string | null): StageRevealRequest | null {
  if (!value) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed)) {
      return null;
    }

    const requestId = getString(parsed, "requestId");
    const ruleId = getString(parsed, "ruleId");
    const stageId = getString(parsed, "stageId");

    return requestId && ruleId && stageId
      ? { requestId, ruleId, stageId }
      : null;
  } catch {
    return null;
  }
}

export function getOverlaySelection(): OverlaySelection | null {
  return parseOverlaySelection(localStorage.getItem(STORAGE_KEY));
}

export function setOverlaySelection(selection: OverlaySelection): void {
  const normalizedSelection = {
    ...selection,
    accentColor: normalizeAccentColor(selection.accentColor),
    matchLabel: normalizeMatchLabel(selection.matchLabel),
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedSelection));

  // Debug画面など、同一window内のOverlayにも通知する。
  for (const listener of listeners) {
    listener(normalizedSelection);
  }
}

export function subscribeOverlaySelection(listener: Listener): () => void {
  listeners.add(listener);

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) {
      return;
    }

    listener(parseOverlaySelection(event.newValue));
  };

  window.addEventListener("storage", handleStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

export function requestStageReveal(
  request: Pick<StageRevealRequest, "ruleId" | "stageId">,
): void {
  const stageRevealRequest: StageRevealRequest = {
    ...request,
    requestId: crypto.randomUUID(),
  };

  localStorage.setItem(
    STAGE_REVEAL_STORAGE_KEY,
    JSON.stringify(stageRevealRequest),
  );

  for (const listener of stageRevealListeners) {
    listener(stageRevealRequest);
  }
}

export function subscribeStageReveal(listener: StageRevealListener): () => void {
  stageRevealListeners.add(listener);

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== STAGE_REVEAL_STORAGE_KEY) {
      return;
    }

    const request = parseStageRevealRequest(event.newValue);
    if (request) {
      listener(request);
    }
  };

  window.addEventListener("storage", handleStorage);

  return () => {
    stageRevealListeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}
