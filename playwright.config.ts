import { defineConfig, devices } from "@playwright/test";

const externalBaseUrl = process.env.E2E_BASE_URL;
const baseURL = externalBaseUrl ?? "https://127.0.0.1:8788";
const sharedRoomContract = /two isolated visitors share one persistent, recoverable room/;
const localStatePath = `.wrangler/e2e-state-${process.pid}`;

if (externalBaseUrl && !process.env.E2E_MODERATOR_TOKEN) {
  throw new Error("Remote E2E requires E2E_MODERATOR_TOKEN supplied through 1Password.");
}

export default defineConfig({
  testDir: "./test/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "line",
  use: {
    baseURL,
    ignoreHTTPSErrors: !externalBaseUrl,
    trace: externalBaseUrl ? "off" : "retain-on-failure",
    screenshot: externalBaseUrl ? "off" : "only-on-failure",
    video: externalBaseUrl ? "off" : "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      grep: sharedRoomContract,
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      grep: sharedRoomContract,
      use: { ...devices["Desktop Safari"] },
    },
  ],
  webServer: externalBaseUrl
    ? undefined
    : {
        command:
          `npx wrangler dev --local --local-protocol https --port 8788 --persist-to ${localStatePath} --var MODERATOR_TOKEN:e2e-moderator-token`,
        url: `${baseURL}/api/health`,
        ignoreHTTPSErrors: true,
        timeout: 60_000,
        reuseExistingServer: false,
      },
});
