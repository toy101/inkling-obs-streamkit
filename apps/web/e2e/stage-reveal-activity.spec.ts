import type { Page } from "@playwright/test";

import type { StageRevealRequest } from "../src/lib/overlay-state";
import { expect, test } from "./test";

type ActivityMockWindow = typeof window & {
  activityMock: {
    requests: StageRevealRequest[];
    inquiries: number;
    publish: (active: boolean) => void;
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
      publish: (active) => channel.postMessage({
        type: "stage-reveal-activity",
        overlayId: "delayed-overlay",
        active,
      }),
    };
    channel.addEventListener("message", (event: MessageEvent<unknown>) => {
      if (typeof event.data !== "object" || event.data === null) return;
      const message = event.data as Record<string, unknown>;
      if (message["type"] === "stage-reveal-activity-request") mock.inquiries += 1;
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

async function publishActivity(page: Page, active: boolean): Promise<void> {
  await page.evaluate((active) =>
    (window as ActivityMockWindow).activityMock.publish(active), active,
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
  await publishActivity(page, false);
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(submit).toBeDisabled();
  await expect.poll(() => page.evaluate(() =>
    (window as ActivityMockWindow).activityMock.requests.length,
  )).toBe(2);
});
