import { defineConfig, devices } from "@playwright/test";

const PORT = 3002;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  retries: 0,
  workers: 1,
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    // The test account's timezone is UTC (global-setup). A browser in another timezone disagrees
    // about what "today" is for an hour around midnight, which broke date-based tests then.
    timezoneId: "UTC",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  // Offline behaviour needs the production build (service worker is disabled in dev).
  webServer: {
    command: `pnpm build && pnpm start -p ${PORT}`,
    url: `http://localhost:${PORT}/sign-in`,
    timeout: 240_000,
    reuseExistingServer: !process.env.CI,
    env: {
      MONGODB_URI: process.env.E2E_MONGODB_URI ?? "mongodb://127.0.0.1:27017/orbit_e2e",
      BETTER_AUTH_URL: `http://localhost:${PORT}`,
      // The coach talks to a scripted fake model in tests: no API key, no cost.
      COACH_FAKE: "1",
      // Calendars talk to an in-memory fake Google (lib/calendar/google.ts).
      CALENDAR_FAKE: "1",
    },
  },
});
