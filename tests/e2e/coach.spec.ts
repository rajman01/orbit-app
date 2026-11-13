import { expect, test } from "@playwright/test";
import { addToday, run, waitForSynced } from "./helpers";

test.use({ storageState: "test-results/.auth.json" });

/**
 * Phase 2A.1: the coach. The test server answers with a scripted fake model (COACH_FAKE=1):
 * it echoes "You said: …", calls a tool when asked with [tool:name {json}], then replies "Done: …".
 */

test("the coach panel opens with ⌘J, streams a reply, and looks things up on the device", async ({
  page,
  context,
  browser,
}, info) => {
  test.skip(info.project.name === "phone", "The panel and ⌘J are desktop; the phone test uses the page");
  const r = run();
  const title = `Coach lookup ${r}`;
  await page.goto("/today");
  await waitForSynced(page);
  await addToday(page, title);

  await page.keyboard.press("ControlOrMeta+j");
  const panel = page.getByRole("dialog", { name: "Coach" });
  await expect(panel).toBeVisible();
  const box = panel.getByRole("textbox", { name: "Message the coach" });
  await box.fill(`hello ${r}`);
  await box.press("Enter");
  await expect(panel.getByText(`You said: hello ${r}`)).toBeVisible();

  // A tool call runs here, against this device's data, and the result goes back to the model.
  await box.fill(`find it [tool:search {"query":"lookup ${r}"}]`);
  await box.press("Enter");
  await expect(panel.getByText(`Searched for “lookup ${r}”`)).toBeVisible();
  await expect(panel.getByText(new RegExp(`Done: .*${title}`))).toBeVisible();
  // The context and tool results are for the model only.
  await expect(panel.getByText("Now:")).toHaveCount(0);

  // Escape closes it; the page underneath was usable the whole time.
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await waitForSynced(page);

  // The conversation syncs to another device.
  const other = await browser.newContext();
  await other.addCookies(await context.cookies());
  const laptop = await other.newPage();
  await laptop.goto("/coach");
  await laptop.getByRole("button", { name: new RegExp(`hello ${r}`) }).click({ timeout: 20_000 });
  await expect(laptop.getByText(`You said: hello ${r}`)).toBeVisible();
  await expect(laptop.getByText(new RegExp(`Done: .*${title}`))).toBeVisible();
  await other.close();
});

test("the coach page lists conversations and works on a phone", async ({ page }) => {
  const r = run();
  await page.goto("/coach?new=1");
  const box = page.getByRole("textbox", { name: "Message the coach" });
  await box.fill(`page chat ${r}`);
  await box.press("Enter");
  await expect(page.getByText(`You said: page chat ${r}`)).toBeVisible();
  await expect(page).toHaveURL(/\/coach\?t=/);

  if (test.info().project.name === "phone") {
    await page.getByRole("button", { name: "All chats" }).click();
  }
  await expect(page.getByRole("navigation", { name: "Conversations" }).getByText(`page chat ${r}`)).toBeVisible();
});

test("offline, the coach says it needs a connection", async ({ page, context }) => {
  await page.goto("/coach?new=1");
  await expect(page.getByRole("textbox", { name: "Message the coach" })).toBeVisible();
  await context.setOffline(true);
  const box = page.getByRole("textbox", { name: "Message the coach" });
  await box.fill("are you there?");
  await box.press("Enter");
  await expect(page.getByRole("alert").filter({ hasText: "You're offline" })).toBeVisible();
  await context.setOffline(false);
});
