import { request, type FullConfig } from "@playwright/test";

/** Creates one throwaway account per run and saves its session for the tests. */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL!;
  const api = await request.newContext({
    baseURL,
    extraHTTPHeaders: { Origin: baseURL },
  });
  const email = `e2e-${Date.now()}@orbit.test`;
  const res = await api.post("/api/auth/sign-up/email", {
    data: {
      name: "E2E Tester",
      email,
      password: `pw-${Math.random().toString(36).slice(2)}A1`,
    },
  });
  if (!res.ok())
    throw new Error(`sign-up failed: ${res.status()} ${await res.text()}`);
  await api.storageState({ path: "test-results/.auth.json" });
  await api.dispose();
}
