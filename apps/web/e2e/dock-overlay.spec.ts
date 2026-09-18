import { expect, test } from "@playwright/test";

import { installApiMock, TEAMS } from "./fixtures";

test("DockのSubmit境界を保ってOverlayへ反映する", async ({ page }) => {
  const getMatchupRequestCount = await installApiMock(page);

  await page.goto("/?view=debug");

  await expect(
    page.getByRole("heading", { name: "Overlay プレビュー" }),
  ).toBeVisible();

  const overlayFrame = page.getByTitle("1920 × 1080 Overlay プレビュー");
  await expect(overlayFrame).toBeVisible();
  await expect(overlayFrame).toHaveAttribute("width", "1920");
  await expect(overlayFrame).toHaveAttribute("height", "1080");

  const alphaSelect = page.getByRole("combobox", { name: /^ALPHA/ });
  const bravoSelect = page.getByRole("combobox", { name: /^BRAVO/ });
  await expect(alphaSelect).toHaveValue(TEAMS[0].id);
  await expect(bravoSelect).toHaveValue(TEAMS[1].id);

  const autoplayButton = page.getByRole("button", {
    name: "自動切替: オン",
  });
  await expect(autoplayButton).toBeEnabled();
  await autoplayButton.click();
  await expect(
    page.getByRole("button", { name: "自動切替: オフ" }),
  ).toBeVisible();

  const overlay = page.frameLocator(
    'iframe[title="1920 × 1080 Overlay プレビュー"]',
  );
  const applyMatchupButton = page.getByRole("button", { name: "対戦を反映" });

  await expect(applyMatchupButton).toBeEnabled();
  await applyMatchupButton.click();
  await expect(
    overlay.getByRole("heading", { name: TEAMS[0].name, level: 2 }),
  ).toBeVisible();
  await expect(
    overlay.getByRole("heading", { name: TEAMS[1].name, level: 2 }),
  ).toBeVisible();
  expect(getMatchupRequestCount()).toBe(1);

  await alphaSelect.selectOption(TEAMS[2].id);
  await expect(alphaSelect).toHaveValue(TEAMS[2].id);
  await expect(
    overlay.getByRole("heading", { name: TEAMS[0].name, level: 2 }),
  ).toBeVisible();
  await expect(
    overlay.getByRole("heading", { name: TEAMS[2].name, level: 2 }),
  ).toBeHidden();
  expect(getMatchupRequestCount()).toBe(1);

  await expect(applyMatchupButton).toBeEnabled();
  await applyMatchupButton.click();
  await expect(
    overlay.getByRole("heading", { name: TEAMS[2].name, level: 2 }),
  ).toBeVisible();
  await expect(
    overlay.getByRole("heading", { name: TEAMS[0].name, level: 2 }),
  ).toBeHidden();
  expect(getMatchupRequestCount()).toBe(2);

  await page.getByRole("button", { name: "アルファチーム 詳細" }).click();
  await expect(
    overlay.getByRole("region", { name: `${TEAMS[2].name}の詳細情報` }),
  ).toBeInViewport();
  expect(getMatchupRequestCount()).toBe(2);

  const accentHue = page.getByRole("slider", { name: "accent-control-hue" });
  await accentHue.fill("120");
  const expectedAccentColor = await accentHue.getAttribute("aria-valuetext");
  if (!expectedAccentColor) {
    throw new Error("The accent slider did not expose its selected color.");
  }
  const applyAccentButton = page.getByRole("button", { name: "色を反映" });
  await expect(applyAccentButton).toBeEnabled();
  await applyAccentButton.click();
  await expect(overlay.locator("main.overlay")).toHaveCSS(
    "--overlay-accent-color",
    expectedAccentColor.toLowerCase(),
  );
  expect(getMatchupRequestCount()).toBe(2);
});
