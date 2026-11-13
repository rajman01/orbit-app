import { expect, test } from "@playwright/test";
import { addToday, run, waitForSynced } from "./helpers";

test.use({ storageState: "test-results/.auth.json" });

/**
 * From the owner's first days of the Phase 1 trial: deleting a task, closing the task panel and
 * adding areas of your own all worked, but were hard to find.
 */

test("the task panel closes with ×, Escape, or a click outside, and its header stays in reach", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "The side panel is desktop-only (phones use a sheet)");
  const r = run();
  const title = `Panel task ${r}`;
  await page.goto("/today");
  await waitForSynced(page);
  await addToday(page, title);
  const panel = page.getByRole("complementary", { name: "Task details" });
  const open = () => page.getByRole("button", { name: `Open ${title}` }).click();

  await open();
  await panel.getByRole("button", { name: "Close" }).click();
  await expect(panel).toHaveCount(0);

  await open();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);

  await open();
  await page.getByRole("heading", { name: "Today", exact: true }).click();
  await expect(panel).toHaveCount(0);

  // Scrolled to the bottom of a long panel, close and delete are still visible.
  await open();
  await panel.getByRole("textbox", { name: "New subtask" }).fill("step");
  for (let i = 1; i <= 12; i++) {
    await panel.getByRole("textbox", { name: "New subtask" }).fill(`Step ${i}`);
    await panel.getByRole("textbox", { name: "New subtask" }).press("Enter");
  }
  await panel.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(panel.getByRole("button", { name: "Close" })).toBeInViewport();
  await expect(panel.getByRole("button", { name: "Delete task" })).toBeInViewport();
});

test("a task can be deleted from the panel, after confirming", async ({ page }) => {
  const r = run();
  const title = `Delete me ${r}`;
  await page.goto("/today");
  await waitForSynced(page);
  await addToday(page, title);

  await page.getByRole("button", { name: `Open ${title}` }).click();
  await page.getByRole("button", { name: "Delete task" }).click();
  const confirm = page.getByRole("dialog", { name: `Delete “${title}”?` });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Delete task" }).click();
  await expect(page.getByRole("button", { name: `Open ${title}` })).toHaveCount(0);
  await expect(page.getByText(`Deleted “${title}”`)).toBeVisible();
});

test("a task can be deleted by right-click or the Delete key", async ({ page, isMobile }) => {
  test.skip(isMobile, "Right-click and keys are desktop-only");
  const r = run();
  const [a, b] = [`Right-click me ${r}`, `Key me ${r}`];
  await page.goto("/today");
  await waitForSynced(page);
  await addToday(page, a);
  await addToday(page, b);

  await page.getByRole("button", { name: `Open ${a}` }).click({ button: "right" });
  await page.getByRole("menuitem", { name: /Delete task/ }).click();
  await page
    .getByRole("dialog", { name: `Delete “${a}”?` })
    .getByRole("button", { name: "Delete task" })
    .click();
  await expect(page.getByRole("button", { name: `Open ${a}` })).toHaveCount(0);

  await page.getByRole("button", { name: `Open ${b}` }).focus();
  await page.keyboard.press("Delete");
  await page
    .getByRole("dialog", { name: `Delete “${b}”?` })
    .getByRole("button", { name: "Delete task" })
    .click();
  await expect(page.getByRole("button", { name: `Open ${b}` })).toHaveCount(0);
});

test("an area of your own can be added from the sidebar or the More menu", async ({ page, isMobile }) => {
  const r = run();
  const name = `Side project ${r}`;
  await page.goto("/today");
  if (isMobile) {
    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("button", { name: "New area" }).click();
  } else {
    await page.getByRole("navigation", { name: "Areas" }).getByRole("button", { name: "New area" }).click();
  }
  const dialog = page.getByRole("dialog", { name: "New area" });
  await dialog.getByRole("textbox").first().fill(name);
  await dialog.getByRole("button", { name: /Create|Add|Save/ }).click();
  await expect(dialog).toHaveCount(0);
  await page.goto("/areas");
  await expect(page.getByRole("link", { name: new RegExp(`^${name}`) }).first()).toBeVisible();
});

test("onboarding lets you add areas of your own", async ({ browser, baseURL }, info) => {
  test.skip(info.project.name === "phone", "Signs up a new account; once is enough");
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  const r = run();
  const res = await page.request.post("/api/auth/sign-up/email", {
    headers: { Origin: baseURL! },
    data: { name: "Onboard Tester", email: `onboard-${Date.now()}-${r}@orbit.test`, password: `pw-${r}-A1xyz` },
  });
  expect(res.ok()).toBe(true);

  await page.goto("/welcome");
  await page.getByRole("textbox", { name: "Add your own area" }).fill(`Faith ${r}`);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("button", { name: `Remove Faith ${r}` })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page).toHaveURL(/\/today/);
  await page.goto("/areas");
  await expect(page.getByRole("link", { name: new RegExp(`^Faith ${r}`) }).first()).toBeVisible();
  await context.close();
});
