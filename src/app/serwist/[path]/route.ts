import { createSerwistRoute } from "@serwist/turbopack";
import { spawnSync } from "node:child_process";

// Revision for the app-shell pages we precache; changes on every commit (or build, if no git).
const revision = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout?.trim() || crypto.randomUUID();

// App shells precached so the installed app opens fully offline.
const shells = [
  "/",
  "/~offline",
  "/today",
  "/inbox",
  "/tasks",
  "/goals",
  "/goal",
  "/areas",
  "/area",
  "/cycle",
  "/settings",
  "/welcome",
  "/sign-in",
  "/sign-up",
];

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  additionalPrecacheEntries: shells.map((url) => ({ url, revision })),
  swSrc: "src/app/sw.ts",
  useNativeEsbuild: true,
});
