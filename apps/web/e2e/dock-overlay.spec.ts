import type { Page } from "@playwright/test";

import { expect, installApiMock, test } from "./test";

const expectedSelection = {
  tournamentId: "tournament-a",
  alphaTournamentTeamId: "team-alpha",
  bravoTournamentTeamId: "team-bravo",
  ruleId: "rule-1",
  stageId: "stage-1",
  accentColor: "#8b5cf6",
  matchLabel: "",
};

async function setStoredSelection(page: Page, value: string): Promise<void> {
  await page.evaluate(
    ({ key, selection }) => {
      localStorage.setItem(key, selection);
    },
    { key: "inkling:overlay-selection", selection: value },
  );
}

async function readStoredSelection(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const raw = localStorage.getItem("inkling:overlay-selection");
    return raw === null ? null : (JSON.parse(raw) as unknown);
  });
}

async function waitForRenderCycle(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      }),
  );
}

test("Debug画面でDockとOverlayが起動する", async ({ page, api }) => {
  await page.goto("/?view=debug");

  const dock = page.getByRole("complementary", {
    name: "表示コントローラー",
  });
  await expect(dock).toBeVisible();
  await expect(
    dock.getByRole("heading", { name: "Inkling StreamKit" }),
  ).toBeVisible();

  const overlayFrame = page.getByTitle("1920 × 1080 Overlay プレビュー");
  await expect(overlayFrame).toBeVisible();
  await expect(overlayFrame).toHaveAttribute("width", "1920");
  await expect(overlayFrame).toHaveAttribute("height", "1080");

  const overlay = page.frameLocator(
    'iframe[title="1920 × 1080 Overlay プレビュー"]',
  );
  await expect(overlay.locator("main.overlay")).toBeVisible();

  await expect.poll(() => api.requestCount("/tournaments")).toBeGreaterThan(0);
  await expect
    .poll(() => api.requestCount("/tournaments/:id/teams"))
    .toBeGreaterThan(0);
  await expect.poll(() => api.requestCount("/rules")).toBeGreaterThan(0);
  await expect.poll(() => api.requestCount("/stages")).toBeGreaterThan(0);
});

test("対戦カードは明示的な反映時だけOverlayへ通知する", async ({
  page,
  api,
}) => {
  await page.addInitScript(() => {
    localStorage.removeItem("inkling:overlay-selection");
  });
  await page.goto("/?view=debug");

  const dock = page.getByRole("complementary", {
    name: "表示コントローラー",
  });
  const alpha = dock.getByLabel("ALPHA");
  const applyMatchup = dock.getByRole("button", {
    name: "対戦を反映",
    exact: true,
  });
  const overlay = page.frameLocator(
    'iframe[title="1920 × 1080 Overlay プレビュー"]',
  );

  await expect(dock.getByLabel("大会")).toHaveValue("tournament-a");
  await expect(alpha).toHaveValue("team-alpha");
  await expect(dock.getByLabel("BRAVO")).toHaveValue("team-bravo");
  await expect(dock.getByLabel("ルール")).toHaveValue("rule-1");
  await expect(dock.getByLabel("ステージ")).toHaveValue("stage-1");
  await waitForRenderCycle(page);
  await expect.poll(() => api.requestCount("/overlay/matchup")).toBe(0);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("inkling:overlay-selection"),
    ),
  ).toBeNull();

  await alpha.selectOption("team-charlie-a");
  await expect(alpha).toHaveValue("team-charlie-a");
  await waitForRenderCycle(page);
  await expect.poll(() => api.requestCount("/overlay/matchup")).toBe(0);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("inkling:overlay-selection"),
    ),
  ).toBeNull();
  await expect(overlay.locator(".overlay-matchup")).toHaveCount(0);

  await alpha.selectOption("team-alpha");
  await expect(applyMatchup).toBeEnabled();
  await applyMatchup.click();

  await expect.poll(() => api.matchupRequests().length).toBe(1);
  const [matchupRequest] = api.matchupRequests();
  expect(matchupRequest?.query).toEqual({
    tournamentId: "tournament-a",
    alphaTournamentTeamId: "team-alpha",
    bravoTournamentTeamId: "team-bravo",
    ruleId: "rule-1",
    stageId: "stage-1",
  });
  await expect(
    overlay.getByRole("heading", { name: "Tournament One" }),
  ).toBeVisible();
  const activeOverlaySlide = overlay.locator(".overlay-slide.is-active");
  await expect(
    activeOverlaySlide.getByRole("heading", { name: "Alpha", exact: true }),
  ).toBeVisible();
  await expect(
    activeOverlaySlide.getByRole("heading", { name: "Bravo", exact: true }),
  ).toBeVisible();
  await expect(activeOverlaySlide.getByText("Alpha One")).toBeVisible();
  await expect(activeOverlaySlide.getByText("Bravo One")).toBeVisible();
  await waitForRenderCycle(page);
  expect(api.requestCount("/overlay/matchup")).toBe(1);
  expect(await readStoredSelection(page)).toEqual(expectedSelection);
});

