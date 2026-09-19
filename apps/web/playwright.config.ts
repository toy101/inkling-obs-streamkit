import { defineConfig, devices } from "@playwright/test";

const WEB_ORIGIN = "http://127.0.0.1:5173";
const API_ORIGIN = "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: "list",
  outputDir: "test-results",
  use: {
    baseURL: WEB_ORIGIN,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "bun run vite --host 127.0.0.1 --port 5173 --strictPort",
    env: {
      VITE_API_URL: API_ORIGIN,
    },
    reuseExistingServer: false,
    timeout: 120_000,
    url: WEB_ORIGIN,
  },
});
