import { expect, test, type Page } from "@playwright/test";
import { addToday, clearMustDos, openSkip, run, waitForSynced } from "./helpers";

test.use({ storageState: "test-results/.auth.json" });

/**
 * Day changes in the browser. The browser's clock is moved with `page.clock`; the server stays on
 * real time, so the device is always ahead of it here (the server clamps such a clock when it
 * orders writes). The test account's timezone is UTC. The full week runs in tests/unit/week.test.ts.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The Today header's date, formatted by the browser exactly as the app does. */
function headerLabel(page: Page, day: string) {
  return page.evaluate((d) => {
    const [y, m, dd] = d.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, dd)).toLocaleDateString(undefined, {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    });
  }, day);
}

/** Midnight (UTC) at the start of the first simulated day. Each project gets its own days. */
function firstMidnight(project: string) {
  return Math.floor(Date.now() / DAY) * DAY + (project === "phone" ? 3 : 1) * DAY;
}

const row = (page: Page, title: string) => page.getByRole("button", { name: `Open ${title}` });

test("Today rolls over at midnight with the page open, and a reload shows the same day", async ({ page }, info) => {
  test.setTimeout(150_000);
  const r = run();
  const start = firstMidnight(info.project.name);
  const [day1, day2] = [dayOf(start), dayOf(start + DAY)];
  const finished = `Finished must ${r}`;
  const unfinished = `Unfinished must ${r}`;
  const other = `Other task ${r}`;

  // Day 1, 22:00.
  await page.clock.install({ time: new Date(start + 22 * HOUR) });
  await page.goto("/today");
  await expect(page.getByText(await headerLabel(page, day1))).toBeVisible();
  await clearMustDos(page);
  for (const t of [finished, unfinished, other]) await addToday(page, t);
  for (const t of [finished, unfinished]) {
    await page.getByRole("button", { name: `Make ${t} a Must-do` }).click();
    await expect(page.getByRole("button", { name: `Remove ${t} from Must-dos` })).toBeVisible();
  }
  await page.getByRole("checkbox", { name: `Complete ${finished}` }).click();
  await expect(page.getByRole("list", { name: "Must-dos" }).getByRole("listitem")).toHaveCount(2);
  await waitForSynced(page);

  // Midnight passes with the page open: no reload. Only the date moves (fast-forwarding the
  // browser's animation clock as well leaves dialogs stuck mid-close), so the app notices on
  // its own next minute tick.
  await page.clock.setSystemTime(new Date(start + DAY + 30 * 60_000));
  await expect(page.getByText(await headerLabel(page, day2))).toBeVisible({ timeout: 70_000 });
  await expect(page.getByText(await headerLabel(page, day1))).toHaveCount(0);
  const overdue = page.getByRole("list", { name: "Overdue" });
  // Yesterday's unfinished Must-do is no longer a Must-do; it and the other task need a decision.
  await expect(page.getByRole("button", { name: `Remove ${unfinished} from Must-dos` })).toHaveCount(0);
  await expect(overdue.getByRole("button", { name: `Open ${unfinished}` })).toContainText("Unfinished Must-do");
  await expect(overdue.getByRole("button", { name: `Open ${other}` })).toBeVisible();
  // What was finished yesterday is not "Done today".
  await expect(row(page, finished)).toHaveCount(0);

  // Decide on each: one comes back to today and is starred again, the other is moved with a reason.
  await page.getByRole("button", { name: `Do ${unfinished} today` }).click();
  await expect(
    page.getByRole("list", { name: "Also today" }).getByRole("button", { name: `Open ${unfinished}` }),
  ).toBeVisible();
  await page.getByRole("button", { name: `Make ${unfinished} a Must-do` }).click();
  await expect(page.getByRole("button", { name: `Remove ${unfinished} from Must-dos` })).toBeVisible();

  await openSkip(page, other);
  const dialog = page.getByRole("dialog", { name: `Move “${other}”` });
  await dialog.getByRole("button", { name: "No time" }).click();
  await dialog.getByRole("button", { name: "Move to tomorrow" }).click();
  await expect(page.getByText("Moved to tomorrow")).toBeVisible();
  await expect(row(page, other)).toHaveCount(0);
  await waitForSynced(page);

  // A reload on the new day (now with the server's copies) shows the same thing.
  await page.reload();
  await expect(page.getByText(await headerLabel(page, day2))).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Must-dos" }).getByRole("button", { name: `Open ${unfinished}` }),
  ).toBeVisible();
  await waitForSynced(page);
  await expect(page.getByRole("button", { name: `Remove ${unfinished} from Must-dos` })).toHaveCount(1);
  await expect(row(page, other)).toHaveCount(0);
  await expect(row(page, finished)).toHaveCount(0);

  // The moved task is in Upcoming, with its reason in the history.
  await page.goto("/upcoming");
  await row(page, other).click();
  await expect(page.getByText(/— No time/)).toHaveCount(1);
});

test("after the device sleeps past midnight, Today is right as soon as the app is back", async ({ page }, info) => {
  const r = run();
  const start = firstMidnight(info.project.name) + 2 * DAY;
  const [day1, day2] = [dayOf(start), dayOf(start + DAY)];
  const left = `Left overnight ${r}`;
  const morning = `Morning task ${r}`;

  await page.clock.install({ time: new Date(start + 22 * HOUR) });
  await page.goto("/today");
  await expect(page.getByText(await headerLabel(page, day1))).toBeVisible();
  await addToday(page, left);
  // Everything is synced before the sleep, so nothing arriving from the server redraws the page.
  await waitForSynced(page);
  await page.waitForTimeout(1_000);

  // Sleep: the clock jumps to 07:00 without any timer firing, then the app becomes visible again.
  await page.clock.setSystemTime(new Date(start + DAY + 7 * HOUR));
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.getByText(await headerLabel(page, day2))).toBeVisible({ timeout: 5_000 });
  await expect(page.getByRole("list", { name: "Overdue" }).getByRole("button", { name: `Open ${left}` })).toBeVisible();

  // A task added now is planned for the new day, not yesterday.
  await addToday(page, morning);
  await expect(
    page.getByRole("list", { name: "Also today" }).getByRole("button", { name: `Open ${morning}` }),
  ).toBeVisible();
  await waitForSynced(page);
});
