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
  await expect.poll(() => api.requestCount("/overlay/matchup")).toBe(0);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("inkling:overlay-selection"),
    ),
  ).toBeNull();

  await alpha.selectOption("team-charlie");
  await expect(alpha).toHaveValue("team-charlie");
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
  await expect(overlay.getByRole("heading", { name: "Alpha", exact: true })).toBeVisible();
  await expect(overlay.getByRole("heading", { name: "Bravo", exact: true })).toBeVisible();
  await expect(overlay.getByText("Alpha One")).toBeVisible();
  await expect(overlay.getByText("Bravo One")).toBeVisible();

  const storedSelection = await page.evaluate(() => {
    const raw = localStorage.getItem("inkling:overlay-selection");
    return raw === null ? null : (JSON.parse(raw) as unknown);
  });
  expect(storedSelection).toEqual(expectedSelection);
});

test("有効な保存状態を再読込後に復元する", async ({ page, api }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "inkling:overlay-selection",
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
  });
  await page.goto("/?view=dock");

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
});

test("壊れた保存状態と未知のIDを安全に無視する", async ({ page }) => {
  await page.goto("/?view=dock");
  const dock = page.locator("main.dock");
  const invalidValues = [
    "{",
    JSON.stringify({ tournamentId: "tournament-a" }),
    JSON.stringify({
      tournamentId: "missing-tournament",
      alphaTournamentTeamId: "missing-alpha",
      bravoTournamentTeamId: "missing-bravo",
      ruleId: "missing-rule",
      stageId: "missing-stage",
      accentColor: "#123456",
      matchLabel: "未知",
    }),
  ];

  for (const invalidValue of invalidValues) {
    await page.evaluate((value) => {
      localStorage.setItem("inkling:overlay-selection", value);
    }, invalidValue);
    await page.reload();

    await expect(dock.getByLabel("大会")).toHaveValue("tournament-a");
    await expect(dock.getByLabel("ALPHA")).toHaveValue("team-alpha");
    await expect(dock.getByLabel("BRAVO")).toHaveValue("team-bravo");
    await expect(dock.getByLabel("ルール")).toHaveValue("rule-1");
    await expect(dock.getByLabel("ステージ")).toHaveValue("stage-1");
  }
});

test("旧チームIDキーを含む保存状態を復元する", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "inkling:overlay-selection",
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
  });
  await page.goto("/?view=dock");

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
    await expect(overlayPage.getByText("Alpha One")).toBeVisible();
    await expect(overlayPage.getByText("Bravo One")).toBeVisible();
  } finally {
    overlayApi.assertNoBrowserErrors();
    await overlayPage.close();
  }
});
