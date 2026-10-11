const STORAGE_KEY = "inkling:overlay-selection";
const CHANNEL_NAME = "inkling:overlay";

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

type OverlayMessage =
  | { type: "selection"; selection: OverlaySelection }
  | { type: "stage-reveal"; request: StageRevealRequest };

type Listener = (selection: OverlaySelection | null) => void;
type StageRevealListener = (request: StageRevealRequest) => void;

const senderChannel = new BroadcastChannel(CHANNEL_NAME);

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

function parseOverlaySelection(value: unknown): OverlaySelection | null {
  if (!isRecord(value)) {
    return null;
  }

  const tournamentId = getString(value, "tournamentId");
  const alphaTournamentTeamId =
    getString(value, "alphaTournamentTeamId") ??
    getString(value, "leftTournamentTeamId");
  const bravoTournamentTeamId =
    getString(value, "bravoTournamentTeamId") ??
    getString(value, "rightTournamentTeamId");

  if (!tournamentId || !alphaTournamentTeamId || !bravoTournamentTeamId) {
    return null;
  }

  return {
    tournamentId,
    alphaTournamentTeamId,
    bravoTournamentTeamId,
    ruleId: getString(value, "ruleId") ?? "",
    stageId: getString(value, "stageId") ?? "",
    accentColor: normalizeAccentColor(value["accentColor"]),
    matchLabel: normalizeMatchLabel(value["matchLabel"]),
  };
}

function parseStoredOverlaySelection(
  value: string | null,
): OverlaySelection | null {
  if (!value) {
    return null;
  }

  try {
    return parseOverlaySelection(JSON.parse(value));
  } catch {
    return null;
  }
}

function parseStageRevealRequest(value: unknown): StageRevealRequest | null {
  if (!isRecord(value)) {
    return null;
  }

  const requestId = getString(value, "requestId");
  const ruleId = getString(value, "ruleId");
  const stageId = getString(value, "stageId");

  return requestId && ruleId && stageId
    ? { requestId, ruleId, stageId }
    : null;
}

function parseOverlayMessage(value: unknown): OverlayMessage | null {
  if (!isRecord(value)) {
    return null;
  }

  switch (value["type"]) {
    case "selection": {
      const selection = parseOverlaySelection(value["selection"]);
      return selection ? { type: "selection", selection } : null;
    }
    case "stage-reveal": {
      const request = parseStageRevealRequest(value["request"]);
      return request ? { type: "stage-reveal", request } : null;
    }
    default:
      return null;
  }
}

function postOverlayMessage(message: OverlayMessage): void {
  senderChannel.postMessage(message);
}

function subscribeOverlayMessages(
  handler: (message: OverlayMessage) => void,
): () => void {
  // 送信用のインスタンスは使い回さない。送信元には自分のメッセージが届かないため。
  const channel = new BroadcastChannel(CHANNEL_NAME);

  channel.addEventListener("message", (event: MessageEvent<unknown>) => {
    const message = parseOverlayMessage(event.data);
    if (message) {
      handler(message);
    }
  });

  return () => channel.close();
}

export function getOverlaySelection(): OverlaySelection | null {
  return parseStoredOverlaySelection(localStorage.getItem(STORAGE_KEY));
}

export function setOverlaySelection(selection: OverlaySelection): void {
  const normalizedSelection = {
    ...selection,
    accentColor: normalizeAccentColor(selection.accentColor),
    matchLabel: normalizeMatchLabel(selection.matchLabel),
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedSelection));
  postOverlayMessage({ type: "selection", selection: normalizedSelection });
}

export function subscribeOverlaySelection(listener: Listener): () => void {
  const unsubscribe = subscribeOverlayMessages((message) => {
    if (message.type === "selection") {
      listener(message.selection);
    }
  });

  // 呼び出し側の初期値だけに頼らない。初期値の読み込みから購読開始までの変更を取りこぼすため。
  listener(getOverlaySelection());

  return unsubscribe;
}

export function requestStageReveal(
  request: Pick<StageRevealRequest, "ruleId" | "stageId">,
): void {
  postOverlayMessage({
    type: "stage-reveal",
    request: { ...request, requestId: crypto.randomUUID() },
  });
}

export function subscribeStageReveal(listener: StageRevealListener): () => void {
  return subscribeOverlayMessages((message) => {
    if (message.type === "stage-reveal") {
      listener(message.request);
    }
  });
}
