import type { Locator, Page } from "@playwright/test";

import { fixtureData } from "./fixture-data";
import { installStageVideoMock } from "./stage-video-mock";
import type { StageVideoMockWindow } from "./stage-video-mock";
import { expect, installApiMock, test as base } from "./test";
import type { InstalledApiMock, OverlayMatchupRequest } from "./test";

const secondRule = {
  id: "rule-2",
  name: "テストルール2",
  en: "Rule Two",
  description: "Second fixture rule description.",
};
const secondStage = { id: "stage-2", name: "テストステージ2", en: "Stage Two" };
const revealFixtures = {
  ...fixtureData,
  rules: [...fixtureData.rules, secondRule],
  stages: [...fixtureData.stages, secondStage],
};

const apiOptions = {
  fixtures: revealFixtures,
  matchupForQuery: (query: OverlayMatchupRequest["query"]) => {
    const rule = revealFixtures.rules.find((rule) => rule.id === query.ruleId);
    const stage = revealFixtures.stages.find((stage) => stage.id === query.stageId);
    if (!rule || !stage) throw new Error("Unknown reveal rule or stage.");
    return { ...fixtureData.matchup, rule, stage };
  },
};

const test = base.extend<{ api: InstalledApiMock }>({
  api: async ({ page }, provide) => {
    const api = await installApiMock(page, apiOptions);
    await provide(api);
    api.assertNoBrowserErrors();
  },
});

async function prepareMedia(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-01-01T00:01:00Z"));
  await installStageVideoMock(page);
  await page.route("**/*", async (route) => {
    const origin = new URL(route.request().url()).origin;
    if (origin === "http://127.0.0.1:5173" || origin === "http://127.0.0.1:3000") {
      await route.fallback();
      return;
    }
    await route.abort("failed");
    throw new Error(`Unexpected external request: ${route.request().url()}`);
  });
  await page.route("**/stage-reveal-vignette.png", async (route) => {
    await route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',
    });
  });
}

test.beforeEach(async ({ page }) => {
  await prepareMedia(page);
});

async function prepareDebug(page: Page, api: InstalledApiMock): Promise<Locator> {
  await page.goto("/?view=debug");
  const dock = page.getByRole("complementary", { name: "表示コントローラー" });
  const root = page.frameLocator(
    'iframe[title="1920 × 1080 Overlay プレビュー"]',
  ).locator("main.overlay");
  await expect(root).toBeVisible();
  await expect(dock.getByRole("button", { name: "対戦を反映", exact: true })).toBeEnabled();
  await dock.getByRole("button", { name: "対戦を反映", exact: true }).click();
  await expect.poll(() => api.matchupRequests().length).toBe(1);
  await assertMatchup(root);
  return root;
}

async function readDownloads(root: Locator) {
  return root.evaluate(() => (window as StageVideoMockWindow).stageVideoMock.requests());
}

async function assertMatchup(root: Locator): Promise<void> {
  const active = root.locator(".overlay-slide.is-active");
  await expect(active.getByRole("heading", { name: "Tournament One" })).toBeVisible();
  await expect(active.getByText("Alpha One", { exact: true })).toBeVisible();
  await expect(active.getByText("Bravo One", { exact: true })).toBeVisible();
}

async function assertNoReveal(root: Locator): Promise<void> {
  await expect(root.locator(".overlay-stage-reveal")).toHaveCount(0);
  await expect(root.getByLabel("選択ステージ紹介動画")).toHaveCount(0);
  await expect(root.locator(".overlay-stage-transition")).toHaveCount(0);
}

async function completeDownload(page: Page, root: Locator, index = 0): Promise<void> {
  // Run the previous-playback cleanup before releasing the pending response.
  await page.clock.runFor(1);
  await root.evaluate((_element, index) => {
    const mock = (window as StageVideoMockWindow).stageVideoMock;
    mock.respond(index);
    mock.finishBody(index);
  }, index);
}

