import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { addToday, run, waitForSynced } from "./helpers";

test.use({ storageState: "test-results/.auth.json" });

/** Phase 1D: habits, XP and reminders. */

/** Reads one value from .env.local without printing it (the test server reads the same file). */
function envValue(name: string): string | undefined {
  try {
    const line = readFileSync(".env.local", "utf8")
      .split("\n")
      .find((l) => l.startsWith(`${name}=`));
    return line?.slice(name.length + 1).trim() || undefined;
  } catch {
    return undefined;
  }
}

/** XP entries for one source, read from this device's local database. */
function xpEntries(page: Page, sourceId: string) {
  return page.evaluate(async (id) => {
    const name = (await indexedDB.databases()).find((d) => d.name?.startsWith("orbit-"))?.name;
    if (!name) return -1;
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(name);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const rows = await new Promise<{ sourceId: string; deletedAt: number | null }[]>((resolve) => {
      const req = db.transaction("xpEvents").objectStore("xpEvents").getAll();
      req.onsuccess = () => resolve(req.result);
    });
    db.close();
    return rows.filter((r) => r.sourceId === id && r.deletedAt == null).length;
  }, sourceId);
}

test("a habit checked in offline keeps its streak after syncing", async ({ page, context }) => {
  const r = run();
  const name = `Read ${r}`;
  await page.goto("/habits");
  await waitForSynced(page);
  await page.getByRole("button", { name: "New habit" }).click();
  const dialog = page.getByRole("dialog", { name: "New habit" });
  await dialog.getByRole("textbox", { name: "Habit" }).fill(name);
  await dialog.getByRole("button", { name: "Add habit" }).click();
  const check = page.getByRole("checkbox", { name: `Check in ${name}` });
  await expect(check).toBeVisible();
  await waitForSynced(page);

  await context.setOffline(true);
  await check.click();
  await expect(check).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("listitem").filter({ hasText: name })).toContainText("1 day");
  await context.setOffline(false);
  await waitForSynced(page);

  await page.reload();
  await expect(page.getByRole("checkbox", { name: `Check in ${name}` })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("listitem").filter({ hasText: name })).toContainText("1 day");

  // It's on Today too, and the check-in earned XP.
  await page.goto("/today");
  await expect(page.getByRole("list", { name: "Habits" }).getByText(name)).toBeVisible();
  await page.goto("/levels");
  await expect(page.getByText(`Habit: ${name}`)).toBeVisible();
});

test("XP for a task is awarded once even if two devices complete it", async ({ page, context, browser }, info) => {
  test.skip(info.project.name === "phone", "Uses two browser contexts; once is enough");
  const r = run();
  const title = `Two devices ${r}`;
  await page.goto("/today");
  await waitForSynced(page);
  await addToday(page, title);
  await waitForSynced(page);
  const id = (await page.getByRole("button", { name: `Open ${title}` }).getAttribute("data-task-row"))!;

  const other = await browser.newContext();
  await other.addCookies(await context.cookies());
  const laptop = await other.newPage();
  await laptop.goto("/today");
  await expect(laptop.getByRole("button", { name: `Open ${title}` })).toBeVisible({ timeout: 15_000 });
  await waitForSynced(laptop);

  // Both offline, both tick it off, both come back.
  await context.setOffline(true);
  await other.setOffline(true);
  await page.getByRole("checkbox", { name: `Complete ${title}` }).click();
  await laptop.getByRole("checkbox", { name: `Complete ${title}` }).click();
  await context.setOffline(false);
  await other.setOffline(false);
  await waitForSynced(page);
  await waitForSynced(laptop);
  await page.reload();
  await waitForSynced(page);

  expect(await xpEntries(page, id)).toBe(1);
  await other.close();
});

test("the reminder job only runs with its secret", async ({ request }) => {
  expect((await request.get("/api/cron/dispatch-reminders")).status()).toBe(401);
  expect(
    (
      await request.get("/api/cron/dispatch-reminders", { headers: { Authorization: "Bearer wrong-secret-value" } })
    ).status(),
  ).toBe(401);
  const secret = envValue("CRON_SECRET");
  test.skip(!secret, "CRON_SECRET isn't set in .env.local");
  const res = await request.get("/api/cron/dispatch-reminders", { headers: { Authorization: `Bearer ${secret}` } });
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ users: expect.any(Number), notifications: expect.any(Number) });
});

test("weekly report and levels pages show where you stand", async ({ page }) => {
  await page.goto("/report");
  await expect(page.getByRole("heading", { name: "Weekly report" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Accountability score" })).toBeVisible();
  await page.goto("/levels");
  await expect(page.getByRole("region", { name: "Your level" })).toContainText(/Level \d+/);
});
