import { expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";

import { fixtureData } from "./fixture-data";
import { installApiMock } from "./test";

async function expectHeadingToFit(heading: Locator, name: string, baseSize: number) {
  await expect(heading).toHaveText(name);
  await expect.poll(() => heading.evaluate((element) => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(element);
    const text = range.getBoundingClientRect();
    const left = box.left + Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.borderLeftWidth);
    const right = box.right - Number.parseFloat(style.paddingRight) - Number.parseFloat(style.borderRightWidth);
    return text.width > 0 && text.left >= left - 0.5 && text.right <= right + 0.5;
  })).toBe(true);
  const size = await heading.locator("span").evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).fontSize),
  );
  expect(size).toBeGreaterThan(0);
  expect(size).toBeLessThanOrEqual(baseSize);
  if (name === "Alpha" || name === "Bravo") expect(size).toBe(baseSize);
  const height = await heading.evaluate((element) => element.getBoundingClientRect().height);
  expect(height).toBeCloseTo(baseSize === 42 ? 76.4 : 73.6, 0);
}

for (const [label, alphaName, bravoName] of [
  ["20文字の日英名", "あ".repeat(20), "W".repeat(20)],
  ["既存の長い名前", "旧".repeat(80), "W".repeat(80)],
  ["短い名前", "Alpha", "Bravo"],
] as const) {
  test(`チーム名を枠内に全文表示し見出しの高さを保つ: ${label}`, async ({ page }) => {
    const fixtures = structuredClone(fixtureData);
    fixtures.matchup.alpha.name = alphaName;
    fixtures.matchup.bravo.name = bravoName;
    const api = await installApiMock(page, { fixtures });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => {
      localStorage.setItem("inkling:overlay-selection", JSON.stringify({
        tournamentId: "tournament-a",
        alphaTournamentTeamId: "team-alpha",
        bravoTournamentTeamId: "team-bravo",
        ruleId: "rule-1",
        stageId: "stage-1",
        accentColor: "#8b5cf6",
        matchLabel: "",
      }));
    });
    await page.goto("/?view=debug");
    const overlay = page.frameLocator('iframe[title="1920 × 1080 Overlay プレビュー"]');
    await expect(overlay.locator(".overlay-player-card")).toHaveCount(8);
    await page.getByRole("button", { name: /自動切替:/ }).click();
    await expect(overlay.locator(".overlay-carousel")).toHaveAttribute("data-autoplay", "false");
    await expectHeadingToFit(overlay.locator(".overlay-team--left h2"), alphaName, 42);
    await expectHeadingToFit(overlay.locator(".overlay-team--right h2"), bravoName, 42);
    for (const [side, name, detailLabel] of [
      ["left", alphaName, "アルファチーム 詳細"],
      ["right", bravoName, "ブラボーチーム 詳細"],
    ] as const) {
      await page.getByRole("button", { name: detailLabel, exact: true }).click();
      await expect(overlay.locator(`.overlay-team-detail--${side}`)).toBeVisible();
      await expectHeadingToFit(overlay.locator(`.overlay-team-detail--${side} h1`), name, 64);
    }
    expect(api.matchupRequests()).toHaveLength(1);
    api.assertNoBrowserErrors();
  });
}
