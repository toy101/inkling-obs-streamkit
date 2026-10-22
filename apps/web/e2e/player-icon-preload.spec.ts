import type { Page, Route } from "@playwright/test";

import { fixtureData } from "./fixture-data";
import { expect, installApiMock, test } from "./test";

const gif = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
  "base64",
);
const frameSelector = 'iframe[title="1920 × 1080 Overlay プレビュー"]';

test.use({ reducedMotion: "reduce" });

function matchupWithIcons(prefix: string) {
  const teamWithIcons = (team: typeof fixtureData.matchup.alpha) => ({
    ...team,
    players: team.players.map((player) => ({
      ...player,
      iconUrl: `http://127.0.0.1:5173/e2e/icons/${prefix}/${player.rosterEntryId}.gif`,
    })) as typeof team.players,
  });
  return {
    ...fixtureData.matchup,
    alpha: teamWithIcons(fixtureData.matchup.alpha),
    bravo: teamWithIcons(fixtureData.matchup.bravo),
  };
}

async function respondWithIcon(route: Route) {
  await route.fulfill({
    contentType: "image/gif",
    headers: { "cache-control": "no-store" },
    body: gif,
  });
}

async function openDebug(page: Page) {
  await page.addInitScript(() => localStorage.removeItem("inkling:overlay-selection"));
  await Promise.all([
    page.waitForResponse((response) =>
      response.url().endsWith("/tournaments/tournament-a/teams"),
    ),
    page.goto("/?view=debug"),
  ]);
  const dock = page.getByRole("complementary", { name: "表示コントローラー" });
  await expect(dock.getByLabel("ALPHA")).toHaveValue("team-alpha");
  await expect(dock.getByLabel("BRAVO")).toHaveValue("team-bravo");
  return dock;
}

