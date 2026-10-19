import type { Locator, Page } from "@playwright/test";

import { expect, installApiMock, test } from "./test";

// Deliberately omit backgroundMode to cover saved selections from older versions.
const selection = {
  tournamentId: "tournament-a",
  alphaTournamentTeamId: "team-alpha",
  bravoTournamentTeamId: "team-bravo",
  ruleId: "rule-1",
  stageId: "stage-1",
  accentColor: "#123456",
  matchLabel: "決勝",
  showPositions: false,
};

async function storeSelection(page: Page, extra: Record<string, unknown> = {}) {
  await page.goto("/");
  await page.evaluate((value) => {
    localStorage.setItem("inkling:overlay-selection", JSON.stringify(value));
  }, { ...selection, ...extra });
}

async function backgroundStyles(background: Locator) {
  return background.locator(":scope > div").evaluateAll((layers) => layers.map((layer) => {
    const style = getComputedStyle(layer);
    return {
      animation: style.animationName,
      transform: style.transform,
      artwork: style.backgroundImage,
      willChange: style.willChange,
    };
  }));
}

test("Debugの背景だけを静止・再開し、APIとカルーセルの進行を維持する", async ({ page, api }) => {
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await storeSelection(page);
  await page.goto("/?view=debug");
  const overlay = page.frameLocator('iframe[title="1920 × 1080 Overlay プレビュー"]');
  const background = overlay.locator(".overlay-background");
  const mode = page.getByLabel("背景モード");
  const active = overlay.locator(".overlay-slide.is-active");
  await expect(active.locator(".overlay-matchup")).toBeVisible();
  await expect(mode).toHaveValue("normal");
  const original = await backgroundStyles(background);
  expect(original.map((layer) => layer.animation)).toEqual(["overlay-vector-sweep", "overlay-vector-rings"]);
  const transform = original[0].transform;
  await expect.poll(async () => (await backgroundStyles(background))[0].transform).not.toBe(transform);

  await page.clock.runFor(4_000);
  const requestCount = api.requests().length;
  await mode.selectOption("lightweight");
  await expect(background).toHaveAttribute("data-mode", "lightweight");
  const stationary = await backgroundStyles(background);
  expect(stationary.map((layer) => layer.animation)).toEqual(["none", "none"]);
  expect(stationary.map((layer) => layer.willChange)).toEqual(["auto", "auto"]);
  expect(stationary.map((layer) => layer.artwork)).toEqual(original.map((layer) => layer.artwork));
  await page.clock.runFor(4_100);
  expect(await backgroundStyles(background)).toEqual(stationary);
  await expect(active.locator(".overlay-team-detail--left")).toBeVisible();
  await mode.selectOption("normal");
  await expect(background).toHaveAttribute("data-mode", "normal");
  const resumed = await backgroundStyles(background);
  expect(resumed.map((layer) => layer.animation)).toEqual(original.map((layer) => layer.animation));
  await expect.poll(async () => (await backgroundStyles(background))[0].transform).not.toBe(resumed[0].transform);
  await expect(active.locator(".overlay-team-detail--left")).toBeVisible();
  expect(api.requests()).toHaveLength(requestCount);
});

test("別ページのOverlayへ同期し、Dock・Overlay・Debugの再読込後も復元する", async ({ page }) => {
  await storeSelection(page);
  await page.goto("/?view=dock");
  const mode = page.getByLabel("背景モード");
  await expect(mode).toBeEnabled();
  const output = await page.context().newPage();
  const api = await installApiMock(output);
  await output.goto("/?view=overlay");
  const background = output.locator(".overlay-background");
  await expect.poll(() => api.matchupRequests().length, { timeout: 30_000 }).toBe(1);
  await expect(output.locator(".overlay-carousel")).toBeVisible();
  const requestCount = api.requests().length;
  await mode.selectOption("lightweight");
  await expect(background).toHaveAttribute("data-mode", "lightweight");
  expect(api.requests()).toHaveLength(requestCount);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("inkling:overlay-selection") ?? "null") as unknown)).toEqual({ ...selection, backgroundMode: "lightweight" });
  await page.reload();
  await expect(mode).toBeEnabled({ timeout: 30_000 });
  await expect(mode).toHaveValue("lightweight");
  await output.reload();
  await expect(background).toHaveAttribute("data-mode", "lightweight");
  await page.goto("/?view=debug");
  await expect(mode).toBeEnabled({ timeout: 30_000 });
  await expect(mode).toHaveValue("lightweight");
  await expect(page.frameLocator('iframe[title="1920 × 1080 Overlay プレビュー"]').locator(".overlay-background")).toHaveAttribute("data-mode", "lightweight");
  api.assertNoBrowserErrors();
  await output.close();
});

test("未知の背景モードは通常へ戻し、対戦の再反映でも軽量設定を維持する", async ({ page }) => {
  await storeSelection(page, { backgroundMode: "invalid" });
  await page.goto("/?view=debug");
  const mode = page.getByLabel("背景モード");
  await expect(mode).toHaveValue("normal");
  await mode.selectOption("lightweight");
  await page.getByLabel("BRAVO", { exact: true }).selectOption("team-charlie-a");
  await page.getByRole("button", { name: "対戦を反映", exact: true }).click();
  await expect(mode).toHaveValue("lightweight");
  await expect(page.frameLocator('iframe[title="1920 × 1080 Overlay プレビュー"]').locator(".overlay-background")).toHaveAttribute("data-mode", "lightweight");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("inkling:overlay-selection") ?? "null") as unknown)).toEqual({ ...selection, bravoTournamentTeamId: "team-charlie-a", backgroundMode: "lightweight" });
});
