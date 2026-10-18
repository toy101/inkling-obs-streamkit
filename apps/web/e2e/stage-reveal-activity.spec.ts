import type { Page } from "@playwright/test";

import type { StageRevealRequest } from "../src/lib/overlay-state";
import { expect, test } from "./test";

type ActivityMockWindow = typeof window & {
  activityMock: {
    requests: StageRevealRequest[];
    inquiries: number;
    queryIds: string[];
    enabledCount: number;
    switchActiveOnNextQuery: boolean;
    responders: Record<string, boolean>;
    publish: (active: boolean, overlayId: string, queryId: string | null) => void;
    acknowledge: (index: number, accepted: boolean) => void;
  };
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("inkling:overlay-selection", JSON.stringify({
      tournamentId: "tournament-a",
      alphaTournamentTeamId: "team-alpha",
      bravoTournamentTeamId: "team-bravo",
      ruleId: "rule-1",
      stageId: "stage-1",
      accentColor: "#8b5cf6",
      matchLabel: "",
      showPositions: true,
    }));
    const channel = new BroadcastChannel("inkling:overlay");
    const mock: ActivityMockWindow["activityMock"] = {
      requests: [],
      inquiries: 0,
      queryIds: [],
      enabledCount: 0,
      switchActiveOnNextQuery: false,
      responders: {},
      publish: (active, overlayId, queryId) => channel.postMessage({
        type: "stage-reveal-activity",
        overlayId,
        active,
        queryId,
      }),
      acknowledge: (index, accepted) => {
        const request = mock.requests[index];
        if (!request) throw new Error("Missing stage reveal request.");
        channel.postMessage({
          type: "stage-reveal-ack",
          acknowledgement: { requestId: request.requestId, accepted },
        });
      },
    };
    channel.addEventListener("message", (event: MessageEvent<unknown>) => {
      if (typeof event.data !== "object" || event.data === null) return;
      const message = event.data as Record<string, unknown>;
      if (message["type"] === "stage-reveal-activity-request") {
        mock.inquiries += 1;
        if (typeof message["queryId"] === "string") mock.queryIds.push(message["queryId"]);
        if (mock.switchActiveOnNextQuery && typeof message["queryId"] === "string") {
          mock.switchActiveOnNextQuery = false;
          mock.responders["active-overlay"] = false;
          mock.responders["other-active-overlay"] = true;
          mock.publish(false, "active-overlay", null);
          mock.publish(true, "other-active-overlay", message["queryId"]);
        }
        if (typeof message["queryId"] === "string") {
          for (const [overlayId, active] of Object.entries(mock.responders)) {
            mock.publish(active, overlayId, message["queryId"]);
          }
        }
      }
      if (message["type"] !== "stage-reveal") return;
      const value = message["request"];
      if (typeof value !== "object" || value === null) return;
      const request = value as Record<string, unknown>;
      if (
        typeof request["requestId"] === "string" &&
        typeof request["ruleId"] === "string" &&
        typeof request["stageId"] === "string"
      ) {
        mock.requests.push({
          requestId: request["requestId"],
          ruleId: request["ruleId"],
          stageId: request["stageId"],
        });
      }
    });
    (window as ActivityMockWindow).activityMock = mock;
  });
});

async function waitForDock(page: Page): Promise<void> {
  await expect(page.getByRole("button", { name: "ポジション表示: オン", exact: true })).toBeEnabled();
  await expect.poll(() => page.evaluate(() =>
    (window as ActivityMockWindow).activityMock.inquiries,
  )).toBeGreaterThan(0);
}

