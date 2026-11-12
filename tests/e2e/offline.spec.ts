import { expect, test, type Page } from "@playwright/test";

async function addTask(page: Page, title: string) {
  await page.getByLabel("New task").fill(title);
  await page.getByLabel("New task").press("Enter");
  await expect(page.getByText(title, { exact: true })).toBeVisible();
}

test("the sign-up page creates an account form", async ({ page }) => {
  await page.goto("/sign-up");
  await expect(
    page.getByRole("button", { name: "Create account" }),
  ).toBeVisible();
});

test("signed-out visitors are sent to sign in", async ({ page }) => {
  await page.goto("/today");
  await expect(page).toHaveURL(/\/sign-in$/);
});

test.describe("signed in", () => {
  test.use({ storageState: "test-results/.auth.json" });

  test("the installed app works offline and syncs when back online", async ({
    page,
    context,
  }) => {
    const run = Math.random().toString(36).slice(2, 7);
    const online = `Online task ${run}`;
    const offline = `Offline task ${run}`;
    await page.goto("/today");
    await addTask(page, online);

    // Wait for the service worker to control the page (precaches the app shell).
    await page.waitForFunction(async () => {
      const reg = await navigator.serviceWorker.ready;
      return Boolean(reg.active && navigator.serviceWorker.controller);
    });
    await page.waitForFunction(async () =>
      (await caches.keys()).some((k) => k.includes("precache")),
    );

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
    await expect(page.getByText(online, { exact: true })).toBeVisible();

    await addTask(page, offline);
    const onlineBox = page.getByRole("checkbox", {
      name: `Complete ${online}`,
    });
    await onlineBox.click();
    await expect(onlineBox).toHaveAttribute("aria-checked", "true");
    await expect(
      page
        .getByRole("status", { name: /waiting to sync/ })
        .filter({ visible: true }),
    ).toBeVisible();

    await context.setOffline(false);
    // When fully synced the indicator shows no dot, so check its label rather than its visibility.
    await expect(
      page.getByRole("status", { name: "All changes synced" }).first(),
    ).toBeAttached({ timeout: 15_000 });

    // A second device (fresh browser storage, same account) sees both changes.
    const cookies = await context.cookies();
    const other = await page.context().browser()!.newContext();
    await other.addCookies(cookies);
    const laptop = await other.newPage();
    await laptop.goto("/today");
    await expect(laptop.getByText(offline, { exact: true })).toBeVisible();
    await expect(
      laptop.getByRole("checkbox", { name: `Complete ${online}` }),
    ).toHaveAttribute("aria-checked", "true");
    await other.close();
  });
});
