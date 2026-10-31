import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 30_000,
  fullyParallel: true,
  workers: 3,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:9188", trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "firefox", use: { browserName: "firefox" } },
    { name: "webkit", use: { browserName: "webkit" } }
  ],
  webServer: {
    command: "node dist-server/main.mjs",
    url: "http://127.0.0.1:9188/api/health",
    env: { PORT: "9188", RATE_BURST: "100000", RATE_PER_SEC: "100000" },
    reuseExistingServer: false
  }
});
