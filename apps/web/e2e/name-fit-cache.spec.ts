import { expect, test } from "@playwright/test";
import type { Frame, Page } from "@playwright/test";

import { fixtureData } from "./fixture-data";
import { installApiMock } from "./test";

async function openNames(page: Page): Promise<Frame> {
  const fixtures = structuredClone(fixtureData);
  for (const team of [fixtures.matchup.alpha, fixtures.matchup.bravo]) {
    team.name = "日本語とABC🎮".repeat(8);
    for (const player of team.players) player.registeredName = "W日本語🎮".repeat(8);
  }
  await installApiMock(page, { fixtures });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    localStorage.setItem("inkling:overlay-selection", JSON.stringify({
      tournamentId: "tournament-a", alphaTournamentTeamId: "team-alpha",
      bravoTournamentTeamId: "team-bravo", ruleId: "rule-1", stageId: "stage-1",
      accentColor: "#8b5cf6", matchLabel: "",
    }));
    const original = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      if (this instanceof HTMLElement && this.classList.contains("overlay-name-text")) {
        this.dataset.fitReads = String(Number(this.dataset.fitReads ?? 0) + 1);
      }
      return original.call(this);
    };
    const NativeObserver = ResizeObserver;
    window.ResizeObserver = class extends NativeObserver {
      constructor(callback: ResizeObserverCallback) {
        let previous: ResizeObserverEntry[] = [];
        super((entries, observer) => {
          previous = entries;
          callback(entries, observer);
        });
        window.addEventListener("repeat-name-resize", () => callback(previous, this));
      }
    };
  });
  await page.goto("/?view=debug");
  await page.getByRole("button", { name: /自動切替:/ }).click();
  const frame = page.frames().find((candidate) => candidate.url().includes("view=overlay"));
  if (!frame) throw new Error("Overlay frame missing");
  await expect(frame.locator(".overlay-name-text")).toHaveCount(20);
  await frame.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  });
  return frame;
}

test("同幅通知を省き、幅を戻すと計測済みのサイズを再利用する", async ({ page }) => {
  const frame = await openNames(page);
  const name = frame.locator(".overlay-player-name").first();
  const text = name.locator("span");
  const originalSize = await text.evaluate((element) => element.style.fontSize);
  await text.evaluate((element) => { element.dataset.fitReads = "0"; });
  await frame.evaluate(() => window.dispatchEvent(new Event("repeat-name-resize")));
  await expect(text).toHaveAttribute("data-fit-reads", "0");
  await name.evaluate((element) => { element.style.width = "180px"; });
  await expect.poll(() => text.evaluate((element) => element.style.fontSize)).not.toBe(originalSize);
  expect(Number(await text.getAttribute("data-fit-reads"))).toBeGreaterThan(0);
  await text.evaluate((element) => { element.dataset.fitReads = "0"; });
  await name.evaluate((element) => { element.style.width = ""; });
  await expect.poll(() => text.evaluate((element) => element.style.fontSize)).toBe(originalSize);
  await expect(text).toHaveAttribute("data-fit-reads", "0");

  await name.evaluate((element) => {
    element.style.fontFamily = '"Missing Name Fit Font", monospace';
    element.style.fontWeight = "400";
    element.style.fontSize = "24px";
  });
  await frame.evaluate(() => window.dispatchEvent(new Event("repeat-name-resize")));
  await expect.poll(async () => Number(await text.getAttribute("data-fit-reads"))).toBeGreaterThan(0);
  expect(await text.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))).toBeLessThanOrEqual(24);
});

test("同じ要素で名前が変わると再計測し、短い名前は基準サイズに戻す", async ({ page }) => {
  const frame = await openNames(page);
  const name = frame.locator(".overlay-player-name").first();
  const text = name.locator("span");
  await text.evaluate((element) => { element.dataset.fitReads = "0"; });
  const fixtures = structuredClone(fixtureData);
  fixtures.matchup.alpha.players[0].registeredName = "Short";
  const api = await installApiMock(page, { fixtures });
  await page.evaluate(() => {
    const channel = new BroadcastChannel("inkling:overlay");
    channel.postMessage({ type: "selection", selection: {
      tournamentId: "tournament-a", alphaTournamentTeamId: "team-alpha",
      bravoTournamentTeamId: "team-bravo", ruleId: "rule-1", stageId: "stage-2",
      accentColor: "#8b5cf6", matchLabel: "",
    } });
    channel.close();
  });
  await expect(name).toHaveText("Short");
  expect(Number(await text.getAttribute("data-fit-reads"))).toBeGreaterThan(0);
  expect(await text.evaluate((element) => getComputedStyle(element).fontSize)).toBe("29px");
  api.assertNoBrowserErrors();
});

