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

  await page.clock.fastForward(16_000);
  await expect(
    activeSlide.locator(".overlay-team-detail--right"),
  ).toBeVisible();
  expect(api.requestCount("/overlay/matchup")).toBe(1);

  await autoplayButton.click();
  await expect(autoplayButton).toHaveAttribute("aria-pressed", "true");
  await page.clock.fastForward(8_000);
  await expect(activeSlide.locator(".overlay-matchup")).toBeVisible();
  expect(api.requestCount("/overlay/matchup")).toBe(1);
});