test("有効な保存状態を再読込後に復元する", async ({ page, api }) => {
  await page.goto("/?view=dock");
  await setStoredSelection(
    page,
    JSON.stringify({
      tournamentId: "tournament-a",
      alphaTournamentTeamId: "team-alpha",
      bravoTournamentTeamId: "team-bravo",
      ruleId: "rule-1",
      stageId: "stage-1",
      accentColor: "#123456",
      matchLabel: "  準決勝  ",
    }),
  );
  await page.reload();

  const dock = page.locator("main.dock");
  await expect(dock.getByLabel("大会")).toHaveValue("tournament-a");
  await expect(dock.getByLabel("ALPHA")).toHaveValue("team-alpha");
  await expect(dock.getByLabel("BRAVO")).toHaveValue("team-bravo");
  await expect(dock.getByLabel("ルール")).toHaveValue("rule-1");
  await expect(dock.getByLabel("ステージ")).toHaveValue("stage-1");
  await expect(dock.getByLabel("対戦名")).toHaveValue("準決勝");

  await page.reload();
  await expect(dock.getByLabel("大会")).toHaveValue("tournament-a");
  await expect(dock.getByLabel("ALPHA")).toHaveValue("team-alpha");
  await expect(dock.getByLabel("BRAVO")).toHaveValue("team-bravo");
  await expect(dock.getByLabel("対戦名")).toHaveValue("準決勝");

  await page.goto("/?view=overlay");
  await expect.poll(() => api.matchupRequests().length).toBe(1);
  const [matchupRequest] = api.matchupRequests();
  expect(matchupRequest?.query).toEqual({
    tournamentId: "tournament-a",
    alphaTournamentTeamId: "team-alpha",
    bravoTournamentTeamId: "team-bravo",
    ruleId: "rule-1",
    stageId: "stage-1",
  });
  await expect(
    page.getByRole("heading", { name: "Tournament One" }),
  ).toBeVisible();
  await waitForRenderCycle(page);
  expect(api.requestCount("/overlay/matchup")).toBe(1);
});

test("壊れた保存状態と不足フィールドを安全に無視する", async ({ page }) => {
  await page.goto("/?view=dock");
  const dock = page.locator("main.dock");
  const invalidValues = [
    "{",
    JSON.stringify({ tournamentId: "tournament-a" }),
  ];

  for (const invalidValue of invalidValues) {
    await setStoredSelection(page, invalidValue);
    await page.reload();

    await expect(dock.getByLabel("大会")).toHaveValue("tournament-a");
    await expect(dock.getByLabel("ALPHA")).toHaveValue("team-alpha");
    await expect(dock.getByLabel("BRAVO")).toHaveValue("team-bravo");
    await expect(dock.getByLabel("ルール")).toHaveValue("rule-1");
    await expect(dock.getByLabel("ステージ")).toHaveValue("stage-1");
    await waitForRenderCycle(page);
  }
});

