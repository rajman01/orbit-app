import { expect, test } from "@playwright/test";
import { addToday, clearMustDos, openSkip, run, waitForSynced } from "./helpers";

test.use({ storageState: "test-results/.auth.json" });

test("Must-dos are capped at 3; a 4th forces a swap", async ({ page }) => {
  const r = run();
  await page.goto("/today");
  await clearMustDos(page);
  const titles = [1, 2, 3, 4].map((i) => `Must ${i} ${r}`);
  for (const t of titles) await addToday(page, t);

  for (const t of titles.slice(0, 3)) {
    await page.getByRole("button", { name: `Make ${t} a Must-do` }).click();
    await expect(page.getByRole("button", { name: `Remove ${t} from Must-dos` })).toBeVisible();
  }
  await expect(page.getByRole("list", { name: "Must-dos" }).getByRole("listitem")).toHaveCount(3);

  await page.getByRole("button", { name: `Make ${titles[3]} a Must-do` }).click();
  const swap = page.getByRole("dialog", { name: "Swap a Must-do" });
  await expect(swap).toBeVisible();
  await swap.getByRole("button", { name: new RegExp(titles[0]) }).click();

  await expect(page.getByRole("button", { name: `Remove ${titles[3]} from Must-dos` })).toBeVisible();
  await expect(page.getByRole("button", { name: `Make ${titles[0]} a Must-do` })).toBeVisible();
  await expect(page.getByRole("list", { name: "Must-dos" }).getByRole("listitem")).toHaveCount(3);
  await clearMustDos(page);
});

test("moving a planned task asks why, records it, and 3 moves make it stale", async ({ page }) => {
  const r = run();
  const title = `Write the report ${r}`;
  await page.goto("/today");
  await addToday(page, title);

  for (let i = 1; i <= 3; i++) {
    await openSkip(page, title);
    const dialog = page.getByRole("dialog", { name: `Move “${title}”` });
    // Firm strictness: a reason is required, there is no way to skip it.
    await expect(dialog.getByRole("button", { name: "Move without a reason" })).toHaveCount(0);
    await dialog.getByRole("button", { name: "No time" }).click();
    await dialog.getByRole("button", { name: "Move to tomorrow" }).click();
    await expect(page.getByText("Moved to tomorrow")).toBeVisible();
    await expect(dialog).toHaveCount(0);
    // The third move makes it stale, and stale tasks stay pinned on Today.
    if (i === 3) break;
    await expect(page.getByRole("button", { name: `Open ${title}` })).toHaveCount(0);

    // Bring it back to today from Upcoming (not a skip: it's moving earlier).
    await page.goto("/upcoming");
    await page.getByRole("button", { name: `Open ${title}` }).click();
    await page.getByRole("button", { name: "Do it on" }).click();
    await page.getByRole("button", { name: "Today", exact: true }).click();
    await expect(page.getByRole("button", { name: "Do it on" })).toHaveText(/Today/);
    await page.goto("/today");
  }

  // Postponed 3 times: pinned as stale with the five ways out.
  const stale = page.getByRole("region", { name: "Needs a decision" });
  await expect(stale.getByRole("button", { name: `Open ${title}` })).toContainText("Postponed 3×");
  const resolve = stale.getByRole("group", { name: `Resolve ${title}` });
  await expect(resolve.getByRole("button")).toHaveText([
    "Break it down",
    "Do 5 minutes now",
    "Reschedule",
    "Ask for help",
    "Drop it",
  ]);

  // The history shows every skip with its reason.
  await page.getByRole("button", { name: `Open ${title}` }).click();
  await expect(page.getByText(/— No time/)).toHaveCount(3);
  await page.getByRole("button", { name: "Close" }).first().click();

  await resolve.getByRole("button", { name: "Drop it" }).click();
  await expect(page.getByRole("button", { name: `Open ${title}` })).toHaveCount(0);
});

test("focus mode: the timer survives a reload, and ending asks how it went", async ({ page }) => {
  const r = run();
  const title = `Draft the intro ${r}`;
  await page.goto("/today");
  await addToday(page, title);
  await page.getByRole("button", { name: `Open ${title}` }).click();
  await page.getByRole("button", { name: "Start focus" }).click();

  const focus = page.getByRole("dialog", { name: `Focus: ${title}` });
  await expect(focus).toBeVisible();
  await expect(focus.getByRole("timer")).toContainText(/0[45]:\d\d/);
  await expect(page).toHaveTitle(/^0[45]:\d\d · /);

  await page.waitForTimeout(1500);
  await page.reload();
  await expect(focus).toBeVisible();
  await expect(focus.getByRole("timer")).toContainText(/04:\d\d/);

  await focus.getByRole("button", { name: "Pause" }).click();
  await expect(focus.getByText("Paused")).toBeVisible();
  await focus.getByRole("button", { name: "Resume" }).click();

  await focus.getByRole("button", { name: "End" }).click();
  await focus.getByRole("button", { name: "Made progress" }).click();
  await focus.getByRole("textbox").last().fill(`Write the first paragraph ${r}`);
  await focus.getByRole("button", { name: "Save and stop" }).click();
  await expect(focus).toHaveCount(0);

  await expect(page.getByText(`↳ Write the first paragraph ${r}`)).toBeVisible();
  await page.getByRole("button", { name: `Open ${title}` }).click();
  await expect(page.getByText(/Focused \d+ min across 1 session/)).toBeVisible();
});

test("a focus session started offline syncs when back online", async ({ page, context }) => {
  const r = run();
  const title = `Offline focus ${r}`;
  await page.goto("/today");
  await addToday(page, title);
  await waitForSynced(page);

  await context.setOffline(true);
  await page.getByRole("button", { name: `Open ${title}` }).click();
  await page.getByRole("button", { name: "Start focus" }).click();
  const focus = page.getByRole("dialog", { name: `Focus: ${title}` });
  await focus.getByRole("button", { name: "Done" }).click();
  await expect(focus).toHaveCount(0);

  await context.setOffline(false);
  await waitForSynced(page);

  // Everything written offline (session start and end, task done) has been pushed.
  await page.goto("/today");
  await expect(
    page.getByRole("list", { name: "Done today" }).getByRole("button", { name: `Open ${title}` }),
  ).toBeVisible();
});

test("a task due today can't be moved to 'No date' (its deadline would be lost)", async ({ page }) => {
  const r = run();
  const due = `Pay rent ${r}`;
  const planned = `Tidy desk ${r}`;
  await page.goto("/today");
  await addToday(page, due);
  await addToday(page, planned);

  // Give the first one a due date of today.
  await page.getByRole("button", { name: `Open ${due}` }).click();
  await page.getByRole("button", { name: "Due date" }).click();
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(page.getByRole("button", { name: "Due date" })).toHaveText(/Today/);
  await page.getByRole("button", { name: "Close" }).first().click();

  await openSkip(page, due);
  let dialog = page.getByRole("dialog", { name: `Move “${due}”` });
  await dialog.getByRole("button", { name: "No time" }).click();
  await expect(dialog.getByRole("radio", { name: "Tomorrow" })).toHaveAttribute("aria-checked", "true");
  await expect(dialog.getByRole("radio", { name: "No date" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  // A task that's only planned for today (no deadline) still offers it.
  await openSkip(page, planned);
  dialog = page.getByRole("dialog", { name: `Move “${planned}”` });
  await dialog.getByRole("button", { name: "No time" }).click();
  await expect(dialog.getByRole("radio", { name: "No date" })).toBeVisible();
  await page.keyboard.press("Escape");
});
