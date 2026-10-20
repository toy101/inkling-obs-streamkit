import type { Locator, Page } from "@playwright/test";

import { fixtureData } from "./fixture-data";
import { expect, installApiMock, test } from "./test";
import type { FixtureData } from "./test";

const overlayFrameSelector =
  'iframe[title="1920 × 1080 Overlay プレビュー"]';

const storedSelection = {
  tournamentId: "tournament-a",
  alphaTournamentTeamId: "team-alpha",
  bravoTournamentTeamId: "team-bravo",
  ruleId: "rule-1",
  stageId: "stage-1",
  accentColor: "#7c3aed",
  matchLabel: "",
  showPositions: true,
};

const initialWeaponImageUrl =
  "http://127.0.0.1:5173/e2e/weapon-one.gif";
const replacementWeaponImageUrl =
  "http://127.0.0.1:5173/e2e/weapon-one-v2.gif";
const transparentGif = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
  "base64",
);

async function installStoredSelection(page: Page): Promise<void> {
  await page.addInitScript((selection) => {
    localStorage.setItem(
      "inkling:overlay-selection",
      JSON.stringify(selection),
    );
  }, storedSelection);
}

async function setFadeCurrentTime(
  slide: Locator,
  currentTime: number,
): Promise<void> {
  await slide.evaluate((element, time) => {
    const fade = element
      .getAnimations()
      .find(
        (animation) =>
          animation instanceof CSSAnimation &&
          animation.animationName === "overlay-slide-fade",
      );
    if (!fade) throw new Error("Active slide fade animation was not found.");
    fade.pause();
    fade.currentTime = time;
  }, currentTime);
}

async function readFadeCurrentTime(slide: Locator): Promise<number> {
  return slide.evaluate((element) => {
    const fade = element
      .getAnimations()
      .find(
        (animation) =>
          animation instanceof CSSAnimation &&
          animation.animationName === "overlay-slide-fade",
      );
    if (!fade) throw new Error("Active slide fade animation was not found.");
    return Number(fade.currentTime);
  });
}

function matchupWithAlphaWeaponImage(
  imageUrl: string,
  stageId = "stage-1",
): FixtureData["matchup"] {
  return {
    ...fixtureData.matchup,
    alpha: {
      ...fixtureData.matchup.alpha,
      players: fixtureData.matchup.alpha.players.map((player) => ({
        ...player,
        weapons: player.weapons.map((weapon) => ({ ...weapon, imageUrl })),
      })) as FixtureData["matchup"]["alpha"]["players"],
    },
    stage:
      stageId === "stage-1"
        ? fixtureData.matchup.stage
        : { id: stageId, name: "Stage Two", en: "Stage Two" },
  };
}

async function publishStageSelection(page: Page, stageId: string): Promise<void> {
  await page.evaluate(
    ({ selection, nextStageId }) => {
      const channel = new BroadcastChannel("inkling:overlay");
      channel.postMessage({
        type: "selection",
        selection: { ...selection, stageId: nextStageId },
      });
      channel.close();
    },
    { selection: storedSelection, nextStageId: stageId },
  );
}

test("通常切替と同じスライドの再選択でDOMを保ったままfadeを再始動する", async ({
  page,
  api,
}) => {
  await page.clock.install();
  await installStoredSelection(page);
  await page.goto("/?view=debug");

  const overlay = page.frameLocator(overlayFrameSelector);
  const alphaSlide = overlay.locator(".overlay-slide").nth(1);
  const alphaName = alphaSlide.locator(".overlay-detail-player-name span").first();
  const alphaImage = alphaSlide.locator(".overlay-detail-weapon img").first();

  await expect(overlay.locator("main.overlay")).toBeVisible();
  await expect.poll(() => api.matchupRequests().length).toBe(1);
  await expect(alphaImage).toHaveCount(1);
  await alphaSlide.evaluate((element) => {
    element.setAttribute("data-e2e-identity", "alpha-slide");
  });
  await alphaName.evaluate((element) => {
    element.setAttribute("data-e2e-identity", "alpha-name");
  });
  await alphaImage.evaluate((element) => {
    element.setAttribute("data-e2e-identity", "alpha-image");
  });

  await page.clock.fastForward(8_000);
  await expect(alphaSlide).toHaveClass(/\bis-active\b/);
  await expect(alphaSlide).toHaveAttribute("data-e2e-identity", "alpha-slide");
  await expect(alphaName).toHaveAttribute("data-e2e-identity", "alpha-name");
  await expect(alphaImage).toHaveAttribute("data-e2e-identity", "alpha-image");

  await setFadeCurrentTime(alphaSlide, 4_000);
  expect(await readFadeCurrentTime(alphaSlide)).toBe(4_000);
  await page
    .getByRole("button", { name: "アルファチーム 詳細", exact: true })
    .click();

  await expect(alphaSlide).toHaveAttribute("data-e2e-identity", "alpha-slide");
  await expect(alphaName).toHaveAttribute("data-e2e-identity", "alpha-name");
  await expect(alphaImage).toHaveAttribute("data-e2e-identity", "alpha-image");
  await expect
    .poll(async () => Math.abs(await readFadeCurrentTime(alphaSlide)))
    .toBeLessThan(1);
});

