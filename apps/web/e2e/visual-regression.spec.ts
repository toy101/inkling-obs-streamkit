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
  await page.route("**/stage-reveal-vignette.png", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: VIGNETTE_SVG,
    });
  });
}

async function prepareVisualPage(page: Page): Promise<void> {
  // Keep the centered 1920×1080 stage on integer CSS coordinates in Debug.
  await page.setViewportSize({ width: 2400, height: 1599 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(
    ({ key, selection }) => {
      localStorage.setItem(key, selection);

      let videoFixture: Promise<Blob> | null = null;
      const createVideoFixture = (): Promise<Blob> => {
        // Encode a real WebM so the test validates media decoding instead of
        // suppressing media errors.
        const canvas = document.createElement("canvas");
        canvas.width = 1920;
        canvas.height = 1080;
        const context = canvas.getContext("2d");
        if (!context) {
          return Promise.reject(new Error("Could not create video fixture canvas."));
        }

        const gradient = context.createLinearGradient(0, 0, 1920, 1080);
        gradient.addColorStop(0, "#111827");
        gradient.addColorStop(0.52, "#312e81");
        gradient.addColorStop(1, "#0f172a");
        context.fillStyle = gradient;
        context.fillRect(0, 0, canvas.width, canvas.height);

        const requestedMimeType = "video/webm;codecs=vp8";
        const mimeType = MediaRecorder.isTypeSupported(requestedMimeType)
          ? requestedMimeType
          : "video/webm";
        const stream = canvas.captureStream(30);
        const recorder = new MediaRecorder(stream, {
          mimeType,
        });
        const chunks: Blob[] = [];

        return new Promise<Blob>((resolve, reject) => {
          recorder.addEventListener("dataavailable", (event) => {
            if (event.data.size > 0) {
              chunks.push(event.data);
            }
          });
          recorder.addEventListener("error", () => {
            reject(new Error("Could not encode video fixture."));
          });
          recorder.addEventListener("stop", () => {
            for (const track of stream.getTracks()) {
              track.stop();
            }
            const blob = new Blob(chunks, { type: mimeType });
            if (blob.size === 0) {
              reject(new Error("Encoded video fixture was empty."));
              return;
            }
            resolve(blob);
          });

          let recording = true;
          const drawFrame = () => {
            if (!recording) {
              return;
            }
            context.fillRect(0, 0, 1, 1);
            window.requestAnimationFrame(drawFrame);
          };

          recorder.start(100);
          void drawFrame();
          window.setTimeout(() => {
            recording = false;
            recorder.stop();
          }, 5_000);
        });
      };

      const originalFetch = window.fetch.bind(window);
      const visualFetch: typeof window.fetch = async (input, init) => {
        const requestUrl =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        if (!requestUrl.includes("/stage-video/")) {
          return originalFetch(input, init);
        }

        videoFixture ??= createVideoFixture();
        return new Response(await videoFixture, {
          status: 200,
          headers: { "content-type": "video/webm" },
        });
      };
      visualFetch.preconnect = originalFetch.preconnect;
      window.fetch = visualFetch;
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
  await expect(overlayFrame.locator("main.overlay")).toBeVisible({ timeout: 15_000 });
  const overlayFrameElement = page.locator(`iframe[title="${OVERLAY_TITLE}"]`);
  const frameBox = await overlayFrameElement.boundingBox();
  if (!frameBox) {
    throw new Error("Overlay iframe bounding box was not available.");
  }
  expect(frameBox.x).toBe(Math.round(frameBox.x));
  expect(frameBox.y).toBe(Math.round(frameBox.y));
  expect(frameBox.width).toBe(1920);
  expect(frameBox.height).toBe(1080);
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
  maxDiffPixels: 100,
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
  await expect(stageReveal).toBeVisible({ timeout: 15_000 });
  const videoFixture = await stageReveal.locator("video").evaluate((element) => {
    const video = element as HTMLVideoElement;
    return {
      duration: video.duration,
      hasError: video.error !== null,
      readyState: video.readyState,
    };
  });
  expect(videoFixture.duration).toBeGreaterThan(0);
  expect(videoFixture.hasError).toBe(false);
  expect(videoFixture.readyState).toBeGreaterThanOrEqual(2);
  await stageReveal.locator("video").evaluate((element) => {
    const video = element as HTMLVideoElement;
    video.pause();
    video.currentTime = 0;
  });
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

test("Debugのステージ・ルール紹介は遷移後も背景動画をループし、別シーンで終了する", async ({
  page,
  api,
}) => {
  await prepareVisualPage(page);
  const overlay = await getReadyOverlay(page, api);
  const fixtureSize = await overlay.locator("main.overlay").evaluate(async () => {
    const response = await fetch("/stage-video/fixture.webm");
    return (await response.blob()).size;
  });
  expect(fixtureSize).toBeGreaterThan(0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByRole("button", { name: "自動切替: オフ", exact: true }).click();

  const overlayRoot = overlay.locator("main.overlay");
  await overlayRoot.evaluate((element) => {
    const observer = new MutationObserver(() => {
      if (element.querySelector(".overlay-stage-reveal.is-entering")) {
        element.setAttribute("data-stage-reveal-entered", "true");
        observer.disconnect();
      }
    });
    observer.observe(element, { attributes: true, childList: true, subtree: true });
  });

  const previewButton = page.getByRole("button", {
    name: "ステージ・ルール紹介",
    exact: true,
  });
  await expect(previewButton).toBeEnabled();
  await previewButton.click();
  await expect(overlayRoot).toHaveAttribute("data-stage-reveal-entered", "true", {
    timeout: 15_000,
  });

  const stageReveal = overlay.locator(".overlay-stage-reveal.is-playing");
  await expect(stageReveal).toBeVisible();
  const video = stageReveal.locator("video");
  await expect(video).toHaveJSProperty("loop", true);
  await expect(video).toHaveJSProperty("paused", false);
  await expect(overlay.locator(".overlay-carousel")).toHaveAttribute(
    "data-autoplay",
    "true",
  );
  await expect(overlay.locator(".overlay-carousel.is-paused")).toBeVisible();
  await expect(
    stageReveal.getByText(visualFixtureData.matchup.stage.name, { exact: true }),
  ).toBeVisible();
  await expect(
    stageReveal.getByText(visualFixtureData.matchup.rule.name, { exact: true }).first(),
  ).toBeVisible();

  await video.evaluate((element) => {
    const media = element as HTMLVideoElement;
    let previousTime = media.currentTime;
    media.addEventListener("timeupdate", () => {
      if (media.currentTime + 0.5 < previousTime) {
        media.dataset.loopCompleted = "true";
      }
      previousTime = media.currentTime;
    });
  });
  await expect(video).toHaveAttribute("data-loop-completed", "true", {
    timeout: 10_000,
  });
  await expect(stageReveal).toBeVisible();
  await expect(video).toHaveJSProperty("paused", false);
  await expect(video).toHaveJSProperty("ended", false);
  await expect.poll(() => api.matchupRequests().length).toBe(1);

  await page.getByRole("button", { name: "アルファチーム 詳細", exact: true }).click();
  await expect(overlay.locator(".overlay-stage-reveal")).toHaveCount(0);
  await expect(
    overlay.locator(".overlay-slide.is-active .overlay-team-detail--left"),
  ).toBeVisible();
  await expect(overlay.locator(".overlay-carousel")).toHaveAttribute(
    "data-autoplay",
    "true",
  );
});

test("通常のステージ紹介はループせず、Debugのシーン操作後も動画の終了まで再生する", async ({
  page,
  api,
}) => {
  await prepareVisualPage(page);
  const overlay = await getReadyOverlay(page, api);
  await page.getByRole("button", { name: "確定・動画再生", exact: true }).click();

  const stageReveal = overlay.locator(".overlay-stage-reveal.is-playing");
  await expect(stageReveal).toBeVisible({ timeout: 15_000 });
  await expect(stageReveal.locator("video")).toHaveJSProperty("loop", false);
  await expect(stageReveal.locator("video")).toHaveJSProperty("paused", false);
  await page.getByRole("button", { name: "アルファチーム 詳細", exact: true }).click();
  await expect(stageReveal).toBeVisible();
  await expect(overlay.locator(".overlay-stage-reveal")).toHaveCount(0, {
    timeout: 10_000,
  });
  await expect(
    overlay.locator(".overlay-slide.is-active .overlay-team-detail--left"),
  ).toBeVisible();
});

export { expect };
