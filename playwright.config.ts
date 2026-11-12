import { defineConfig, devices } from "@playwright/test";

const PORT = 3002;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  retries: 0,
  workers: 1,
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
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
      MONGODB_URI:
        process.env.E2E_MONGODB_URI ?? "mongodb://127.0.0.1:27017/orbit_e2e",
      BETTER_AUTH_URL: `http://localhost:${PORT}`,
    },
  },
});