test("失敗した武器画像を同じURLで再試行し同じブキIDのURL変更も表示する", async ({
  page,
}) => {
  const testPage = await page.context().newPage();
  let initialImageSucceeds = false;
  let initialImageRequests = 0;
  const api = await installApiMock(testPage, {
    matchupForQuery: (query) =>
      matchupWithAlphaWeaponImage(
        query.stageId === "stage-2"
          ? replacementWeaponImageUrl
          : initialWeaponImageUrl,
        query.stageId,
      ),
  });
  await testPage.route("**/e2e/weapon-one*.gif", async (route) => {
    const isInitialImage = route.request().url() === initialWeaponImageUrl;
    if (isInitialImage) initialImageRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "image/gif",
      headers: { "cache-control": "no-store" },
      body:
        isInitialImage && !initialImageSucceeds
          ? "invalid image"
          : transparentGif,
    });
  });
  await installStoredSelection(testPage);

  try {
    await testPage.goto("/?view=debug");
    const overlay = testPage.frameLocator(overlayFrameSelector);
    const alphaSlide = overlay.locator(".overlay-slide").nth(1);
    const alphaDetail = alphaSlide.locator(".overlay-team-detail--left");
    const firstWeapon = alphaDetail.locator(".overlay-detail-weapon").first();
    const alphaButton = testPage.getByRole("button", {
      name: "アルファチーム 詳細",
      exact: true,
    });

    await expect(overlay.locator("main.overlay")).toBeVisible();
    await expect.poll(() => api.matchupRequests().length).toBe(1);
    await testPage.getByRole("button", { name: /自動切替:/ }).click();
    await alphaButton.click();
    await expect(alphaSlide).toHaveClass(/\bis-active\b/);
    await expect(
      alphaDetail.getByLabel("Weapon Oneの画像を取得できませんでした"),
    ).toHaveCount(4);
    await firstWeapon.evaluate((element) => {
      element.setAttribute("data-e2e-identity", "weapon-one");
    });

    const requestsBeforeRetry = initialImageRequests;
    initialImageSucceeds = true;
    await alphaButton.click();
    await expect.poll(() => initialImageRequests).toBeGreaterThan(requestsBeforeRetry);
    await expect(alphaDetail.locator("img")).toHaveCount(4);
    await expect
      .poll(() =>
        alphaDetail
          .locator("img")
          .first()
          .evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBeGreaterThan(0);
    await expect(firstWeapon).toHaveAttribute("data-e2e-identity", "weapon-one");

    await publishStageSelection(testPage, "stage-2");
    await expect.poll(() => api.matchupRequests().length).toBe(2);
    expect(api.matchupRequests()[1]?.query.stageId).toBe("stage-2");
    await expect(alphaDetail.locator("img").first()).toHaveAttribute(
      "src",
      replacementWeaponImageUrl,
    );
    await expect
      .poll(() =>
        alphaDetail
          .locator("img")
          .first()
          .evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBeGreaterThan(0);
    await expect(firstWeapon).toHaveAttribute("data-e2e-identity", "weapon-one");
  } finally {
    api.assertNoBrowserErrors();
    await testPage.close();
  }
});
