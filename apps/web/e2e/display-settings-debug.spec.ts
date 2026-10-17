import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./test";

const expectedSelection = {
  tournamentId: "tournament-a",
  alphaTournamentTeamId: "team-alpha",
  bravoTournamentTeamId: "team-bravo",
  ruleId: "rule-1",
  stageId: "stage-1",
  accentColor: "#8b5cf6",
  matchLabel: "",
  showPositions: true,
};

const overlayFrameSelector =
  'iframe[title="1920 × 1080 Overlay プレビュー"]';

async function installStoredSelection(page: Page): Promise<void> {
  await page.addInitScript((selection) => {
    localStorage.setItem(
      "inkling:overlay-selection",
      JSON.stringify(selection),
    );
  }, expectedSelection);
}

async function readStoredSelection(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const raw = localStorage.getItem("inkling:overlay-selection");
    return raw === null ? null : (JSON.parse(raw) as unknown);
  });
}

async function readAccentColor(overlayRoot: Locator): Promise<string> {
  return overlayRoot.evaluate((element) =>
    getComputedStyle(element)
      .getPropertyValue("--overlay-accent-color")
      .trim()
      .toLowerCase(),
  );
}

async function readWeaponLayout(slide: Locator) {
  return slide
    .locator(
      ".overlay-detail-columns span:last-child, .overlay-detail-weapons, .overlay-detail-weapon",
    )
    .evaluateAll((elements) =>
      elements.map((element) => {
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x, y, width, height };
      }),
    );
}

async function expectPositionsHidden(slide: Locator): Promise<void> {
  await expect(slide.locator(".overlay-detail-position")).toHaveText([
    "",
    "",
    "",
    "",
  ]);
  await expect(slide.locator(".overlay-detail-position:visible")).toHaveCount(0);
  await expect(slide.getByText("POSITION", { exact: true })).toHaveCount(0);
}

test("表示設定は明示的な反映時だけOverlayへ通知する", async ({
  page,
  api,
}) => {
  await page.clock.install();
  await installStoredSelection(page);
  await page.goto("/?view=debug");

  const overlay = page.frameLocator(overlayFrameSelector);
  const overlayRoot = overlay.locator("main.overlay");
  const activeSlide = overlay.locator(".overlay-slide.is-active");
  const dock = page.getByRole("complementary", {
    name: "表示コントローラー",
  });

  await expect(overlayRoot).toBeVisible();
  await expect.poll(() => api.matchupRequests().length).toBe(1);
  await expect(activeSlide.locator(".overlay-matchup")).toBeVisible();

  const matchLabelInput = dock.getByLabel("対戦名");
  const trimmedMatchLabel = "準決勝";
  await matchLabelInput.fill(`  ${trimmedMatchLabel}  `);
  await expect(matchLabelInput).toHaveValue(`  ${trimmedMatchLabel}  `);
  await expect(
    activeSlide.getByText(trimmedMatchLabel, { exact: true }),
  ).toHaveCount(0);
  expect(await readStoredSelection(page)).toEqual(expectedSelection);
  expect(api.requestCount("/overlay/matchup")).toBe(1);

  await dock.getByRole("button", { name: "反映", exact: true }).click();
  await expect(
    activeSlide.getByText(trimmedMatchLabel, { exact: true }),
  ).toBeVisible();
  expect(await readStoredSelection(page)).toEqual({
    ...expectedSelection,
    matchLabel: trimmedMatchLabel,
  });
  expect(api.requestCount("/overlay/matchup")).toBe(1);

  const maxMatchLabel = "L".repeat(40);
  await matchLabelInput.fill(`${maxMatchLabel}X`);
  await expect(matchLabelInput).toHaveValue(maxMatchLabel);
  await expect(
    activeSlide.getByText(maxMatchLabel, { exact: true }),
  ).toHaveCount(0);
  expect(await readStoredSelection(page)).toEqual({
    ...expectedSelection,
    matchLabel: trimmedMatchLabel,
  });
  expect(api.requestCount("/overlay/matchup")).toBe(1);

  await dock.getByRole("button", { name: "反映", exact: true }).click();
  await expect(
    activeSlide.getByText(maxMatchLabel, { exact: true }),
  ).toBeVisible();
  expect(await readStoredSelection(page)).toEqual({
    ...expectedSelection,
    matchLabel: maxMatchLabel,
  });
  expect(api.requestCount("/overlay/matchup")).toBe(1);

  const initialAccentColor = await readAccentColor(overlayRoot);
  const accentInput = dock.getByLabel("accent-control-hue");
  await accentInput.press("Home");
  for (let pressIndex = 0; pressIndex < 120; pressIndex += 1) {
    await accentInput.press("ArrowRight");
  }
  const nextAccentColor = (
    await accentInput.getAttribute("aria-valuetext")
  )?.toLowerCase();

  expect(nextAccentColor).toBeTruthy();
  expect(nextAccentColor).not.toBe(initialAccentColor);
  await expect
    .poll(() => readAccentColor(overlayRoot))
    .toBe(initialAccentColor);
  expect(api.requestCount("/overlay/matchup")).toBe(1);

  await dock.getByRole("button", { name: "色を反映", exact: true }).click();
  await expect.poll(() => readAccentColor(overlayRoot)).toBe(nextAccentColor);
  expect(await readStoredSelection(page)).toEqual({
    ...expectedSelection,
    accentColor: nextAccentColor,
    matchLabel: maxMatchLabel,
  });
  expect(api.requestCount("/overlay/matchup")).toBe(1);
});

