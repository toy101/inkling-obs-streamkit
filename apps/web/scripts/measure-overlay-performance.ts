/// <reference lib="dom" />
// cspell:ignore domcontentloaded

import { chromium } from "@playwright/test";
import type {
  BrowserContext,
  CDPSession,
  Page,
  Route,
} from "@playwright/test";

import { fixtureData } from "../e2e/fixture-data";

const PREVIEW_URL = "http://127.0.0.1:4173/__overlay-performance";
const RUN_COUNT = 3;
const FIXTURE_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
  "base64",
);
const FIXTURE_WEBM = new URL(
  "../e2e/fixtures/stage-reveal.webm",
  import.meta.url,
).pathname;

type Profile = "fixture" | "long" | "real";
type Phase = "startup" | "switching";
type FixtureData = typeof fixtureData;

type Counter = {
  boundingClientRectReads: number;
  overlayNameTextReads: number;
  resizeObserverCreated: number;
  overlaySlideMounts: number;
  overlayNameTextMounts: number;
};

type PerformanceMetrics = {
  LayoutCount: number;
  LayoutDuration: number;
  TaskDuration: number;
};

type TraceSummary = {
  rasterTaskCount: number;
  rasterTaskCpuDurationMs: number;
};

type PhaseResult = {
  counters: Counter;
  performance: PerformanceMetrics;
  tracing: TraceSummary;
};

type TraceEvent = {
  name?: unknown;
  dur?: unknown;
};

type InstrumentedWindow = typeof window & {
  __overlayPerf?: {
    phase: Phase;
    counters: Record<Phase, Counter>;
  };
};

const emptyCounter = (): Counter => ({
  boundingClientRectReads: 0,
  overlayNameTextReads: 0,
  resizeObserverCreated: 0,
  overlaySlideMounts: 0,
  overlayNameTextMounts: 0,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function applyProfile(profile: Profile): Promise<FixtureData> {
  const fixtures = structuredClone(fixtureData);
  if (profile === "fixture") return fixtures;

  if (profile === "long") {
    fixtures.matchup.alpha.name = "W".repeat(80);
    fixtures.matchup.bravo.name = "あ".repeat(80);
    for (const [index, player] of [
      ...fixtures.matchup.alpha.players,
      ...fixtures.matchup.bravo.players,
    ].entries()) {
      player.registeredName = index % 2 === 0 ? "W".repeat(80) : "長い名前".repeat(40);
    }
    return fixtures;
  }

  const playersPath = process.env.OVERLAY_PERF_PLAYERS;
  const tournamentsPath = process.env.OVERLAY_PERF_TOURNAMENTS;
  if (!playersPath || !tournamentsPath) {
    throw new Error(
      "real profile requires OVERLAY_PERF_PLAYERS and OVERLAY_PERF_TOURNAMENTS.",
    );
  }

  const [playersValue, tournamentsValue] = await Promise.all([
    Bun.file(playersPath).json() as Promise<unknown>,
    Bun.file(tournamentsPath).json() as Promise<unknown>,
  ]);
  const playerRecords = Array.isArray(playersValue)
    ? playersValue.filter(isRecord)
    : isRecord(playersValue) && Array.isArray(playersValue.players)
      ? playersValue.players.filter(isRecord)
      : [];
  const teamRecords = isRecord(tournamentsValue) &&
      Array.isArray(tournamentsValue.tournamentTeams)
    ? tournamentsValue.tournamentTeams.filter(isRecord)
    : [];
  const playerNames = playerRecords
    .map((record) => readString(record, "displayName"))
    .filter((name): name is string => name !== null)
    .slice(0, 8);
  const teamNames = teamRecords
    .map((record) => readString(record, "name"))
    .filter((name): name is string => name !== null)
    .slice(0, 2);
  if (playerNames.length < 8 || teamNames.length < 2) {
    throw new Error("real profile JSON does not contain enough usable names.");
  }

  fixtures.matchup.alpha.name = teamNames[0] ?? fixtures.matchup.alpha.name;
  fixtures.matchup.bravo.name = teamNames[1] ?? fixtures.matchup.bravo.name;
  for (const [index, player] of [
    ...fixtures.matchup.alpha.players,
    ...fixtures.matchup.bravo.players,
  ].entries()) {
    player.registeredName = playerNames[index] ?? player.registeredName;
  }
  return fixtures;
}

function jsonBody(value: unknown): string {
  const body = JSON.stringify(value);
  if (body === undefined) throw new Error("Could not serialize an API fixture.");
  return body;
}

async function fulfillJson(route: Route, value: unknown): Promise<void> {
  await route.fulfill({
    status: 200,
    headers: {
      "access-control-allow-origin": "*",
      "content-type": "application/json; charset=utf-8",
    },
    body: jsonBody(value),
  });
}

async function installRoutes(page: Page, fixtures: FixtureData): Promise<void> {
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;

    if (pathname === "/__overlay-performance") {
      return route.fulfill({
        contentType: "text/html; charset=utf-8",
        body: '<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0"><iframe title="1920 × 1080 Overlay プレビュー" src="/?view=overlay" width="1920" height="1080" style="display:block;border:0"></iframe></body></html>',
      });
    }

    if (pathname === "/tournaments") return fulfillJson(route, fixtures.tournaments);
    if (/^\/tournaments\/[^/]+\/teams$/.test(pathname)) {
      const tournamentId = pathname.split("/")[2] ?? "";
      return fulfillJson(route, fixtures.tournamentTeams[tournamentId] ?? []);
    }
    if (pathname === "/rules") return fulfillJson(route, fixtures.rules);
    if (pathname === "/stages") return fulfillJson(route, fixtures.stages);
    if (pathname === "/overlay/matchup") return fulfillJson(route, fixtures.matchup);
    if (request.resourceType() === "image") {
      return route.fulfill({ status: 200, contentType: "image/gif", body: FIXTURE_GIF });
    }
    if (request.resourceType() === "media" || pathname.endsWith(".webm")) {
      return route.fulfill({ status: 200, contentType: "video/webm", path: FIXTURE_WEBM });
    }
    await route.continue();
  });
}