test("Dockの対戦反映後、最後の1人を含む8人のアイコンが読めるまで表示しない", async ({ page }) => {
  const api = await installApiMock(page, {
    fixtures: { ...fixtureData, matchup: matchupWithIcons("initial") },
  });
  let releaseLastIcon = () => {};
  const lastIcon = new Promise<void>((resolve) => { releaseLastIcon = resolve; });
  const requested = new Set<string>();
  await page.route("**/e2e/icons/**", async (route) => {
    requested.add(route.request().url());
    if (route.request().url().endsWith("bravo-4.gif")) await lastIcon;
    await respondWithIcon(route);
  });

  const dock = await openDebug(page);
  const overlay = page.frameLocator(frameSelector);
  await dock.getByRole("button", { name: "対戦を反映", exact: true }).click();
  await expect.poll(() => requested.size).toBe(8);
  await expect(overlay.locator(".overlay-carousel")).toHaveCount(0);

  releaseLastIcon();
  await expect(overlay.locator(".overlay-carousel")).toHaveCount(1);
  const icons = overlay.locator(".overlay-matchup .overlay-player-avatar img");
  await expect(icons).toHaveCount(8);
  await expect.poll(() => icons.evaluateAll((images) =>
    images.every((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0),
  )).toBe(true);
  await page.getByRole("button", { name: "アルファチーム 詳細", exact: true }).click();
  await expect(overlay.locator(".overlay-slide.is-active .overlay-player-avatar img")).toHaveCount(4);
  api.assertNoBrowserErrors();
});

test("次の対戦の読み込み中は前のカルーセルを保ち、古い読み込み結果で上書きしない", async ({ page }) => {
  const api = await installApiMock(page, {
    matchupForQuery: (query) => {
      const next = matchupWithIcons(query.alphaTournamentTeamId);
      return {
        ...next,
        alpha: { ...next.alpha, id: query.alphaTournamentTeamId, name: query.alphaTournamentTeamId },
      };
    },
  });
  let releaseOldIcons = () => {};
  const oldIcons = new Promise<void>((resolve) => { releaseOldIcons = resolve; });
  let oldIconRequests = 0;
  await page.route("**/e2e/icons/**", async (route) => {
    if (route.request().url().includes("/team-charlie-a/")) {
      oldIconRequests += 1;
      await oldIcons;
    }
    await respondWithIcon(route);
  });
  const dock = await openDebug(page);
  const overlay = page.frameLocator(frameSelector);
  const apply = dock.getByRole("button", { name: "対戦を反映", exact: true });
  await apply.click();
  await expect(overlay.locator(".overlay-carousel")).toHaveCount(1);
  await overlay.locator(".overlay-carousel").evaluate((element) => element.setAttribute("data-original", "yes"));

  await dock.getByLabel("ALPHA").selectOption("team-charlie-a");
  await apply.click();
  await expect.poll(() => oldIconRequests).toBe(8);
  await expect(overlay.locator(".overlay-carousel")).toHaveAttribute("data-original", "yes");
  await expect(overlay.locator(".overlay-team-name").first()).toHaveText("team-alpha");

  await dock.getByLabel("ALPHA").selectOption("team-bravo");
  await dock.getByLabel("BRAVO").selectOption("team-alpha");
  await apply.click();
  await expect(overlay.locator(".overlay-team-name").first()).toHaveText("team-bravo");
  releaseOldIcons();
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(overlay.locator(".overlay-team-name").first()).toHaveText("team-bravo");
  api.assertNoBrowserErrors();
});

test("不正なアイコン画像は頭文字に置き換え、正常な7人を表示する", async ({ page }) => {
  const api = await installApiMock(page, {
    fixtures: { ...fixtureData, matchup: matchupWithIcons("invalid") },
  });
  await page.route("**/e2e/icons/**", async (route) => {
    if (route.request().url().endsWith("bravo-4.gif")) {
      await route.fulfill({ contentType: "image/gif", body: "invalid image" });
    } else {
      await respondWithIcon(route);
    }
  });
  const dock = await openDebug(page);
  await dock.getByRole("button", { name: "対戦を反映", exact: true }).click();
  const matchup = page.frameLocator(frameSelector).locator(".overlay-matchup");
  await expect(matchup.locator(".overlay-player-avatar img")).toHaveCount(7);
  await expect(matchup.locator(".overlay-player-avatar span")).toHaveText("B");
  api.assertNoBrowserErrors();
});

test("応答しない画像は10秒後に頭文字に置き換え、保存した対戦の復元も完了する", async ({ page }) => {
  const api = await installApiMock(page, {
    fixtures: { ...fixtureData, matchup: matchupWithIcons("timeout") },
  });
  const now = new Date("2026-10-22T00:00:00Z");
  await page.clock.install({ time: now });
  await page.clock.pauseAt(new Date(now.getTime() + 1_000));
  let releaseIcon = () => {};
  const icon = new Promise<void>((resolve) => { releaseIcon = resolve; });
  let requested = 0;
  await page.route("**/e2e/icons/**", async (route) => {
    requested += 1;
    if (route.request().url().endsWith("alpha-1.gif")) await icon;
    await respondWithIcon(route);
  });
  await page.addInitScript(() => {
    localStorage.setItem("inkling:overlay-selection", JSON.stringify({
      tournamentId: "tournament-a", alphaTournamentTeamId: "team-alpha", bravoTournamentTeamId: "team-bravo",
      ruleId: "rule-1", stageId: "stage-1", accentColor: "#8b5cf6", matchLabel: "", showPositions: true,
    }));
  });
  await page.goto("/?view=overlay");
  await expect.poll(() => requested).toBe(8);
  await page.clock.runFor(9_000);
  await expect(page.locator(".overlay-carousel")).toHaveCount(0);
  await page.clock.runFor(1_000);
  await expect(page.locator(".overlay-matchup .overlay-player-avatar img")).toHaveCount(7);
  await expect(page.locator(".overlay-matchup .overlay-player-avatar span")).toHaveText("A");
  releaseIcon();
  api.assertNoBrowserErrors();
});