async function assertPlaying(page: Page, root: Locator): Promise<void> {
  await expect(root.locator(".overlay-stage-reveal.is-ready")).toHaveCount(1);
  await page.clock.runFor(50);
  await expect(root.locator(".overlay-stage-reveal.is-entering")).toHaveCount(1);
  await page.clock.runFor(150);
  await expect(root.locator(".overlay-stage-reveal.is-playing")).toBeVisible();
  const video = root.getByLabel("選択ステージ紹介動画");
  await expect(video).toHaveAttribute("src", /^blob:/);
  await expect.poll(() => video.evaluate((element) => {
    const video = element as HTMLVideoElement;
    return video.readyState >= 2 && !video.paused && video.error === null;
  })).toBe(true);
  // Keep native decoding/playback assertions, then control media events explicitly.
  await video.evaluate((element) => (element as HTMLVideoElement).pause());
}

async function assertRevealSelection(
  root: Locator,
  rule = fixtureData.matchup.rule,
  stage = fixtureData.matchup.stage,
): Promise<void> {
  await expect(root.locator(".overlay-stage-reveal-rule span")).toHaveText(rule.name);
  await expect(root.locator(".overlay-stage-reveal-rule strong")).toHaveText(rule.en);
  await expect(root.locator(".overlay-stage-reveal-rule p")).toHaveText(rule.description);
  await expect(root.locator(".overlay-stage-reveal-stage span")).toHaveText(stage.name);
  await expect(root.locator(".overlay-stage-reveal-stage strong")).toHaveText(stage.en.replace(" ", ""));
}

test("Debugでルール・ステージを選び直しても同じ動画を維持し、元の表示に戻せる", async ({ page, api }) => {
  const root = await prepareDebug(page, api);
  await page.getByRole("button", { name: "ステージ・ルール紹介", exact: true }).click();
  await expect.poll(() => readDownloads(root)).toHaveLength(1);
  await completeDownload(page, root);
  await assertPlaying(page, root);
  const video = root.getByLabel("選択ステージ紹介動画");
  const originalVideo = await video.elementHandle();
  const originalSource = await video.getAttribute("src");
  if (!originalVideo || !originalSource) throw new Error("Missing preview video.");
  await video.evaluate((element) => { (element as HTMLVideoElement).currentTime = 0.3; });
  const originalSelection = await page.evaluate(() => localStorage.getItem("inkling:overlay-selection"));

  await page.getByText("紹介テキストを上書き", { exact: true }).click();
  const previewRule = page.getByRole("combobox", { name: "プレビュールール", exact: true });
  const previewStage = page.getByRole("combobox", { name: "プレビューステージ", exact: true });
  await previewRule.selectOption(secondRule.id);
  await assertRevealSelection(root, secondRule);
  await previewStage.selectOption(secondStage.id);
  await assertRevealSelection(root, secondRule, secondStage);
  await page.getByRole("button", { name: "元の表示に戻す", exact: true }).click();
  await expect(previewRule).toHaveValue("");
  await expect(previewStage).toHaveValue("");
  await assertRevealSelection(root);

  for (const invalid of ["source", "origin", "payload", "unknown-id"] as const) {
    await root.evaluate((_element, { invalid, selection }) => {
      const value = invalid === "payload" ? { ruleId: 123 }
        : invalid === "unknown-id" ? { ruleId: "missing", stageId: "missing" }
        : selection;
      window.dispatchEvent(new MessageEvent("message", {
        source: invalid === "source" ? window : window.parent,
        origin: invalid === "origin" ? "https://example.invalid" : location.origin,
        data: { type: "inkling:debug-overlay-stage-reveal-selection", selection: value },
      }));
    }, { invalid, selection: { ruleId: secondRule.id, stageId: secondStage.id } });
    await page.clock.runFor(1);
    await assertRevealSelection(root);
  }

  expect(await video.evaluate((element, original) => element === original, originalVideo)).toBe(true);
  await expect(video).toHaveAttribute("src", originalSource);
  await expect(video).toHaveJSProperty("loop", true);
  expect(await video.evaluate((element) => (element as HTMLVideoElement).currentTime)).toBeCloseTo(0.3, 1);
  expect(await readDownloads(root)).toHaveLength(1);
  expect(api.matchupRequests()).toHaveLength(1);
  expect(await page.evaluate(() => localStorage.getItem("inkling:overlay-selection"))).toBe(originalSelection);
  await video.evaluate((element) => { void (element as HTMLVideoElement).play(); });
  await expect(video).toHaveJSProperty("paused", false);
});