test("未知の保存IDは有効な選択へ正規化して反映する", async ({
  page,
  api,
}) => {
  await page.goto("/?view=dock");
  await setStoredSelection(
    page,
    JSON.stringify({
      tournamentId: "missing-tournament",
      alphaTournamentTeamId: "missing-alpha",
      bravoTournamentTeamId: "missing-bravo",
      ruleId: "missing-rule",
      stageId: "missing-stage",
      accentColor: "#123456",
      matchLabel: "未知",
    }),
  );
  await page.reload();

  const dock = page.locator("main.dock");
  await expect(dock.getByLabel("大会")).toHaveValue("tournament-a");
  await expect(dock.getByLabel("ALPHA")).toHaveValue("team-alpha");
  await expect(dock.getByLabel("BRAVO")).toHaveValue("team-bravo");
  await expect(dock.getByLabel("ルール")).toHaveValue("rule-1");
  await expect(dock.getByLabel("ステージ")).toHaveValue("stage-1");

  const applyMatchup = dock.getByRole("button", {
    name: "対戦を反映",
    exact: true,
  });
  await expect(applyMatchup).toBeEnabled();
  await applyMatchup.click();

  await waitForRenderCycle(page);
  expect(api.requestCount("/overlay/matchup")).toBe(0);
  expect(await readStoredSelection(page)).toEqual({
    tournamentId: "tournament-a",
    alphaTournamentTeamId: "team-alpha",
    bravoTournamentTeamId: "team-bravo",
    ruleId: "rule-1",
    stageId: "stage-1",
    accentColor: "#123456",
    matchLabel: "未知",
  });

  await page.goto("/?view=overlay");
  await expect.poll(() => api.matchupRequests().length).toBe(1);
  const [matchupRequest] = api.matchupRequests();
  expect(matchupRequest?.query).toEqual({
    tournamentId: "tournament-a",
    alphaTournamentTeamId: "team-alpha",
    bravoTournamentTeamId: "team-bravo",
    ruleId: "rule-1",
    stageId: "stage-1",
  });
  await expect(
    page.getByRole("heading", { name: "Tournament One" }),
  ).toBeVisible();
});

test("旧チームIDキーを含む保存状態を復元する", async ({ page }) => {
  await page.goto("/?view=dock");
  await setStoredSelection(
    page,
    JSON.stringify({
      tournamentId: "tournament-a",
      leftTournamentTeamId: "team-alpha",
      rightTournamentTeamId: "team-bravo",
      ruleId: "rule-1",
      stageId: "stage-1",
      accentColor: "#123456",
      matchLabel: "旧形式",
    }),
  );
  await page.reload();

  const dock = page.locator("main.dock");
  await expect(dock.getByLabel("大会")).toHaveValue("tournament-a");
  await expect(dock.getByLabel("ALPHA")).toHaveValue("team-alpha");
  await expect(dock.getByLabel("BRAVO")).toHaveValue("team-bravo");
  await expect(dock.getByLabel("対戦名")).toHaveValue("旧形式");
});

test("別ページのOverlayはstorageイベントで対戦を更新する", async ({
  page,
  api,
}) => {
  await page.addInitScript(() => {
    localStorage.removeItem("inkling:overlay-selection");
  });
  const overlayPage = await page.context().newPage();
  const overlayApi = await installApiMock(overlayPage);
  await overlayPage.addInitScript(() => {
    localStorage.removeItem("inkling:overlay-selection");
  });

  try {
    await overlayPage.goto("/?view=overlay");
    await expect(overlayPage.locator("main.overlay")).toBeVisible();
    await waitForRenderCycle(overlayPage);
    await expect
      .poll(() => overlayApi.requestCount("/overlay/matchup"))
      .toBe(0);

    await page.goto("/?view=dock");
    const dock = page.locator("main.dock");
    const applyMatchup = dock.getByRole("button", {
      name: "対戦を反映",
      exact: true,
    });
    await expect(applyMatchup).toBeEnabled();
    await applyMatchup.click();

    await expect.poll(() => api.requestCount("/overlay/matchup")).toBe(0);
    await expect.poll(() => overlayApi.matchupRequests().length).toBe(1);
    const [matchupRequest] = overlayApi.matchupRequests();
    expect(matchupRequest?.query).toEqual({
      tournamentId: "tournament-a",
      alphaTournamentTeamId: "team-alpha",
      bravoTournamentTeamId: "team-bravo",
      ruleId: "rule-1",
      stageId: "stage-1",
    });
    await expect(
      overlayPage.getByRole("heading", { name: "Tournament One" }),
    ).toBeVisible();
    const activeOverlaySlide = overlayPage.locator(
      ".overlay-slide.is-active",
    );
    await expect(activeOverlaySlide.getByText("Alpha One")).toBeVisible();
    await expect(activeOverlaySlide.getByText("Bravo One")).toBeVisible();
    await waitForRenderCycle(overlayPage);
    expect(overlayApi.requestCount("/overlay/matchup")).toBe(1);
  } finally {
    overlayApi.assertNoBrowserErrors();
    await overlayPage.close();
  }
});
