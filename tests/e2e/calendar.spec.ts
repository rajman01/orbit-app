import { expect, test } from "@playwright/test";
import { waitForSynced } from "./helpers";

test.use({ storageState: "test-results/.auth.json" });

/**
 * Phase 2B.1: Google Calendar, read. The test server uses a fake Google (CALENDAR_FAKE=1) with two
 * calendars, "Personal" and "Work", and a few events around today.
 */
test("connect Google Calendar, see today's events on every device, and hide a calendar", async ({
  page,
  context,
  browser,
}, info) => {
  test.skip(info.project.name === "phone", "One account per run; once is enough (the agenda is the same on phones)");
  await page.goto("/settings");
  await page.getByRole("link", { name: /Connect (another )?Google/ }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByText(/Google Calendar connected/)).toBeVisible();
  const account = page.getByLabel("Calendar account you@gmail.example");
  await expect(account.getByRole("checkbox", { name: "Show Work" })).toBeVisible({ timeout: 20_000 });

  await page.goto("/today");
  const agenda = page.getByRole("region", { name: "Calendar today" });
  await expect(agenda.getByText("Team standup")).toBeVisible({ timeout: 15_000 });
  await expect(agenda.getByText("Lunch with Sam")).toBeVisible();
  // Tomorrow's all-day event isn't today's.
  await expect(agenda.getByText("Mum's birthday")).toHaveCount(0);
  await waitForSynced(page);

  // Another device gets them through sync.
  const other = await browser.newContext();
  await other.addCookies(await context.cookies());
  const phone = await other.newPage();
  await phone.goto("/today");
  await expect(phone.getByRole("region", { name: "Calendar today" }).getByText("Team standup")).toBeVisible({
    timeout: 20_000,
  });
  await other.close();

  // Hide "Work": its event leaves Today.
  await page.goto("/settings");
  // The box follows the saved choice a moment after the click, so click and then wait.
  const work = page.getByRole("checkbox", { name: "Show Work" });
  await work.click();
  await expect(work).not.toBeChecked();
  await page.goto("/today");
  await expect(page.getByRole("region", { name: "Calendar today" }).getByText("Lunch with Sam")).toBeVisible();
  await expect(page.getByText("Team standup")).toHaveCount(0, { timeout: 15_000 });

  // Leave it as it was for other runs.
  await page.goto("/settings");
  await page.getByRole("checkbox", { name: "Show Work" }).click();
  await expect(page.getByRole("checkbox", { name: "Show Work" })).toBeChecked();
  await waitForSynced(page);
});
