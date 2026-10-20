import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { installApiMock } from "../e2e/test";
import { fixtureData } from "../e2e/fixture-data";

// Run against a production preview: VITE_API_URL=http://127.0.0.1:3000 bun run build
// bun run vite preview --host 127.0.0.1 --port 5173
// bun run scripts/measure-background-mode.ts [output-directory]
const origin = process.env.OVERLAY_MEASURE_ORIGIN ?? "http://127.0.0.1:5173";
const output = resolve(process.argv[2] ?? "test-results/background-mode-performance");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chromium" });
const system = await browser.newBrowserCDPSession();
const systemInfo = await system.send("SystemInfo.getInfo");
const modes = ["normal", "lightweight", "lightweight", "normal", "normal", "lightweight"] as const;
const results: Record<string, unknown>[] = [];
try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const api = await installApiMock(page, { fixtures: fixtureData });
  await page.goto(`${origin}/`);
  for (const [index, mode] of modes.entries()) {
    console.log(`Starting run ${index + 1}: ${mode}`);
    await page.evaluate((backgroundMode) => localStorage.setItem("inkling:overlay-selection", JSON.stringify({
      tournamentId: "tournament-a", alphaTournamentTeamId: "team-alpha", bravoTournamentTeamId: "team-bravo",
      ruleId: "rule-1", stageId: "stage-1", accentColor: "#8b5cf6", matchLabel: "Final", showPositions: true, backgroundMode,
    })), mode);
    await page.goto(`${origin}/?view=overlay`);
    await page.locator(".overlay-matchup").waitFor();
    // Warm up fonts, images and both detail slides outside the measurement.
    await page.evaluate(async () => { await document.fonts.ready; });
    await page.waitForTimeout(18_000);
    await page.evaluate(() => {
      const carousel = document.querySelector(".overlay-carousel");
      if (!carousel) throw new Error("Carousel missing");
      const observer = new MutationObserver((records) => {
        let changes = Number(carousel.getAttribute("data-measured-slide-changes") ?? "0");
        for (const record of records) {
          if (record.type === "childList") {
            changes += Array.from(record.addedNodes).filter((node) =>
              node instanceof Element && node.matches(".overlay-slide.is-active")).length;
          }
        }
        carousel.setAttribute("data-measured-slide-changes", String(changes));
      });
      carousel.setAttribute("data-measured-slide-changes", "0");
      observer.observe(carousel, { childList: true });
    });
    console.log(`Measuring run ${index + 1}`);
    const cdp = await context.newCDPSession(page);
    await cdp.send("Performance.enable");
    const events: unknown[] = [];
    cdp.on("Tracing.dataCollected", ({ value }) => events.push(...value));
    await cdp.send("Tracing.start", { categories: "devtools.timeline,toplevel", options: "record-as-much-as-possible", transferMode: "ReportEvents" });
    const beforeCpu = await system.send("SystemInfo.getProcessInfo");
    const beforeMetrics = await cdp.send("Performance.getMetrics");
    const requestCount = api.requests().length;
    let networkRequests = 0;
    const trackNetworkRequest = () => { networkRequests += 1; };
    page.on("request", trackNetworkRequest);
    await page.locator(".overlay-carousel").evaluate((element) => element.setAttribute("data-measured-slide-changes", "0"));
    const start = performance.now();
    await page.waitForTimeout(32_000);
    const seconds = (performance.now() - start) / 1000;
    page.off("request", trackNetworkRequest);
    const afterMetrics = await cdp.send("Performance.getMetrics");
    const afterCpu = await system.send("SystemInfo.getProcessInfo");
    const complete = new Promise<void>((resolve) => cdp.once("Tracing.tracingComplete", () => resolve()));
    await cdp.send("Tracing.end");
    await complete;
    const delta = (name: string) => (afterMetrics.metrics.find((metric) => metric.name === name)?.value ?? 0) -
      (beforeMetrics.metrics.find((metric) => metric.name === name)?.value ?? 0);
    const cpuDelta = (type: string) => afterCpu.processInfo.filter((process) => process.type === type).reduce((sum, process) => {
      const previous = beforeCpu.processInfo.find((candidate) => candidate.id === process.id);
      if (!previous) throw new Error("Process identity changed during measurement");
      return sum + process.cpuTime - previous.cpuTime;
    }, 0);
    const traceTotal = (name: string) => events.reduce<number>((sum, event) => {
      if (typeof event !== "object" || event === null ||
        !("name" in event) || event.name !== name || !("ph" in event) || event.ph !== "X" ||
        !("dur" in event) || typeof event.dur !== "number") return sum;
      return sum + event.dur;
    }, 0) / 1000;
    const row = {
      run: index + 1, mode, seconds, rendererCpuSeconds: cpuDelta("renderer"),
      gpuProcessCpuSeconds: cpuDelta("GPU"), processTypes: afterCpu.processInfo.map((process) => process.type),
      taskMs: delta("TaskDuration") * 1000, recalcCount: delta("RecalcStyleCount"), recalcMs: delta("RecalcStyleDuration") * 1000,
      layoutCount: delta("LayoutCount"), layoutMs: delta("LayoutDuration") * 1000,
      paintMs: traceTotal("Paint"), prePaintMs: traceTotal("PrePaint"),
      activeSlideInsertions: await page.locator(".overlay-carousel").getAttribute("data-measured-slide-changes"),
      carouselTimerFires: events.filter((event) => typeof event === "object" && event !== null &&
        "name" in event && event.name === "TimerFire" && "ph" in event && event.ph === "X").length,
      networkRequests, apiRequests: api.requests().length - requestCount,
    };
    results.push(row);
    console.log(JSON.stringify(row));
    await Bun.write(resolve(output, `${index + 1}-${mode}-trace.json`), JSON.stringify({ traceEvents: events }));
    await Bun.write(resolve(output, "results.json"), JSON.stringify({ browser: browser.version(), platform: process.platform, arch: process.arch, viewport: "1920x1080", gpu: systemInfo.gpu, results }, null, 2));
    if (index < 2) {
      await page.screenshot({ path: resolve(output, `${mode}.png`), timeout: 120_000 });
    }
    api.assertNoBrowserErrors();
    await cdp.detach();
  }
} finally {
  await browser.close();
}
