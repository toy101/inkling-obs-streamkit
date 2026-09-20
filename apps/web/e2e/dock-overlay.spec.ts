import { expect, test } from "./test";

test("Debug画面でDockとOverlayが起動する", async ({ page, api }) => {
  await page.goto("/?view=debug");

  const dock = page.getByRole("complementary", {
    name: "表示コントローラー",
  });
  await expect(dock).toBeVisible();
  await expect(
    dock.getByRole("heading", { name: "Inkling StreamKit" }),
  ).toBeVisible();

  const overlayFrame = page.getByTitle("1920 × 1080 Overlay プレビュー");
  await expect(overlayFrame).toBeVisible();
  await expect(overlayFrame).toHaveAttribute("width", "1920");
  await expect(overlayFrame).toHaveAttribute("height", "1080");

  const overlay = page.frameLocator(
    'iframe[title="1920 × 1080 Overlay プレビュー"]',
  );
  await expect(overlay.locator("main.overlay")).toBeVisible();

  await expect.poll(() => api.requestCount("/tournaments")).toBeGreaterThan(0);
  await expect
    .poll(() => api.requestCount("/tournaments/:id/teams"))
    .toBeGreaterThan(0);
  await expect.poll(() => api.requestCount("/rules")).toBeGreaterThan(0);
  await expect.poll(() => api.requestCount("/stages")).toBeGreaterThan(0);
});