async function installInstrumentation(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const targetWindow = window as InstrumentedWindow;
    const counters: Record<Phase, Counter> = {
      startup: {
        boundingClientRectReads: 0,
        overlayNameTextReads: 0,
        resizeObserverCreated: 0,
        overlaySlideMounts: 0,
        overlayNameTextMounts: 0,
      },
      switching: {
        boundingClientRectReads: 0,
        overlayNameTextReads: 0,
        resizeObserverCreated: 0,
        overlaySlideMounts: 0,
        overlayNameTextMounts: 0,
      },
    };
    targetWindow.__overlayPerf = { phase: "startup", counters };

    const current = () => counters[targetWindow.__overlayPerf?.phase ?? "startup"];
    const originalRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
      const counter = current();
      counter.boundingClientRectReads += 1;
      if (this instanceof HTMLElement && this.matches(".overlay-name-text")) {
        counter.overlayNameTextReads += 1;
      }
      return originalRect.call(this);
    };

    const NativeResizeObserver = window.ResizeObserver;
    window.ResizeObserver = class CountingResizeObserver extends NativeResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        current().resizeObserverCreated += 1;
        super(callback);
      }
    };

    const countMounts = (node: Node) => {
      if (!(node instanceof Element)) return;
      const counter = current();
      if (node.matches(".overlay-slide")) counter.overlaySlideMounts += 1;
      if (node.matches(".overlay-name-text")) counter.overlayNameTextMounts += 1;
      counter.overlaySlideMounts += node.querySelectorAll(".overlay-slide").length;
      counter.overlayNameTextMounts += node.querySelectorAll(".overlay-name-text").length;
    };
    const observe = () => {
      const observer = new MutationObserver((records) => {
        for (const record of records) {
          for (const node of record.addedNodes) countMounts(node);
        }
      });
      observer.observe(document, { childList: true, subtree: true });
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", observe, { once: true });
    } else {
      observe();
    }
  });
}

function metricMap(value: unknown): Map<string, number> {
  if (!isRecord(value) || !Array.isArray(value.metrics)) return new Map();
  const entries: Array<[string, number]> = [];
  for (const metric of value.metrics) {
    if (!isRecord(metric)) continue;
    if (typeof metric.name === "string" && typeof metric.value === "number") {
      entries.push([metric.name, metric.value]);
    }
  }
  return new Map(entries);
}