test("Debugの選択は取得中・遷移中も変更でき、通常の紹介には適用しない", async ({ page, api }) => {
  const root = await prepareDebug(page, api);
  await page.getByText("紹介テキストを上書き", { exact: true }).click();
  const previewRule = page.getByRole("combobox", { name: "プレビュールール", exact: true });
  const previewStage = page.getByRole("combobox", { name: "プレビューステージ", exact: true });
  await previewStage.selectOption(secondStage.id);
  await page.getByRole("button", { name: "ステージ・ルール紹介", exact: true }).click();
  await expect.poll(() => readDownloads(root)).toHaveLength(1);
  await previewStage.selectOption("");
  await completeDownload(page, root);
  await expect(root.locator(".overlay-stage-reveal.is-ready")).toHaveCount(1);
  await assertRevealSelection(root);
  await page.clock.runFor(50);
  await expect(root.locator(".overlay-stage-reveal.is-entering")).toHaveCount(1);
  await previewRule.selectOption(secondRule.id);
  await page.clock.runFor(150);
  await expect(root.locator(".overlay-stage-reveal.is-playing")).toBeVisible();
  await assertRevealSelection(root, secondRule);
  expect(await readDownloads(root)).toHaveLength(1);

  await page.getByRole("button", { name: "対戦カード", exact: true }).click();
  await page.clock.runFor(1);
  await page.getByRole("button", { name: "確定・動画再生", exact: true }).click();
  await expect.poll(() => readDownloads(root)).toHaveLength(2);
  await completeDownload(page, root, 1);
  await assertPlaying(page, root);
  await previewStage.selectOption(secondStage.id);
  await assertRevealSelection(root);
  await expect(root.getByLabel("選択ステージ紹介動画")).toHaveJSProperty("loop", false);
});

test("動画のヘッダーと本文の完了後だけ選択した紹介を開始し、自動切替を止める", async ({ page, api }) => {
  const root = await prepareDebug(page, api);
  await page.getByLabel("ルール", { exact: true }).selectOption(secondRule.id);
  await page.getByLabel("ステージ", { exact: true }).selectOption(secondStage.id);
  await page.clock.runFor(50);
  await assertNoReveal(root);
  await assertMatchup(root);
  expect(api.matchupRequests()).toHaveLength(1);
  await page.getByRole("button", { name: "確定・動画再生", exact: true }).click();
  await expect.poll(() => api.matchupRequests().length).toBe(2);
  expect(api.matchupRequests()[1]?.query).toEqual({
    tournamentId: "tournament-a",
    alphaTournamentTeamId: "team-alpha",
    bravoTournamentTeamId: "team-bravo",
    ruleId: secondRule.id,
    stageId: secondStage.id,
  });
  await expect.poll(() => readDownloads(root)).toHaveLength(1);
  await page.clock.fastForward(1_000);
  await assertNoReveal(root);
  await assertMatchup(root);
  expect(await root.evaluate(() =>
    (window as StageVideoMockWindow).stageVideoMock.createdUrls,
  )).toEqual([]);

  await root.evaluate(() => (window as StageVideoMockWindow).stageVideoMock.respond(0));
  await page.clock.fastForward(1_000);
  expect((await readDownloads(root))[0]).toMatchObject({
    headersSent: true, bodyCompleted: false, hasAbortSignal: true, aborted: false,
  });
  await assertNoReveal(root);
  expect(await root.evaluate(() =>
    (window as StageVideoMockWindow).stageVideoMock.createdUrls,
  )).toEqual([]);

  await root.evaluate(() => (window as StageVideoMockWindow).stageVideoMock.finishBody(0));
  await assertPlaying(page, root);
  const reveal = root.locator(".overlay-stage-reveal");
  await expect(reveal.getByRole("region", { name: "選択ルール" })).toContainText(secondRule.name);
  await expect(reveal.getByRole("region", { name: "選択ルール" })).toContainText(secondRule.description);
  await expect(reveal.getByRole("region", { name: "選択ステージ" })).toContainText(secondStage.name);
  await expect(root.locator(".overlay-carousel")).toHaveClass(/is-paused/);
  await expect(root.locator(".overlay-carousel")).toHaveAttribute("data-autoplay", "true");
  await page.clock.fastForward(16_000);
  await assertMatchup(root);
  await expect(reveal).toHaveClass(/is-playing/);
  expect(api.matchupRequests()).toHaveLength(2);
});

