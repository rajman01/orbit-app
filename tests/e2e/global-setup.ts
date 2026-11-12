import { request, type FullConfig } from "@playwright/test";

const randomId = () =>
  Array.from({ length: 26 }, () => "0123456789ABCDEFGHJKMNPQRSTVWXYZ"[Math.floor(Math.random() * 32)]).join("");

/**
 * Creates one throwaway account per run, finishes onboarding for it (settings with
 * onboardingCompletedAt) and saves its session for the tests.
 */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL!;
  const api = await request.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL } });
  const email = `e2e-${Date.now()}@orbit.test`;
  const res = await api.post("/api/auth/sign-up/email", {
    data: { name: "E2E Tester", email, password: `pw-${Math.random().toString(36).slice(2)}A1` },
  });
  if (!res.ok()) throw new Error(`sign-up failed: ${res.status()} ${await res.text()}`);
  const { user } = (await res.json()) as { user: { id: string } };

  const push = await api.post("/api/sync/push", {
    data: {
      mutations: [
        {
          mutationId: randomId(),
          entity: "settings",
          entityId: `s${user.id}`,
          op: "upsert",
          clientTime: Date.now(),
          fields: {
            timezone: "UTC",
            weekStartDay: 0,
            cycleLengthDays: 14,
            dailyCapacityPts: 8,
            cycleCapacityPts: 30,
            workingHours: { start: "09:00", end: "17:00" },
            strictness: "firm",
            onboardingCompletedAt: Date.now(),
          },
        },
      ],
    },
  });
  const body = (await push.json()) as { applied: string[]; rejected: unknown[] };
  if (!push.ok() || body.rejected.length) throw new Error(`settings push failed: ${JSON.stringify(body)}`);

  await api.storageState({ path: "test-results/.auth.json" });
  await api.dispose();
}