test("Debugのスライド操作とBRAVO画像の遅延読み込みを検証する", async ({
  page,
  api,
}) => {
  await page.clock.install();
  await installStoredSelection(page);
  await page.goto("/?view=debug");

  const overlay = page.frameLocator(overlayFrameSelector);
  const overlayRoot = overlay.locator("main.overlay");
  const activeSlide = overlay.locator(".overlay-slide.is-active");
  const alphaDetail = overlay.locator(".overlay-team-detail--left");
  const bravoDetail = overlay.locator(".overlay-team-detail--right");
  const carousel = overlay.locator(".overlay-carousel");

  await expect(overlayRoot).toBeVisible();
  await expect.poll(() => api.matchupRequests().length).toBe(1);
  await expect(activeSlide.locator(".overlay-matchup")).toBeVisible();
  await expect(alphaDetail.locator("img")).toHaveCount(4);
  await expect(bravoDetail.locator("img")).toHaveCount(0);

  await page
    .getByRole("button", { name: "アルファチーム 詳細", exact: true })
    .click();
  await expect(
    activeSlide.locator(".overlay-team-detail--left"),
  ).toBeVisible();
  await expect(alphaDetail.locator("img")).toHaveCount(4);
  await expect(bravoDetail.locator("img")).toHaveCount(4);
  expect(api.requestCount("/overlay/matchup")).toBe(1);

  await page
    .getByRole("button", { name: "ブラボーチーム 詳細", exact: true })
    .click();
  await expect(
    activeSlide.locator(".overlay-team-detail--right"),
  ).toBeVisible();
  await expect(bravoDetail.locator("img")).toHaveCount(4);
  expect(api.requestCount("/overlay/matchup")).toBe(1);

  const autoplayButton = page.getByRole("button", {
    name: /自動切替:/,
  });
  await expect(autoplayButton).toHaveAttribute("aria-pressed", "true");
  await autoplayButton.click();
  await expect(autoplayButton).toHaveAttribute("aria-pressed", "false");
  await expect(carousel).toHaveAttribute("data-autoplay", "false");

  await page.clock.fastForward(16_000);
  await expect(
    activeSlide.locator(".overlay-team-detail--right"),
  ).toBeVisible();
  expect(api.requestCount("/overlay/matchup")).toBe(1);

  await autoplayButton.click();
  await expect(autoplayButton).toHaveAttribute("aria-pressed", "true");
  await expect(carousel).toHaveAttribute("data-autoplay", "true");
  await page.clock.fastForward(8_000);
  await expect(activeSlide.locator(".overlay-matchup")).toBeVisible();
  expect(api.requestCount("/overlay/matchup")).toBe(1);
});