for (const event of ["ended", "error"] as const) {
  test(`動画の${event}後に退出し、Blob URLを解放して自動切替へ戻る`, async ({ page, api }) => {
    if (event === "error") api.allowConsoleError("ステージ動画を再生できませんでした");
    const root = await prepareDebug(page, api);
    await page.getByRole("button", { name: "確定・動画再生", exact: true }).click();
    await expect.poll(() => readDownloads(root)).toHaveLength(1);
    await completeDownload(page, root);
    await assertPlaying(page, root);
    const sourceUrl = await root.getByLabel("選択ステージ紹介動画").getAttribute("src");

    await root.getByLabel("選択ステージ紹介動画").dispatchEvent(event, { bubbles: false });
    await expect(root.locator(".overlay-stage-reveal.is-exiting")).toHaveCount(1);
    await page.clock.runFor(149);
    await expect(root.locator(".overlay-stage-reveal.is-exiting")).toHaveCount(1);
    await page.clock.runFor(1);
    await assertNoReveal(root);
    await assertMatchup(root);
    await expect.poll(() => root.evaluate(() =>
      (window as StageVideoMockWindow).stageVideoMock.revokedUrls,
    )).toEqual([sourceUrl]);
    await page.clock.fastForward(8_000);
    await expect(root.locator(".overlay-slide.is-active .overlay-team-detail--left")).toBeVisible();
    expect(api.matchupRequests()).toHaveLength(1);

    await page.getByRole("button", { name: "確定・動画再生", exact: true }).click();
    await expect.poll(() => readDownloads(root)).toHaveLength(2);
    await completeDownload(page, root, 1);
    await assertPlaying(page, root);
  });
}

for (const failure of ["http", "network"] as const) {
  test(`動画の${failure}失敗時は紹介を開始せず、対戦表示を維持して再試行できる`, async ({ page, api }) => {
    api.allowConsoleError(failure === "http"
      ? "ステージ動画のダウンロードに失敗しました: 503"
      : "Failed to fetch");
    const root = await prepareDebug(page, api);
    await page.getByRole("button", { name: "確定・動画再生", exact: true }).click();
    await expect.poll(() => readDownloads(root)).toHaveLength(1);
    await root.evaluate((_element, failure) => {
      const mock = (window as StageVideoMockWindow).stageVideoMock;
      if (failure === "http") mock.respond(0, 503);
      else mock.failNetwork(0);
    }, failure);
    // Cleanup aborts this request, proving that the rejection has been handled.
    await expect.poll(async () => (await readDownloads(root))[0]?.aborted).toBe(true);
    await page.clock.fastForward(1_000);
    await assertNoReveal(root);
    await assertMatchup(root);
    expect(await root.evaluate(() =>
      (window as StageVideoMockWindow).stageVideoMock.createdUrls,
    )).toEqual([]);
    expect(api.matchupRequests()).toHaveLength(1);

    await page.getByRole("button", { name: "確定・動画再生", exact: true }).click();
    await expect.poll(() => readDownloads(root)).toHaveLength(2);
    await completeDownload(page, root, 1);
    await assertPlaying(page, root);
  });
}