test("実フォント読込み後はキャッシュを破棄し、変更後のフォントで全文を収める", async ({ page }) => {
  const frame = await openNames(page);
  const name = frame.locator(".overlay-player-name").first();
  const text = name.locator("span");
  await name.evaluate((element) => { element.style.fontFamily = '"NameFitLoaded", monospace'; });
  await frame.evaluate(() => window.dispatchEvent(new Event("repeat-name-resize")));
  await text.evaluate((element) => { element.dataset.fitReads = "0"; });
  await name.evaluate(async () => {
    // Playwright's Linux fonts and macOS fonts both have a local sans-serif face.
    const face = new FontFace("NameFitLoaded", 'local("Arial"), local("Liberation Sans"), local("DejaVu Sans")');
    document.fonts.add(face);
    await document.fonts.load('29px "NameFitLoaded"');
    await document.fonts.ready;
  });
  await expect.poll(async () => Number(await text.getAttribute("data-fit-reads"))).toBeGreaterThan(0);
  await expect.poll(() => name.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    return range.getBoundingClientRect().width <= element.getBoundingClientRect().width + 0.5;
  })).toBe(true);
});

test("幅キャッシュは上限を超えた古い組合せを保持しない", async ({ page }) => {
  const frame = await openNames(page);
  const name = frame.locator(".overlay-player-name").first();
  const text = name.locator("span");
  for (let width = 180; width < 192; width += 1) {
    await name.evaluate((element, value) => { element.style.width = `${value}px`; }, width);
    await frame.evaluate(async () => {
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
    });
  }
  await text.evaluate((element) => { element.dataset.fitReads = "0"; });
  await name.evaluate((element) => { element.style.width = "180px"; });
  await expect.poll(async () => Number(await text.getAttribute("data-fit-reads"))).toBeGreaterThan(0);
});

test("混在する日本語・英数字・絵文字をフォールバックフォントでも全20要素に収める", async ({ page }) => {
  const frame = await openNames(page);
  await frame.locator(".overlay-name-text").evaluateAll((elements) => {
    for (const text of elements) {
      if (text.parentElement) text.parentElement.style.fontFamily = '"Missing Name Fit Font", monospace';
    }
    window.dispatchEvent(new Event("repeat-name-resize"));
  });
  await expect.poll(() => frame.locator(".overlay-name-text").evaluateAll((elements) =>
    elements.every((element) => {
      const parent = element.parentElement;
      if (!parent) return false;
      const style = getComputedStyle(parent);
      const box = parent.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(element);
      const text = range.getBoundingClientRect();
      const left = box.left + Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.borderLeftWidth);
      const right = box.right - Number.parseFloat(style.paddingRight) - Number.parseFloat(style.borderRightWidth);
      return text.width > 0 && text.left >= left - 0.5 && text.right <= right + 0.5;
    }),
  )).toBe(true);
});

test("既存の12回探索と同じ最終サイズを保つ", async ({ page }) => {
  const frame = await openNames(page);
  const differences = await frame.locator(".overlay-name-text").evaluateAll((elements) =>
    elements.map((element) => {
      if (!(element instanceof HTMLElement) || !element.parentElement) return 1;
      const parent = element.parentElement;
      const style = getComputedStyle(parent);
      const width = parent.getBoundingClientRect().width -
        Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight) -
        Number.parseFloat(style.borderLeftWidth) - Number.parseFloat(style.borderRightWidth);
      const actualSize = element.style.fontSize;
      element.style.fontSize = "";
      let expectedSize = "";
      if (element.getBoundingClientRect().width > width) {
        let minimum = 0;
        let maximum = Number.parseFloat(style.fontSize);
        for (let step = 0; step < 12; step += 1) {
          const middle = (minimum + maximum) / 2;
          element.style.fontSize = `${middle}px`;
          if (element.getBoundingClientRect().width <= width) minimum = middle;
          else maximum = middle;
        }
        expectedSize = `${minimum}px`;
      }
      element.style.fontSize = expectedSize;
      const normalizedExpected = element.style.fontSize;
      element.style.fontSize = actualSize;
      return actualSize === normalizedExpected ? 0 : 1;
    }),
  );
  expect(differences).toEqual(Array(20).fill(0));
});
