import { expect, test } from "@playwright/test";
import { addToday, run, waitForSynced } from "./helpers";

test.use({ storageState: "test-results/.auth.json" });

/** Phase 3C: routines (HAB-5) with a habit step. */
test("make a routine with a habit step, run it from Today, and the habit is ticked", async ({ page }) => {
  const r = run();
  const habit = `Stretch ${r}`;
  const routine = `Morning start ${r}`;
  await page.goto("/habits");
  await waitForSynced(page);
  await page.getByRole("button", { name: "New habit" }).first().click();
  const habitForm = page.getByRole("dialog");
  await habitForm.getByRole("textbox").first().fill(habit);
  await habitForm
    .getByRole("button", { name: /Create|Add|Save/ })
    .last()
    .click();
  await expect(page.getByText(habit).first()).toBeVisible();

  await page.getByRole("button", { name: "New routine" }).click();
  const form = page.getByRole("dialog", { name: "New routine" });
  await form.getByRole("textbox", { name: "Name" }).fill(routine);
  for (const step of ["Glass of water", "Stretch", "Plan the day"]) {
    await form.getByRole("textbox", { name: "New step" }).fill(step);
    await form.getByRole("textbox", { name: "New step" }).press("Enter");
  }
  await form.getByRole("combobox", { name: "Habit for step 2" }).selectOption({ label: `Ticks “${habit}”` });
  await form.getByRole("spinbutton", { name: "Minutes for step 2" }).fill("5");
  await form.getByRole("button", { name: "Create routine" }).click();
  await expect(form).toBeHidden();
  await expect(page.getByRole("region", { name: "Routines" })).toContainText(routine);

  // Run it from Today.
  await page.goto("/today");
  await page.getByRole("button", { name: `Start ${routine}` }).click();
  const runner = page.getByRole("dialog", { name: routine });
  const current = runner.getByRole("region", { name: "Current step" });
  await expect(current).toContainText("Glass of water");
  await current.getByRole("button", { name: "Done" }).click();
  await expect(current).toContainText("Stretch");
  await expect(current).toContainText("5:00");
  await current.getByRole("button", { name: "Done" }).click();
  await expect(current).toContainText("Plan the day");
  await current.getByRole("button", { name: "Skip" }).click();
  await expect(runner).toContainText("Routine done");
  await runner.getByRole("button", { name: "Close" }).click();
  // Done for today: it leaves Today.
  await expect(page.getByRole("button", { name: `Start ${routine}` })).toHaveCount(0);

  // The habit step ticked the habit.
  await page.goto("/habits");
  await expect(page.getByRole("region", { name: "Routines" })).toContainText(`${routine}`);
  await expect(page.getByRole("region", { name: "Routines" })).toContainText("done today");
  await expect(page.getByRole("checkbox", { name: `Check in ${habit}` }).first()).toBeChecked();
});

/** TASK-8: blocked tasks. */
test("a task blocked by another is dimmed, then freed when the blocker is done", async ({ page }) => {
  const r = run();
  const first = `Write the brief ${r}`;
  const second = `Send to the designer ${r}`;
  await page.goto("/today");
  await waitForSynced(page);
  await addToday(page, first);
  await addToday(page, second);

  await page.getByRole("button", { name: `Open ${second}` }).click();
  await page.getByRole("button", { name: "Add a task it waits on" }).click();
  await page.getByRole("textbox", { name: "Find a task" }).fill(first);
  await page.getByRole("list", { name: "Tasks to wait on" }).getByRole("button", { name: first }).click();
  await expect(page.getByRole("list", { name: "Blocked by" })).toContainText(first);
  await expect(page.getByRole("region", { name: "Links" })).toContainText("waiting on 1");
  await page.getByRole("button", { name: "Close" }).first().click();

  const row = page.getByRole("button", { name: `Open ${second}` });
  await expect(row.getByLabel("Blocked")).toBeVisible();
  await page.getByRole("checkbox", { name: `Complete ${first}` }).click();
  await expect(page.getByText(`Unblocked: ${second}`)).toBeVisible();
  await expect(row.getByLabel("Blocked")).toHaveCount(0);
});

/** JRN-3: journal search and calendar. */
test("search the journal and open a day from the calendar", async ({ page }) => {
  const r = run();
  const words = `Interview prep with Ada ${r}`;
  await page.goto("/journal");
  await waitForSynced(page);
  await page.getByRole("textbox", { name: "Journal entry" }).fill(words);
  await page.getByRole("textbox", { name: "Journal entry" }).blur();
  // Desktop and phone runs share today's entry: tapping a chosen mood again clears it.
  const good = page.getByRole("radiogroup", { name: "Mood", exact: true }).getByRole("radio", { name: "Good" });
  if ((await good.getAttribute("aria-checked")) !== "true") await good.click();
  await expect(good).toHaveAttribute("aria-checked", "true");

  // Today's page is found by search (even though it's the one open).
  await page.getByRole("searchbox", { name: "Search the journal" }).fill(`ada ${r}`);
  const matches = page.getByRole("list", { name: "Matching entries" });
  await expect(matches.getByRole("link")).toHaveCount(1);
  await expect(matches).toContainText(words);
  await page.getByRole("searchbox", { name: "Search the journal" }).fill(`nothing-like-this-${r}`);
  await expect(page.getByText("Nothing matches.")).toBeVisible();

  // The calendar marks today, with its mood.
  await page.getByRole("radio", { name: "Calendar" }).click();
  const cal = page.getByRole("table", { name: /^Journal for / });
  await expect(cal.getByRole("link", { name: /^Today, Good, has an entry$/ })).toBeVisible();
  await page.getByRole("button", { name: "Previous month" }).click();
  await page.getByRole("button", { name: "Next month" }).click();
  await cal.getByRole("link", { name: /^Today/ }).click();
  await expect(page.getByRole("textbox", { name: "Journal entry" })).toHaveValue(words);
});
