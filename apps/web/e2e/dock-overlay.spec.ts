import { expect, test } from "@playwright/test";

const API_ORIGIN = "http://127.0.0.1:3000";

test("Debug画面でDockとOverlayが起動する", async ({ page }) => {
  await page.route(`${API_ORIGIN}/**`, async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "access-control-allow-origin": "*",
        "content-type": "application/json; charset=utf-8",
      },
      body: "[]",
    });
  });

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
});
