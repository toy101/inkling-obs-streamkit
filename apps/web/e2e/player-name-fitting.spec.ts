import { expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";

import { fixtureData } from "./fixture-data";
import { installApiMock } from "./test";

async function expectNamesToFit(names: Locator, defaultFontSize: number) {
  await expect(names).toHaveCount(4);
  await expect.poll(() => names.evaluateAll((elements) =>
    elements.every((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const text = range.getBoundingClientRect();
      const container = element.getBoundingClientRect();
      return text.width > 0 &&
        text.left >= container.left - 0.5 &&
        text.right <= container.right + 0.5;
    }),
  )).toBe(true);

  const fontSizes = await names.evaluateAll((elements) => elements.map((element) =>
    Number.parseFloat(getComputedStyle(element.firstElementChild ?? element).fontSize),
  ));
  expect(fontSizes[0]).toBeLessThan(defaultFontSize);
  expect(fontSizes[1]).toBeLessThan(defaultFontSize);
  expect(fontSizes[3]).toBe(defaultFontSize);
}

test("長いプレイヤー名は枠内に縮小し、短い名前とカードの寸法を保つ", async ({ page }) => {
  const fixtures = structuredClone(fixtureData);
  const alphaNames = [
    "あ".repeat(20), "W".repeat(20), "i".repeat(20), "Short",
  ];
  const bravoNames = [
    "既存".repeat(50), "🎮".repeat(20), "Bravo Three", "Short",
  ];
  for (const [index, player] of fixtures.matchup.alpha.players.entries()) {
    player.registeredName = alphaNames[index] ?? player.registeredName;
  }
  for (const [index, player] of fixtures.matchup.bravo.players.entries()) {
    player.registeredName = bravoNames[index] ?? player.registeredName;
  }
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

  for (const [side, expectedNames] of [["left", alphaNames], ["right", bravoNames]] as const) {
    const names = overlay.locator(`.overlay-team--${side} .overlay-player-name`);
    await expect(names).toHaveText(expectedNames);
    await expectNamesToFit(names, 29);
    const sizes = await overlay.locator(`.overlay-team--${side} .overlay-player-card`).evaluateAll((elements) =>
      elements.map((element) => ({ width: element.clientWidth, height: element.clientHeight })),
    );
    for (const size of sizes) expect(size).toEqual(sizes[0]);
  }

  for (const [side, label, expectedNames] of [
    ["left", "アルファチーム 詳細", alphaNames],
    ["right", "ブラボーチーム 詳細", bravoNames],
  ] as const) {
    await page.getByRole("button", { name: label, exact: true }).click();
    const detail = overlay.locator(`.overlay-team-detail--${side}`);
    await expect(detail).toBeVisible();
    const names = detail.locator(".overlay-detail-player-profile strong");
    await expect(names).toHaveText(expectedNames);
    await expectNamesToFit(names, 38);
    const sizes = await detail.locator(".overlay-detail-player").evaluateAll((elements) =>
      elements.map((element) => ({ width: element.clientWidth, height: element.clientHeight })),
    );
    for (const size of sizes) expect(size).toEqual(sizes[0]);
  }

  const firstName = overlay.locator(".overlay-team-detail--right strong").first();
  const text = firstName.locator("span");
  const originalSize = await text.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).fontSize),
  );
  await firstName.evaluate((element) => { element.style.width = "180px"; });
  await expect.poll(() => text.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).fontSize),
  )).toBeLessThan(originalSize);
  await expectNamesToFit(overlay.locator(".overlay-team-detail--right strong"), 38);
  await firstName.evaluate((element) => { element.style.width = ""; });
  await expect.poll(() => text.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).fontSize),
  )).toBe(originalSize);

  expect(api.matchupRequests()).toHaveLength(1);
  api.assertNoBrowserErrors();
});
