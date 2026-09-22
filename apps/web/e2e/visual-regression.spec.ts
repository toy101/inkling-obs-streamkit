import { expect, test as base } from "@playwright/test";
import type { FrameLocator, Locator, Page } from "@playwright/test";

import {
  installApiMock,
  type InstalledApiMock,
} from "./test";
import { visualFixtureData } from "./visual-fixture-data";

const OVERLAY_TITLE = "1920 × 1080 Overlay プレビュー";
const STORAGE_KEY = "inkling:overlay-selection";
const VIGNETTE_SVG = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080">
    <defs>
      <radialGradient id="vignette" cx="50%" cy="50%" r="72%">
        <stop offset="45%" stop-color="#111827" stop-opacity="0" />
        <stop offset="100%" stop-color="#111827" stop-opacity="0.78" />
      </radialGradient>
    </defs>
    <rect width="1920" height="1080" fill="url(#vignette)" />
  </svg>
`;

const storedSelection = {
  tournamentId: "visual-tournament",
  alphaTournamentTeamId: "visual-team-alpha",
  bravoTournamentTeamId: "visual-team-bravo",
  ruleId: "visual-rule",
  stageId: "visual-stage",
  accentColor: "#8b5cf6",
  matchLabel: "Final Match With A Long Label For Boundary Coverage",
};

type VisualFixtures = {
  api: InstalledApiMock;
};

const test = base.extend<VisualFixtures>({
  api: async ({ page }, provide) => {
    const apiMock = await installApiMock(page, {
      fixtures: visualFixtureData,
    });
    await provide(apiMock);
    apiMock.assertNoBrowserErrors();
  },
});

test.setTimeout(60_000);

async function installVisualResourceMocks(page: Page): Promise<void> {
  await page.route("**/stage-video/*.webm", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "video/webm",
      body: "deterministic visual regression video fixture",
    });
  });

  await page.route("**/stage-reveal-vignette.png", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: VIGNETTE_SVG,
    });
  });
}

async function prepareVisualPage(page: Page): Promise<void> {
  await page.setViewportSize({ width: 2400, height: 1600 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(
    ({ key, selection }) => {
      localStorage.setItem(key, selection);
      HTMLMediaElement.prototype.play = () => Promise.resolve();
      document.addEventListener(
        "error",
        (event) => {
          if (event.target instanceof HTMLMediaElement) {
            event.stopImmediatePropagation();
          }
        },
        true,
      );
      const dispatchEvent = EventTarget.prototype.dispatchEvent;
      EventTarget.prototype.dispatchEvent = function dispatchVisualEvent(
        this: EventTarget,
        event: Event,
      ): boolean {
        if (this instanceof HTMLMediaElement && event.type === "error") {
          return true;
        }
        return dispatchEvent.call(this, event);
      };
    },
    {
      key: STORAGE_KEY,
      selection: JSON.stringify(storedSelection),
    },
  );
  await installVisualResourceMocks(page);
  await page.goto("/?view=debug");
}

async function getReadyOverlay(page: Page, api: InstalledApiMock): Promise<FrameLocator> {
  const overlayFrame = page.frameLocator(`iframe[title="${OVERLAY_TITLE}"]`);
  await expect(overlayFrame.locator("main.overlay")).toBeVisible();
  await expect.poll(() => api.matchupRequests().length).toBe(1);

  const autoplayButton = page.getByRole("button", {
    name: "自動切替: オン",
    exact: true,
  });
  await expect(autoplayButton).toBeEnabled();
  await autoplayButton.click();
  await expect(
    page.getByRole("button", { name: "自動切替: オフ", exact: true }),
  ).toBeVisible();
  await expect(overlayFrame.locator(".overlay-carousel.is-paused")).toBeVisible();

  return overlayFrame;
}

async function expectVisibleBoxesInsideCanvas(
  overlay: FrameLocator,
  selectors: readonly string[],
): Promise<void> {
  const canvas = await overlay.locator("main.overlay").boundingBox();
  if (!canvas) {
    throw new Error("Overlay canvas bounding box was not available.");
  }

  for (const selector of selectors) {
    const elements = await overlay.locator(selector).all();
    let visibleElementCount = 0;

    for (const element of elements) {
      if (!(await element.isVisible())) {
        continue;
      }

      const box = await element.boundingBox();
      if (!box) {
        throw new Error(`Bounding box was not available for ${selector}.`);
      }

      visibleElementCount += 1;
      expect(box.x).toBeGreaterThanOrEqual(canvas.x - 1);
      expect(box.y).toBeGreaterThanOrEqual(canvas.y - 1);
      expect(box.x + box.width).toBeLessThanOrEqual(
        canvas.x + canvas.width + 1,
      );
      expect(box.y + box.height).toBeLessThanOrEqual(
        canvas.y + canvas.height + 1,
      );
    }

    expect(visibleElementCount).toBeGreaterThan(0);
  }
}

async function expectNoOverflowingVisibleText(locator: Locator): Promise<void> {
  const overflow = await locator.evaluate((element) => {
    const htmlElement = element as HTMLElement;
    return htmlElement.scrollWidth > htmlElement.clientWidth + 1;
  });

  expect(overflow).toBe(false);
}

const screenshotOptions = {
  animations: "disabled" as const,
  caret: "hide" as const,
  maxDiffPixelRatio: 0.01,
  timeout: 15_000,
};

test("Overlayの対戦カードは固定キャンバス内に収まる", async ({ page, api }) => {
  await prepareVisualPage(page);
  const overlay = await getReadyOverlay(page, api);

  await expect(
    overlay.getByRole("heading", { name: visualFixtureData.matchup.tournament.name }),
  ).toBeVisible();
  await expectVisibleBoxesInsideCanvas(overlay, [
    ".overlay-matchup-title-frame",
    ".overlay-team-name",
    ".overlay-player-card",
  ]);
  await expect(
    overlay.locator(".overlay-matchup-title-plate h1"),
  ).toHaveCSS("text-overflow", "ellipsis");

  await expect(
    overlay.locator("main.overlay"),
  ).toHaveScreenshot("overlay-matchup.png", screenshotOptions);
});

test("OverlayのALPHA詳細は長い選手名と画像フォールバックを表示する", async ({
  page,
  api,
}) => {
  await prepareVisualPage(page);
  const overlay = await getReadyOverlay(page, api);

  await page.getByRole("button", { name: "アルファチーム 詳細", exact: true }).click();
  await expect(overlay.locator(".overlay-team-detail--left")).toBeVisible();
  await expect(
    overlay
      .locator(
        '.overlay-team-detail--left [aria-label="Missing Weapon Image Fallback With A Long Nameの画像を取得できませんでした"]',
      )
      .first(),
  ).toBeVisible();
  await expectVisibleBoxesInsideCanvas(overlay, [
    ".overlay-team-detail--left",
    ".overlay-detail-player",
    ".overlay-detail-weapon",
  ]);

  await expect(
    overlay.locator("main.overlay"),
  ).toHaveScreenshot("overlay-alpha-detail.png", screenshotOptions);
});

test("OverlayのBRAVO詳細は長い選手名と画像フォールバックを表示する", async ({
  page,
  api,
}) => {
  await prepareVisualPage(page);
  const overlay = await getReadyOverlay(page, api);

  await page.getByRole("button", { name: "ブラボーチーム 詳細", exact: true }).click();
  await expect(overlay.locator(".overlay-team-detail--right")).toBeVisible();
  await expect(
    overlay
      .locator(
        '.overlay-team-detail--right [aria-label="Missing Weapon Image Fallback With A Long Nameの画像を取得できませんでした"]',
      )
      .first(),
  ).toBeVisible();
  await expectVisibleBoxesInsideCanvas(overlay, [
    ".overlay-team-detail--right",
    ".overlay-detail-player",
    ".overlay-detail-weapon",
  ]);

  await expect(
    overlay.locator("main.overlay"),
  ).toHaveScreenshot("overlay-bravo-detail.png", screenshotOptions);
});

test("Overlayのステージ紹介は安定したplayingフェーズを表示する", async ({
  page,
  api,
}) => {
  await prepareVisualPage(page);
  const overlay = await getReadyOverlay(page, api);

  const playStageButton = page.getByRole("button", {
    name: "確定・動画再生",
    exact: true,
  });
  await expect(playStageButton).toBeEnabled();
  await playStageButton.click();

  const stageReveal = overlay.locator(".overlay-stage-reveal.is-playing");
  await expect(stageReveal).toBeVisible();
  await expect(
    overlay.getByText(visualFixtureData.matchup.stage.name).first(),
  ).toBeVisible();
  await expect(
    overlay.getByText(visualFixtureData.matchup.rule.description),
  ).toBeVisible();
  await expect(
    overlay.getByText(visualFixtureData.matchup.rule.name).first(),
  ).toBeVisible();
  await expect(stageReveal.locator("video")).toHaveAttribute("src", /^blob:/);
  await expect.poll(() => api.matchupRequests().length).toBe(1);
  await expectVisibleBoxesInsideCanvas(overlay, [
    ".overlay-stage-reveal",
    ".overlay-stage-reveal-rule",
    ".overlay-stage-reveal-stage",
  ]);
  await expectNoOverflowingVisibleText(
    stageReveal.locator(".overlay-stage-reveal-rule p"),
  );

  await expect(
    overlay.locator("main.overlay"),
  ).toHaveScreenshot("overlay-stage-reveal.png", screenshotOptions);
});

export { expect };