test("連続要求は古い本文ダウンロードを中断し、遅い完了でも最新の紹介を維持する", async ({ page, api }) => {
  const root = await prepareDebug(page, api);
  const submit = page.getByRole("button", { name: "確定・動画再生", exact: true });
  await submit.click();
  await expect.poll(() => readDownloads(root)).toHaveLength(1);
  await root.evaluate(() => (window as StageVideoMockWindow).stageVideoMock.respond(0));
  await page.getByLabel("ルール", { exact: true }).selectOption(secondRule.id);
  await page.getByLabel("ステージ", { exact: true }).selectOption(secondStage.id);
  await submit.click();
  await expect.poll(() => readDownloads(root)).toHaveLength(2);
  expect((await readDownloads(root))[0]).toMatchObject({
    hasAbortSignal: true, aborted: true, bodyCompleted: false,
  });
  expect((await readDownloads(root))[1]).toMatchObject({ hasAbortSignal: true, aborted: false });
  await assertNoReveal(root);
  expect(api.matchupRequests()[1]?.query).toMatchObject({ ruleId: secondRule.id, stageId: secondStage.id });
  await completeDownload(page, root, 1);
  await assertPlaying(page, root);
  const video = root.getByLabel("選択ステージ紹介動画");
  const latestSource = await video.getAttribute("src");
  await root.evaluate(() => (window as StageVideoMockWindow).stageVideoMock.finishBody(0));
  await expect.poll(async () => (await readDownloads(root))[0]?.bodyRead).toBe(true);
  await page.clock.fastForward(1_000);
  await expect(video).toHaveAttribute("src", latestSource ?? "");
  await expect(root.locator(".overlay-stage-reveal")).toHaveCount(1);
  await expect(root.getByRole("region", { name: "選択ルール" })).toContainText(secondRule.name);
  await expect(root.getByRole("region", { name: "選択ステージ" })).toContainText(secondStage.name);
  expect(await root.evaluate(() =>
    (window as StageVideoMockWindow).stageVideoMock.createdUrls,
  )).toEqual([latestSource]);
  expect(api.matchupRequests()).toHaveLength(2);
});

test("別ページのDock要求もBroadcastChannelでOverlayへ届き、Blob動画を再生する", async ({ page, api }) => {
  const overlayPage = await page.context().newPage();
  const overlayApi = await installApiMock(overlayPage, apiOptions);
  await prepareMedia(overlayPage);
  try {
    await overlayPage.goto("/?view=overlay");
    const root = overlayPage.locator("main.overlay");
    await expect(root).toBeVisible();
    await page.goto("/?view=dock");
    await page.getByRole("button", { name: "対戦を反映", exact: true }).click();
    await assertMatchup(root);
    await page.getByLabel("ルール", { exact: true }).selectOption(secondRule.id);
    await page.getByLabel("ステージ", { exact: true }).selectOption(secondStage.id);
    await page.getByRole("button", { name: "確定・動画再生", exact: true }).click();
    await expect.poll(() => readDownloads(root)).toHaveLength(1);
    await assertNoReveal(root);
    expect(api.matchupRequests()).toHaveLength(0);
    expect(overlayApi.matchupRequests()).toHaveLength(2);
    expect(overlayApi.matchupRequests()[1]?.query).toMatchObject({ ruleId: secondRule.id, stageId: secondStage.id });
    await completeDownload(overlayPage, root);
    await assertPlaying(overlayPage, root);
    await expect(root.getByRole("region", { name: "選択ステージ" })).toContainText(secondStage.name);
  } finally {
    overlayApi.assertNoBrowserErrors();
    await overlayPage.close();
  }
});