test("Debugは対戦データの取得前に停止した自動切替をOverlayへ同期する", async ({
  page,
  api,
}) => {
  let releaseMatchup = () => {};
  const matchupResponse = new Promise<void>((resolve) => {
    releaseMatchup = resolve;
  });
  await page.route("**/overlay/matchup?**", async (route) => {
    await matchupResponse;
    await route.fallback();
  });
  await installStoredSelection(page);

  try {
    const matchupRequest = page.waitForRequest("**/overlay/matchup?**");
    await page.goto("/?view=debug");
    await matchupRequest;
    const overlay = page.frameLocator(overlayFrameSelector);
    const carousel = overlay.locator(".overlay-carousel");
    await expect(carousel).toHaveCount(0);

    const autoplayButton = page.getByRole("button", { name: /自動切替:/ });
    await autoplayButton.click();
    await expect(autoplayButton).toHaveAttribute("aria-pressed", "false");
    releaseMatchup();

    await expect(carousel).toHaveAttribute("data-autoplay", "false");
    await expect(carousel).toHaveClass(/is-paused/);
    expect(api.requestCount("/overlay/matchup")).toBe(1);

    await page.locator(overlayFrameSelector).evaluate((element) => {
      const frame = element as HTMLIFrameElement;
      frame.contentWindow?.location.reload();
    });
    await expect.poll(() => api.requestCount("/overlay/matchup")).toBe(2);
    await expect(carousel).toHaveAttribute("data-autoplay", "false");

    await autoplayButton.click();
    await expect(carousel).toHaveAttribute("data-autoplay", "true");
  } finally {
    releaseMatchup();
  }
});

test("ポジション表示を切り替えても両チームのブキ配置を維持し、再読込後も復元する", async ({
  page,
  api,
}) => {
  await page.clock.install();
  await page.goto("/");
  await page.evaluate((selection) => {
    localStorage.setItem("inkling:overlay-selection", JSON.stringify(selection));
  }, expectedSelection);
  await page.goto("/?view=debug");

  const dock = page.getByRole("complementary", {
    name: "表示コントローラー",
  });
  const overlay = page.frameLocator(overlayFrameSelector);
  const activeSlide = overlay.locator(".overlay-slide.is-active");
  const toggle = dock.getByRole("button", { name: /ポジション表示:/ });

  await expect.poll(() => api.matchupRequests().length).toBe(1);
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  const layouts: {
    name: string;
    selector: string;
    weapons: Awaited<ReturnType<typeof readWeaponLayout>>;
  }[] = [];
  for (const { name, selector } of [
    { name: "アルファチーム 詳細", selector: ".overlay-team-detail--left" },
    { name: "ブラボーチーム 詳細", selector: ".overlay-team-detail--right" },
  ]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(activeSlide.locator(selector)).toBeVisible();
    await expect(activeSlide.locator(".overlay-detail-position")).toHaveText([
      "Unknown",
      "Unknown",
      "Unknown",
      "Unknown",
    ]);
    await expect(
      activeSlide.locator(".overlay-detail-position:visible"),
    ).toHaveCount(4);
    layouts.push({ name, selector, weapons: await readWeaponLayout(activeSlide) });
  }

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  for (const { name, selector, weapons } of layouts) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(activeSlide.locator(selector)).toBeVisible();
    await expectPositionsHidden(activeSlide);
    expect(await readWeaponLayout(activeSlide)).toEqual(weapons);
  }
  expect(await readStoredSelection(page)).toEqual({
    ...expectedSelection,
    showPositions: false,
  });
  expect(api.requestCount("/overlay/matchup")).toBe(1);

  await page.reload();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  for (const { name, selector, weapons } of layouts) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(activeSlide.locator(selector)).toBeVisible();
    await expectPositionsHidden(activeSlide);
    expect(await readWeaponLayout(activeSlide)).toEqual(weapons);
  }

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  for (const { name, selector, weapons } of layouts) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(activeSlide.locator(selector)).toBeVisible();
    await expect(activeSlide.locator(".overlay-detail-position")).toHaveText([
      "Unknown",
      "Unknown",
      "Unknown",
      "Unknown",
    ]);
    await expect(
      activeSlide.locator(".overlay-detail-position:visible"),
    ).toHaveCount(4);
    expect(await readWeaponLayout(activeSlide)).toEqual(weapons);
  }
  expect(await readStoredSelection(page)).toEqual(expectedSelection);
});
