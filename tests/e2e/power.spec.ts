import { expect, test } from "@playwright/test";
import { addToday, run, waitForSynced } from "./helpers";

test.use({ storageState: "test-results/.auth.json" });

/** Phase 2D.5: bulk actions (TASK-7), saved views (CMD-4), the notification centre (NOT-5). */
test("bulk-select three tasks, move them, and save the view", async ({ page }, info) => {
  const r = run();
  const titles = [`Bulk one ${r}`, `Bulk two ${r}`, `Bulk three ${r}`];
  await page.goto("/today");
  for (const t of titles) await addToday(page, t);

  await page.goto("/tasks");
  await expect(page.getByRole("button", { name: `Open ${titles[0]}` })).toBeVisible();
  await page.getByRole("button", { name: "Select", exact: true }).click();
  const bar = page.getByRole("toolbar", { name: "Selected tasks" });
  await expect(bar).toContainText("0 selected");
  for (const t of titles) await page.getByRole("button", { name: `Select ${t}` }).click();
  await expect(bar).toContainText("3 selected");

  await bar.getByRole("button", { name: "Set priority" }).click();
  await page.getByRole("menuitem", { name: /^High/ }).click();
  await expect(page.getByText("Priority changed · 3 tasks")).toBeVisible();
  await bar.getByRole("button", { name: "Move to cycle" }).click();
  await page.getByRole("menuitem", { name: /\(current\)/ }).click();
  await expect(page.getByText("Moved to cycle · 3 tasks")).toBeVisible();
  await bar.getByRole("button", { name: "Done" }).click();
  await expect(bar).toBeHidden();

  // Filter to what was just set: all three are there.
  await page.getByRole("button", { name: "Any priority" }).click();
  await page.getByRole("menuitem", { name: "High and above" }).click();
  await page.getByRole("button", { name: "Any cycle" }).click();
  await page.getByRole("menuitem", { name: "This cycle" }).click();
  for (const t of titles) await expect(page.getByRole("button", { name: `Open ${t}` })).toBeVisible();

  // Save it as a view.
  await page.getByRole("button", { name: "Save view" }).click();
  const dialog = page.getByRole("dialog", { name: "Save view" });
  await expect(dialog.getByRole("textbox", { name: "View name" })).toHaveValue("High and above, this cycle");
  await dialog.getByRole("textbox", { name: "View name" }).fill(`Hot ${r}`);
  await dialog.getByRole("button", { name: "Save view" }).click();
  await expect(page).toHaveURL(/\/tasks\?view=/);
  await expect(page.getByRole("heading", { name: `Hot ${r}` })).toBeVisible();
  const url = page.url();

  // It's in the sidebar (desktop) and the palette, and opening it again restores its filters.
  if (info.project.name === "desktop") {
    await page.goto("/today");
    await page
      .getByRole("group", { name: "Saved views" })
      .getByRole("link", { name: `Hot ${r}` })
      .click();
  } else {
    await page.goto(url);
  }
  await expect(page.getByRole("heading", { name: `Hot ${r}` })).toBeVisible();
  await expect(page.getByRole("button", { name: "High and above" })).toBeVisible();
  for (const t of titles) await expect(page.getByRole("button", { name: `Open ${t}` })).toBeVisible();

  // Desktop: ⌘A selects every task shown.
  if (info.project.name === "desktop") {
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("ControlOrMeta+a");
    await expect(page.getByRole("toolbar", { name: "Selected tasks" })).toContainText(/[1-9]\d* selected/);
    await page.keyboard.press("Escape");
  }

  // Tidy up: delete the tasks in one go, then the view.
  await page.getByRole("button", { name: "Select", exact: true }).click();
  for (const t of titles) await page.getByRole("button", { name: `Select ${t}` }).click();
  await page.getByRole("toolbar", { name: "Selected tasks" }).getByRole("button", { name: "Delete selected" }).click();
  await page.getByRole("button", { name: "Delete 3 tasks" }).click();
  for (const t of titles) await expect(page.getByRole("button", { name: `Open ${t}` })).toHaveCount(0);
  await page.getByRole("button", { name: "Delete view" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete view" }).click();
  await expect(page).toHaveURL(/\/tasks$/);
  await waitForSynced(page);
});

test("the notification centre shows what was sent, with unread marks", async ({ page }, info) => {
  test.skip(info.project.name === "phone", "The centre is the same on both; one run is enough");
  await page.goto("/notifications");
  await waitForSynced(page);
  // A test notification is recorded in the centre even with no device signed up.
  const res = await page.request.post("/api/push/test");
  test.skip(res.status() === 503, "Push isn't configured on this server");
  expect(res.status()).toBe(200);

  await page.reload();
  await expect(page.getByRole("button", { name: /Notifications are on/ }).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByLabel("Unread").first()).toBeVisible();
  await expect(page.getByRole("link", { name: /^Notifications, \d+ unread$/ })).toBeVisible();

  await page.getByRole("button", { name: "Mark all read" }).click();
  await expect(page.getByLabel("Unread")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Notifications", exact: true })).toBeVisible();

  // Opening one goes where it points.
  await page
    .getByRole("button", { name: /Notifications are on/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/settings/);

  // The service worker's endpoint for notification buttons needs a session and a known action.
  expect((await page.request.post("/api/notifications/action", { data: { action: "explode" } })).status()).toBe(400);
  expect((await page.request.post("/api/notifications/action", { data: { action: "open" } })).status()).toBe(200);
});