async function publishActivity(
  page: Page,
  active: boolean,
  overlayId = "delayed-overlay",
  queryId: string | null = null,
): Promise<void> {
  await page.evaluate(({ active, overlayId, queryId }) => {
    const mock = (window as ActivityMockWindow).activityMock;
    if (queryId === null) mock.responders[overlayId] = active;
    mock.publish(active, overlayId, queryId);
  },
    { active, overlayId, queryId },
  );
  // Let the real BroadcastChannel response and React render finish.
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

test("Dockは状態通知を待つ間と再読込直後に再生ボタンを無効化する", async ({ page }) => {
  await page.goto("/?view=dock");
  await waitForDock(page);
  const submit = page.getByRole("button", { name: "確定・動画再生", exact: true });
  await expect(submit).toBeDisabled();
  await publishActivity(page, true);
  await expect(submit).toBeDisabled();

  await page.reload();
  await waitForDock(page);
  await expect(submit).toBeDisabled();
  await publishActivity(page, true);
  await expect(submit).toBeDisabled();
  await publishActivity(page, false);
  await expect(submit).toBeEnabled();
});

test("Overlayの応答が遅れても送信直後から二重送信を防ぐ", async ({ page }) => {
  await page.goto("/?view=dock");
  await waitForDock(page);
  const submit = page.getByRole("button", { name: "確定・動画再生", exact: true });
  await publishActivity(page, false);
  await expect(submit).toBeEnabled();
  await submit.evaluate((button) => {
    const form = button.closest("form");
    if (!form) throw new Error("Missing stage reveal form.");
    form.requestSubmit();
    form.requestSubmit();
  });
  await expect(submit).toBeDisabled();
  await expect.poll(() => page.evaluate(() =>
    (window as ActivityMockWindow).activityMock.requests.length,
  )).toBe(1);

  // A delayed idle snapshot must not unlock a request awaiting acceptance.
  await publishActivity(page, false);
  await expect(submit).toBeDisabled();
  await publishActivity(page, true);
  await expect(submit).toBeDisabled();
  await page.evaluate(() => (window as ActivityMockWindow).activityMock.acknowledge(0, true));
  await publishActivity(page, false);
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(submit).toBeDisabled();
  await expect.poll(() => page.evaluate(() =>
    (window as ActivityMockWindow).activityMock.requests.length,
  )).toBe(2);
});

test("応答のない要求はタイムアウトし、Overlay復帰後に再読込せず再送信できる", async ({ page }) => {
  await page.goto("/?view=dock");
  await waitForDock(page);
  const submit = page.getByRole("button", { name: "確定・動画再生", exact: true });
  await publishActivity(page, false);
  await expect(submit).toBeEnabled();
  await page.evaluate(() => { (window as ActivityMockWindow).activityMock.responders = {}; });
  await submit.click();
  await expect.poll(() => page.evaluate(() =>
    (window as ActivityMockWindow).activityMock.requests.length,
  )).toBe(1);
  await expect(page.getByRole("status")).toContainText("Overlayから応答がありません", { timeout: 4_000 });
  await expect(submit).toBeDisabled();

  // The source is available again; no Dock reload is needed to clear pending.
  await publishActivity(page, false);
  await expect(submit).toBeEnabled();
  await expect(page.getByRole("status")).toHaveCount(0);
  await submit.click();
  await expect.poll(() => page.evaluate(() =>
    (window as ActivityMockWindow).activityMock.requests.length,
  )).toBe(2);
  await publishActivity(page, true);
  await page.evaluate(() => (window as ActivityMockWindow).activityMock.acknowledge(1, true));
  const inquiryCount = await page.evaluate(() => (window as ActivityMockWindow).activityMock.inquiries);
  await expect.poll(() => page.evaluate(() =>
    (window as ActivityMockWindow).activityMock.inquiries,
  ), { timeout: 5_000 }).toBeGreaterThan(inquiryCount + 2);
  await expect(submit).toBeDisabled();
  await publishActivity(page, false);
  await expect(submit).toBeEnabled();
});

test("終了通知なしで消えたOverlayは失効し、別Overlayの復帰後に再送信できる", async ({ page }) => {
  await page.goto("/?view=dock");
  await waitForDock(page);
  const submit = page.getByRole("button", { name: "確定・動画再生", exact: true });
  await publishActivity(page, true, "crashed-overlay");
  await expect(submit).toBeDisabled();
  const inquiryCount = await page.evaluate(() => {
    const mock = (window as ActivityMockWindow).activityMock;
    // Simulate a crash: this source disappears without publishing idle.
    delete mock.responders["crashed-overlay"];
    return mock.inquiries;
  });
  await publishActivity(page, false, "replacement-overlay");
  await expect.poll(() => page.evaluate(() =>
    (window as ActivityMockWindow).activityMock.inquiries,
  )).toBeGreaterThan(inquiryCount);
  // One missed response must not immediately discard known activity.
  await expect(submit).toBeDisabled();
  await expect(submit).toBeEnabled({ timeout: 7_000 });
  await submit.click();
  await expect.poll(() => page.evaluate(() =>
    (window as ActivityMockWindow).activityMock.requests.length,
  )).toBe(1);
});

test("応答を続けるOverlayの紹介は有効期限を越えても再生ボタンを無効に保つ", async ({ page }) => {
  await page.goto("/?view=dock");
  await waitForDock(page);
  const submit = page.getByRole("button", { name: "確定・動画再生", exact: true });
  await publishActivity(page, true);
  const inquiryCount = await page.evaluate(() =>
    (window as ActivityMockWindow).activityMock.inquiries,
  );
  await expect.poll(() => page.evaluate(() =>
    (window as ActivityMockWindow).activityMock.inquiries,
  ), { timeout: 9_000 }).toBeGreaterThan(inquiryCount + 6);
  await expect(submit).toBeDisabled();
  await publishActivity(page, false);
  await expect(submit).toBeEnabled();
});

test("複数Overlayでは先着idleで有効化せず、古い照会のidleも無視する", async ({ page }) => {
  await page.goto("/?view=dock");
  await waitForDock(page);
  const submit = page.getByRole("button", { name: "確定・動画再生", exact: true });
  await submit.evaluate((element) => {
    const button = element as HTMLButtonElement;
    const observer = new MutationObserver(() => {
      if (!button.disabled) (window as ActivityMockWindow).activityMock.enabledCount += 1;
    });
    observer.observe(button, { attributes: true, attributeFilter: ["disabled"] });
  });
  const initialQuery = await page.evaluate(() =>
    (window as ActivityMockWindow).activityMock.queryIds.at(-1) ?? "",
  );
  await publishActivity(page, false, "idle-overlay", initialQuery);
  await expect(submit).toBeDisabled();
  await publishActivity(page, true, "active-overlay", initialQuery);
  await expect.poll(() => page.evaluate(() =>
    (window as ActivityMockWindow).activityMock.queryIds.at(-1),
  )).not.toBe(initialQuery);
  await expect(submit).toBeDisabled();
  expect(await page.evaluate(() => (window as ActivityMockWindow).activityMock.enabledCount)).toBe(0);

  await publishActivity(page, false, "active-overlay", initialQuery);
  await expect(submit).toBeDisabled();
  await page.evaluate(() => { (window as ActivityMockWindow).activityMock.switchActiveOnNextQuery = true; });
  await expect.poll(() => page.evaluate(() =>
    (window as ActivityMockWindow).activityMock.switchActiveOnNextQuery,
  )).toBe(false);
  await expect(submit).toBeDisabled();
  expect(await page.evaluate(() => (window as ActivityMockWindow).activityMock.enabledCount)).toBe(0);
  await publishActivity(page, false, "other-active-overlay");
  await expect(submit).toBeEnabled();
});
