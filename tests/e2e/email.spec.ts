import { expect, test } from "@playwright/test";
import { waitForSynced } from "./helpers";

test.use({ storageState: "test-results/.auth.json" });

/** Phase 3E: email and badge settings (NOT-7, PWA-6). */
test("email and app badge settings are saved", async ({ page }, info) => {
  test.skip(info.project.name === "phone", "Same settings on both; one run is enough");
  await page.goto("/settings");
  await waitForSynced(page);
  const weekly = page.getByRole("checkbox", { name: "Weekly report by email" });
  const reminders = page.getByRole("checkbox", { name: "Important reminders by email" });
  const badge = page.getByRole("combobox", { name: "App icon badge" });
  await expect(weekly).toBeChecked();
  await expect(reminders).toBeChecked();
  await expect(badge).toHaveValue("unread");

  // Settings switches flip once the change is saved on the device: click, then wait for it.
  await weekly.click();
  await badge.selectOption("due");
  await expect(weekly).not.toBeChecked();
  await page.waitForTimeout(300);
  await waitForSynced(page);
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Weekly report by email" })).not.toBeChecked();
  await expect(page.getByRole("combobox", { name: "App icon badge" })).toHaveValue("due");

  // Back to the defaults for other tests.
  await page.getByRole("checkbox", { name: "Weekly report by email" }).click();
  await expect(page.getByRole("checkbox", { name: "Weekly report by email" })).toBeChecked();
  await page.getByRole("combobox", { name: "App icon badge" }).selectOption("unread");
  await page.waitForTimeout(300);
  await waitForSynced(page);
});
