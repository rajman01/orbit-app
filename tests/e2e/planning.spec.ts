import { expect, test, type Page } from "@playwright/test";

test.use({ storageState: "test-results/.auth.json" });

const run = () => Math.random().toString(36).slice(2, 7);

async function waitForSynced(page: Page) {
  // When fully synced the indicator shows no dot, so check its label rather than its visibility.
  await expect(page.getByRole("status", { name: "All changes synced" }).first()).toBeAttached({ timeout: 15_000 });
}

async function quickAdd(page: Page, text: string) {
  await page.locator("body").press("c");
  const input = page.getByRole("textbox", { name: "New task" });
  await input.fill(text);
  await input.press("Enter");
  await input.press("Escape");
}

test("create a goal, add a task with Quick Add, complete it, see progress", async ({ page, isMobile }) => {
  test.skip(isMobile, "Keyboard shortcuts are desktop-only");
  const r = run();
  await page.goto("/goals");
  await page.getByRole("button", { name: "New goal" }).click();
  await page.getByRole("textbox", { name: "Goal", exact: true }).fill(`Read 12 books ${r}`);
  await page.getByRole("textbox", { name: "First step (optional)" }).fill(`Pick the first book ${r}`);
  await page.getByRole("button", { name: "Create goal" }).click();

  await expect(page).toHaveURL(/\/goal\?id=/);
  await expect(page.getByRole("button", { name: `Open Pick the first book ${r}` })).toBeVisible();
  await expect(page.getByRole("img", { name: "0% complete" }).first()).toBeVisible();

  // Quick Add with a goal token links the task to this goal.
  await quickAdd(page, `Buy a bookmark ${r} +${r}`);
  await expect(page.getByRole("button", { name: `Open Buy a bookmark ${r}` })).toBeVisible();

  await page.getByRole("checkbox", { name: `Complete Pick the first book ${r}` }).click();
  await page.getByRole("checkbox", { name: `Complete Buy a bookmark ${r}` }).click();
  await expect(page.getByRole("img", { name: "100% complete" }).first()).toBeVisible();
});

test("inbox: capture, then triage into the backlog", async ({ page, isMobile }) => {
  test.skip(isMobile, "Keyboard triage is desktop-only");
  const r = run();
  await page.goto("/inbox");
  await quickAdd(page, `Look into index funds ${r}`);
  await expect(page.getByRole("button", { name: `Open Look into index funds ${r}` })).toBeVisible();

  await page.getByRole("button", { name: "Process inbox" }).click();
  // Process everything left in the inbox; earlier runs may have left items for this account.
  for (let i = 0; i < 20 && (await page.getByText(/to process|left/).count()); i++) {
    await page.keyboard.press("b");
    await page.waitForTimeout(150);
  }
  await expect(page.getByText("Inbox zero")).toBeVisible();

  await page.goto("/tasks");
  await expect(page.getByRole("button", { name: `Open Look into index funds ${r}` })).toBeVisible();
});

test("command palette finds a goal and opens it", async ({ page, isMobile }) => {
  test.skip(isMobile, "⌘K is desktop-only");
  const r = run();
  await page.goto("/goals");
  await page.getByRole("button", { name: "New goal" }).click();
  await page.getByRole("textbox", { name: "Goal", exact: true }).fill(`Palette goal ${r}`);
  await page.getByRole("button", { name: "Create goal" }).click();
  await expect(page).toHaveURL(/\/goal\?id=/);

  await page.goto("/today");
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByPlaceholder("Search or type a command…").fill(`palette goal ${r}`);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/goal\?id=/);
  await expect(page.getByRole("textbox", { name: "Goal title" })).toHaveValue(`Palette goal ${r}`);
});

test("goals created offline sync to another device", async ({ page, context, browser }) => {
  const r = run();
  // A new device goes offline before its first sync finishes. In a full run this happened by
  // chance (the shared account's first pull is big and the offline reload cut it off); hold the
  // first pull back so it happens every time.
  let holdPull = true;
  await page.route("**/api/sync/pull*", (route) => (holdPull ? undefined : route.fallback()));
  await page.goto("/goals");
  await page.waitForFunction(async () =>
    Boolean((await navigator.serviceWorker.ready).active && navigator.serviceWorker.controller),
  );
  await page.waitForFunction(async () => (await caches.keys()).some((k) => k.includes("precache")));

  await context.setOffline(true);
  await page.reload();
  holdPull = false;
  await page.getByRole("button", { name: "New goal" }).click();
  await page.getByRole("textbox", { name: "Goal", exact: true }).fill(`Offline goal ${r}`);
  await page.getByRole("button", { name: "Create goal" }).click();
  await expect(page.getByRole("textbox", { name: "Goal title" })).toHaveValue(`Offline goal ${r}`);

  // Coming back online syncs in place: no page reload, and no detour to onboarding once the
  // first sync brings the (already onboarded) settings down.
  await page.evaluate(() => ((window as unknown as { orbitSamePage: boolean }).orbitSamePage = true));
  await context.setOffline(false);
  await waitForSynced(page);
  // The bad redirect came within ~100ms of the first sync finishing; give it time to show.
  await page.waitForTimeout(1_000);
  await expect(page).toHaveURL(/\/goal\?id=/);
  await expect(page.getByRole("textbox", { name: "Goal title" })).toHaveValue(`Offline goal ${r}`);
  expect(await page.evaluate(() => (window as unknown as { orbitSamePage?: boolean }).orbitSamePage)).toBe(true);

  const other = await browser.newContext();
  await other.addCookies(await context.cookies());
  const laptop = await other.newPage();
  await laptop.goto("/goals");
  await expect(laptop.getByText(`Offline goal ${r}`)).toBeVisible({ timeout: 15_000 });
  await other.close();
});