async function readPerformance(cdp: CDPSession): Promise<PerformanceMetrics> {
  const metrics = metricMap(await cdp.send("Performance.getMetrics"));
  return {
    LayoutCount: metrics.get("LayoutCount") ?? 0,
    LayoutDuration: metrics.get("LayoutDuration") ?? 0,
    TaskDuration: metrics.get("TaskDuration") ?? 0,
  };
}

function performanceDelta(
  before: PerformanceMetrics,
  after: PerformanceMetrics,
): PerformanceMetrics {
  return {
    LayoutCount: after.LayoutCount - before.LayoutCount,
    LayoutDuration: after.LayoutDuration - before.LayoutDuration,
    TaskDuration: after.TaskDuration - before.TaskDuration,
  };
}

function createTracer(cdp: CDPSession) {
  let events: TraceEvent[] | null = null;
  cdp.on("Tracing.dataCollected", (payload: unknown) => {
    if (!events || !isRecord(payload) || !Array.isArray(payload.value)) return;
    events.push(...payload.value.filter(isRecord));
  });
  return {
    start: async () => {
      events = [];
      await cdp.send("Tracing.start", {
        categories: "devtools.timeline,disabled-by-default-devtools.timeline",
        transferMode: "ReportEvents",
      });
    },
    stop: async (): Promise<TraceSummary> => {
      const completed = new Promise<void>((resolve) => {
        cdp.once("Tracing.tracingComplete", () => resolve());
      });
      await cdp.send("Tracing.end");
      await completed;
      const captured = events ?? [];
      events = null;
      const rasterTasks = captured.filter((event) => event.name === "RasterTask");
      return {
        rasterTaskCount: rasterTasks.length,
        rasterTaskCpuDurationMs: rasterTasks.reduce(
          (total, event) => total + (typeof event.dur === "number" ? event.dur : 0),
          0,
        ) / 1_000,
      };
    },
  };
}

async function settleOverlay(page: Page): Promise<void> {
  const iframe = await page.waitForSelector('iframe[title="1920 × 1080 Overlay プレビュー"]', { timeout: 5_000 });
  const contentFrame = await iframe.contentFrame();
  if (!contentFrame) throw new Error("Overlay iframe is unavailable.");
  await contentFrame.waitForURL(/view=overlay/);
  const frame = page.frames().find((candidate) => candidate.url().includes("view=overlay"));
  if (!frame) throw new Error("Overlay iframe did not load.");
  await frame.waitForFunction(
    () => document.querySelectorAll(".overlay-name-text").length === 20,
    undefined,
    { timeout: 5_000 },
  );
  await frame.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => requestAnimationFrame(() =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    ));
  });
}

async function readCounters(page: Page, phase: Phase): Promise<Counter> {
  const frame = page.frames().find((candidate) => candidate.url().includes("view=overlay"));
  if (!frame) throw new Error("Overlay iframe did not load.");
  return frame.evaluate((selectedPhase) => {
    const instrumentation = (window as InstrumentedWindow).__overlayPerf;
    if (!instrumentation) throw new Error("Overlay instrumentation is unavailable.");
    return { ...instrumentation.counters[selectedPhase] };
  }, phase);
}

async function switchSlides(page: Page): Promise<void> {
  const frame = page.frames().find((candidate) => candidate.url().includes("view=overlay"));
  if (!frame) throw new Error("Overlay iframe did not load.");
  await frame.evaluate(() => {
    const instrumentation = (window as InstrumentedWindow).__overlayPerf;
    if (!instrumentation) throw new Error("Overlay instrumentation is unavailable.");
    instrumentation.phase = "switching";
  });

  for (let repetition = 0; repetition < 3; repetition += 1) {
    for (const slideIndex of [0, 1, 2, 0] as const) {
      await page.evaluate((index) => {
        const overlayFrame = document.querySelector<HTMLIFrameElement>(
          'iframe[title="1920 × 1080 Overlay プレビュー"]',
        );
        overlayFrame?.contentWindow?.postMessage(
          { type: "inkling:debug-overlay-slide", slideIndex: index },
          window.location.origin,
        );
      }, slideIndex);
      await frame.waitForFunction(
        (index) => {
          const slides = [...document.querySelectorAll(".overlay-slide")];
          const activeSlide = document.querySelector(".overlay-slide.is-active");
          return activeSlide !== null && slides.indexOf(activeSlide) === index;
        },
        slideIndex,
        { timeout: 1_000 },
      );
      await frame.evaluate(() => new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      ));
    }
  }
}

