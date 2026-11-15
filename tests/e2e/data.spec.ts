import { expect, request, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { run, waitForSynced } from "./helpers";

test.use({ storageState: "test-results/.auth.json" });

/** Phase 2D.4: capture from anywhere, sharing to Orbit, export and account deletion. */
test("a token captures into the Inbox from outside; revoking it stops it", async ({ page, baseURL }, info) => {
  test.skip(info.project.name === "phone", "One run is enough: it's an API");
  const r = run();
  await page.goto("/capture");
  await page.getByRole("textbox", { name: "Token name" }).fill(`Test phone ${r}`);
  await page.getByRole("button", { name: "New token" }).click();
  const token = (await page.getByLabel("New token").textContent())!.trim();
  expect(token).toMatch(/^orb_/);
  await expect(page.getByRole("list", { name: "Tokens" })).toContainText(`Test phone ${r}`);
  await expect(page.getByText(`Bearer ${token}`, { exact: true })).toBeVisible();

  // As an iOS Shortcut would: no cookies, just the token.
  const api = await request.newContext({ baseURL });
  const res = await api.post("/api/capture", {
    headers: { Authorization: `Bearer ${token}` },
    data: { text: `Buy oat milk ${r}` },
  });
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ ok: true, message: `Added to your Inbox: Buy oat milk ${r}` });
  // Plain text works too.
  const plain = await api.post("/api/capture", {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "text/plain" },
    data: `Book the dentist ${r}`,
  });
  expect(plain.status()).toBe(200);
  expect((await api.post("/api/capture", { data: { text: "no token" } })).status()).toBe(401);

  await page.goto("/inbox");
  await expect(page.getByRole("button", { name: `Open Buy oat milk ${r}` })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: `Open Book the dentist ${r}` })).toBeVisible();

  await page.goto("/capture");
  await page.getByRole("button", { name: `Revoke Test phone ${r}` }).click();
  const revoked = page.waitForResponse((r) => r.url().includes("/api/tokens/") && r.request().method() === "DELETE");
  await page.getByRole("button", { name: "Revoke token" }).click();
  expect((await revoked).status()).toBe(200);
  await expect(page.getByRole("list", { name: "Tokens" }).getByText(`Test phone ${r}`)).toHaveCount(0);
  const after = await api.post("/api/capture", {
    headers: { Authorization: `Bearer ${token}` },
    data: { text: "too late" },
  });
  expect(after.status()).toBe(401);
  await api.dispose();
});

test("sharing a link to Orbit adds it to the Inbox", async ({ page }) => {
  const r = run();
  await page.goto(
    `/share?title=${encodeURIComponent(`A great article ${r}`)}&url=${encodeURIComponent("https://example.com/a")}`,
  );
  await waitForSynced(page);
  await expect(page.getByRole("textbox", { name: "Task" })).toHaveValue(`A great article ${r}`);
  await expect(page.getByRole("textbox", { name: "Notes" })).toHaveValue("https://example.com/a");
  await page.getByRole("button", { name: "Add to Inbox" }).click();
  await expect(page).toHaveURL(/\/inbox/);
  await expect(page.getByRole("button", { name: `Open A great article ${r}` })).toBeVisible();
});

test("export everything as JSON and markdown from Settings", async ({ page }, info) => {
  test.skip(info.project.name === "phone", "One run is enough");
  await page.goto("/settings");
  await waitForSynced(page);
  await expect(page.getByText("Email and password")).toBeVisible();
  const json = page.waitForEvent("download");
  await page.getByRole("link", { name: /Export everything/ }).click();
  const file = await json;
  expect(file.suggestedFilename()).toMatch(/^orbit-\d{4}-\d{2}-\d{2}\.json$/);
  const data = JSON.parse(readFileSync(await file.path(), "utf8"));
  expect(data).toMatchObject({ format: "orbit-export", account: { name: "E2E Tester" } });
  expect(data.data.settings).toHaveLength(1);
  expect(Array.isArray(data.data.tasks)).toBe(true);
  const md = page.waitForEvent("download");
  await page.getByRole("link", { name: /Export vision, goals, journal and wins/ }).click();
  expect(readFileSync(await (await md).path(), "utf8")).toMatch(/^# Orbit export/);
});

test("delete a throwaway account: everything goes and it can't sign in", async ({ browser, baseURL }, info) => {
  test.skip(info.project.name === "phone", "One run is enough");
  const email = `delete-${Date.now()}@orbit.test`;
  const password = `pw-${Math.random().toString(36).slice(2)}A1`;
  const api = await request.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL! } });
  const res = await api.post("/api/auth/sign-up/email", { data: { name: "Short Lived", email, password } });
  expect(res.ok()).toBe(true);
  const { user } = (await res.json()) as { user: { id: string } };
  await api.post("/api/sync/push", {
    data: {
      mutations: [
        {
          mutationId: `01DEL${Date.now()}`.slice(0, 26).padEnd(16, "0"),
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
            strictness: "gentle",
            onboardingCompletedAt: Date.now(),
          },
        },
      ],
    },
  });
  const context = await browser.newContext({ storageState: await api.storageState() });
  const page = await context.newPage();
  await page.goto("/settings");
  await expect(page.getByRole("main").getByText("Short Lived")).toBeVisible();
  await page.getByRole("button", { name: "Delete account…" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete your account?" });
  const confirm = dialog.getByRole("button", { name: "Delete account" });
  await expect(confirm).toBeDisabled();
  await dialog.getByRole("textbox", { name: "Type DELETE to confirm" }).fill("DELETE");
  await confirm.click();
  await expect(page).toHaveURL(new URL("/", baseURL!).href);
  // The session is gone, and the account can't sign in again.
  expect((await api.get("/api/account")).status()).toBe(401);
  const again = await api.post("/api/auth/sign-in/email", { data: { email, password } });
  expect(again.ok()).toBe(false);
  await context.close();
  await api.dispose();
});
