import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:4197",
    channel: "chrome",
    headless: true,
    viewport: { width: 1440, height: 960 },
  },
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 4197 --strictPort",
    url: "http://127.0.0.1:4197",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
