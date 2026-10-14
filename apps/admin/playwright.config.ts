import { defineConfig, devices } from '@playwright/test'

const apiUrls = {
  VITE_LOCAL_API_URL: 'http://127.0.0.1:8787',
  VITE_PRODUCTION_API_URL: 'http://127.0.0.1:3000',
}

export default defineConfig({
  testDir: './e2e',
  forbidOnly: true,
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:5175',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'bun run dev -- --port 5175',
      url: 'http://127.0.0.1:5175',
      env: { ...apiUrls, VITE_ADMIN_TARGET: 'local' },
      reuseExistingServer: false,
    },
    {
      command: 'bun run dev -- --port 5176',
      url: 'http://127.0.0.1:5176',
      env: { ...apiUrls, VITE_ADMIN_TARGET: 'production' },
      reuseExistingServer: false,
    },
  ],
})