async function runOnce(fixtures: FixtureData): Promise<Record<Phase, PhaseResult>> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    serviceWorkers: "block",
  });
  await installInstrumentation(context);
  await context.addInitScript((selection) => {
    localStorage.setItem("inkling:overlay-selection", JSON.stringify(selection));
  }, {
    tournamentId: "tournament-a",
    alphaTournamentTeamId: "team-alpha",
    bravoTournamentTeamId: "team-bravo",
    ruleId: "rule-1",
    stageId: "stage-1",
    accentColor: "#8b5cf6",
    matchLabel: "",
  });

  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installRoutes(page, fixtures);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Performance.enable");
  const tracer = createTracer(cdp);

  try {
    const startupBefore = await readPerformance(cdp);
    await tracer.start();
    await page.goto(PREVIEW_URL, { waitUntil: "domcontentloaded" });
    await settleOverlay(page);
    const startupTracing = await tracer.stop();
    const startupAfter = await readPerformance(cdp);
    const startupCounters = await readCounters(page, "startup");

    const switchingBefore = await readPerformance(cdp);
    await tracer.start();
    await switchSlides(page);
    const switchingTracing = await tracer.stop();
    const switchingAfter = await readPerformance(cdp);
    const switchingCounters = await readCounters(page, "switching");

    return {
      startup: {
        counters: startupCounters,
        performance: performanceDelta(startupBefore, startupAfter),
        tracing: startupTracing,
      },
      switching: {
        counters: switchingCounters,
        performance: performanceDelta(switchingBefore, switchingAfter),
        tracing: switchingTracing,
      },
    };
  } finally {
    await browser.close();
  }
}

function mean(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function summarize(runs: readonly Record<Phase, PhaseResult>[]) {
  const summarizePhase = (phase: Phase) => ({
    counters: Object.fromEntries(
      Object.keys(emptyCounter()).map((key) => [
        key,
        mean(runs.map((run) => run[phase].counters[key as keyof Counter])),
      ]),
    ),
    performance: {
      LayoutCount: mean(runs.map((run) => run[phase].performance.LayoutCount)),
      LayoutDuration: mean(runs.map((run) => run[phase].performance.LayoutDuration)),
      TaskDuration: mean(runs.map((run) => run[phase].performance.TaskDuration)),
    },
    tracing: {
      rasterTaskCount: mean(runs.map((run) => run[phase].tracing.rasterTaskCount)),
      rasterTaskCpuDurationMs: mean(
        runs.map((run) => run[phase].tracing.rasterTaskCpuDurationMs),
      ),
    },
  });
  return { startup: summarizePhase("startup"), switching: summarizePhase("switching") };
}

const outputPath = Bun.argv[2];
const requestedProfile = Bun.argv[3] ?? "long";
if (!outputPath) throw new Error("Usage: bun run apps/web/scripts/measure-overlay-performance.ts OUTPUT [fixture|long|real]");
if (!["fixture", "long", "real"].includes(requestedProfile)) {
  throw new Error(`Unknown profile: ${requestedProfile}`);
}
const profile = requestedProfile as Profile;
const fixtures = await applyProfile(profile);
const runs: Array<Record<Phase, PhaseResult>> = [];
for (let run = 0; run < RUN_COUNT; run += 1) runs.push(await runOnce(fixtures));

await Bun.write(outputPath, `${JSON.stringify({
  schemaVersion: 1,
  profile,
  conditions: {
    preview: "production Vite preview",
    harness: "1920x1080 iframe without Debug autoplay synchronization",
    viewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
    cacheDisabled: true,
    runCount: RUN_COUNT,
    slideSequence: [0, 1, 2, 0],
    slideSequenceRepetitions: 3,
    animationControl: "prefers-reduced-motion: reduce",
    residualNoise: [
      "Chromium process scheduling",
      "JavaScript garbage collection",
      "React and browser startup work outside OverlayName",
    ],
    realProfileNamesRedacted: profile === "real",
  },
  runs,
  mean: summarize(runs),
}, null, 2)}\n`);
console.log(`Wrote ${RUN_COUNT} ${profile} runs to the requested output file.`);
