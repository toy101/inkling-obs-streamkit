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
  showPositions: boolean;
};

export type StageRevealRequest = {
  requestId: string;
  ruleId: string;
  stageId: string;
};

export type StageRevealAcknowledgement = {
  requestId: string;
  accepted: boolean;
};

export const STAGE_REVEAL_ACK_TIMEOUT_MS = 2_000;
const STAGE_REVEAL_ACTIVITY_QUERY_WINDOW_MS = 300;
const STAGE_REVEAL_ACTIVITY_QUERY_INTERVAL_MS = 1_000;

type OverlayMessage =
  | { type: "selection"; selection: OverlaySelection | null }
  | { type: "stage-reveal"; request: StageRevealRequest }
  | { type: "stage-reveal-activity"; overlayId: string; active: boolean; queryId: string | null }
  | { type: "stage-reveal-activity-request"; queryId: string }
  | { type: "stage-reveal-ack"; acknowledgement: StageRevealAcknowledgement };

type Listener = (selection: OverlaySelection | null) => void;
type StageRevealListener = (request: StageRevealRequest) => void;

const senderChannel = new BroadcastChannel(CHANNEL_NAME);
const overlayInstanceId = crypto.randomUUID();

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
    showPositions:
      typeof value["showPositions"] === "boolean"
        ? value["showPositions"]
        : true,
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
      if (value["selection"] === null) return { type: "selection", selection: null };
      const selection = parseOverlaySelection(value["selection"]);
      return selection ? { type: "selection", selection } : null;
    }
    case "stage-reveal": {
      const request = parseStageRevealRequest(value["request"]);
      return request ? { type: "stage-reveal", request } : null;
    }
    case "stage-reveal-activity": {
      const overlayId = getString(value, "overlayId");
      return overlayId && typeof value["active"] === "boolean"
        ? { type: "stage-reveal-activity", overlayId, active: value["active"], queryId: getString(value, "queryId") }
        : null;
    }
    case "stage-reveal-activity-request": {
      const queryId = getString(value, "queryId");
      return queryId ? { type: "stage-reveal-activity-request", queryId } : null;
    }
    case "stage-reveal-ack": {
      const acknowledgement = value["acknowledgement"];
      if (!isRecord(acknowledgement)) return null;
      const requestId = getString(acknowledgement, "requestId");
      return requestId && typeof acknowledgement["accepted"] === "boolean"
        ? { type: "stage-reveal-ack", acknowledgement: { requestId, accepted: acknowledgement["accepted"] } }
        : null;
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

export function clearOverlaySelection(): void {
  localStorage.removeItem(STORAGE_KEY);
  postOverlayMessage({ type: "selection", selection: null });
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
): string {
  const requestId = crypto.randomUUID();
  postOverlayMessage({
    type: "stage-reveal",
    request: { ...request, requestId },
  });
  return requestId;
}

export function subscribeStageReveal(listener: StageRevealListener): () => void {
  return subscribeOverlayMessages((message) => {
    if (message.type === "stage-reveal") {
      listener(message.request);
    }
  });
}

export function publishStageRevealActivity(active: boolean, queryId: string | null = null): void {
  postOverlayMessage({ type: "stage-reveal-activity", overlayId: overlayInstanceId, active, queryId });
}

export function subscribeStageRevealActivity(
  listener: (active: boolean | null) => void,
): () => void {
  const activeOverlays = new Set<string>();
  let currentQueryId = "";
  let collecting = true;
  let receivedResponse = false;
  let collectionTimeoutId = 0;
  const queryActivity = () => {
    window.clearTimeout(collectionTimeoutId);
    currentQueryId = crypto.randomUUID();
    collecting = true;
    receivedResponse = false;
    collectionTimeoutId = window.setTimeout(() => {
      collecting = false;
      listener(activeOverlays.size > 0 ? true : receivedResponse ? false : null);
    }, STAGE_REVEAL_ACTIVITY_QUERY_WINDOW_MS);
    postOverlayMessage({ type: "stage-reveal-activity-request", queryId: currentQueryId });
  };
  const unsubscribe = subscribeOverlayMessages((message) => {
    if (message.type !== "stage-reveal-activity") return;
    // A late idle response from an earlier inquiry cannot clear newer activity.
    if (!message.active && message.queryId !== null && message.queryId !== currentQueryId) return;
    if (message.queryId === currentQueryId) receivedResponse = true;
    if (message.active) {
      activeOverlays.add(message.overlayId);
      listener(true);
    } else {
      activeOverlays.delete(message.overlayId);
      // An unsolicited idle is discovery/completion, not a complete global snapshot.
      if (message.queryId === null) queryActivity();
      else if (!collecting) listener(activeOverlays.size > 0);
    }
  });
  queryActivity();
  const intervalId = window.setInterval(queryActivity, STAGE_REVEAL_ACTIVITY_QUERY_INTERVAL_MS);
  return () => {
    window.clearTimeout(collectionTimeoutId);
    window.clearInterval(intervalId);
    unsubscribe();
  };
}

export function subscribeStageRevealActivityRequest(
  listener: (queryId: string) => void,
): () => void {
  return subscribeOverlayMessages((message) => {
    if (message.type === "stage-reveal-activity-request") listener(message.queryId);
  });
}

export function publishStageRevealAcknowledgement(requestId: string, accepted: boolean): void {
  postOverlayMessage({ type: "stage-reveal-ack", acknowledgement: { requestId, accepted } });
}

export function subscribeStageRevealAcknowledgement(
  listener: (acknowledgement: StageRevealAcknowledgement) => void,
): () => void {
  return subscribeOverlayMessages((message) => {
    if (message.type === "stage-reveal-ack") listener(message.acknowledgement);
  });
}
