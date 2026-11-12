import { expect, test, type Page } from "@playwright/test";

async function addTask(page: Page, title: string) {
  await page.getByRole("textbox", { name: "New task" }).fill(title);
  await page.getByRole("textbox", { name: "New task" }).press("Enter");
  await expect(page.getByText(title, { exact: true })).toBeVisible();
}

test("the sign-up page creates an account form", async ({ page }) => {
  await page.goto("/sign-up");
  await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
});

test("signed-out visitors are sent to sign in", async ({ page }) => {
  await page.goto("/today");
  await expect(page).toHaveURL(/\/sign-in$/);
});

test.describe("signed in", () => {
  test.use({ storageState: "test-results/.auth.json" });

  test("the installed app works offline and syncs when back online", async ({ page, context }) => {
    const run = Math.random().toString(36).slice(2, 7);
    const online = `Online task ${run}`;
    const offline = `Offline task ${run}`;
    const phoneLog: string[] = [];
    page.on("console", (m) => m.text().startsWith("[sync]") && phoneLog.push(m.text()));
    await context.addInitScript(() => localStorage.setItem("orbit:debug-sync", "1"));
    await page.goto("/today");
    await addTask(page, online);

    // Wait for the service worker to control the page (precaches the app shell).
    await page.waitForFunction(async () => {
      const reg = await navigator.serviceWorker.ready;
      return Boolean(reg.active && navigator.serviceWorker.controller);
    });
    await page.waitForFunction(async () => (await caches.keys()).some((k) => k.includes("precache")));

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
    await expect(page.getByText(online, { exact: true })).toBeVisible();

    await addTask(page, offline);
    const onlineBox = page.getByRole("checkbox", {
      name: `Complete ${online}`,
    });
    await onlineBox.click();
    await expect(onlineBox).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("status", { name: /waiting to sync/ }).filter({ visible: true })).toBeVisible();

    await context.setOffline(false);
    // When fully synced the indicator shows no dot, so check its label rather than its visibility.
    await expect(page.getByRole("status", { name: "All changes synced" }).first()).toBeAttached({ timeout: 15_000 });

    // A second device (fresh browser storage, same account) sees both changes.
    const cookies = await context.cookies();
    const other = await page.context().browser()!.newContext();
    await other.addCookies(cookies);
    const laptop = await other.newPage();
    const laptopLog: string[] = [];
    laptop.on("console", (m) => m.text().startsWith("[sync]") && laptopLog.push(m.text()));
    await other.addInitScript(() => localStorage.setItem("orbit:debug-sync", "1"));
    await laptop.goto("/today");
    await expect(laptop.getByText(offline, { exact: true })).toBeVisible();
    try {
      await expect(laptop.getByRole("checkbox", { name: `Complete ${online}` })).toHaveAttribute(
        "aria-checked",
        "true",
      );
    } catch (err) {
      // Diagnostics for an intermittent failure: where did the completion get lost?
      const readDb = (title: string) =>
        new Promise((resolve) => {
          const open = indexedDB.open(
            Object.keys(localStorage).length ? `orbit-${JSON.parse(localStorage.getItem("orbit:user")!).id}` : "x",
          );
          open.onsuccess = () => {
            const db = open.result;
            const tx = db.transaction(["tasks", "outbox", "meta"]);
            const all = (s: string) =>
              new Promise<unknown[]>((r) => {
                const q = tx.objectStore(s).getAll();
                q.onsuccess = () => r(q.result);
              });
            Promise.all([all("tasks"), all("outbox"), all("meta")]).then(([tasks, outbox, meta]) =>
              resolve({ task: (tasks as { title: string }[]).find((t) => t.title === title), outbox, meta }),
            );
          };
        });
      const server = await laptop.evaluate(async (title) => {
        const r = await fetch("/api/sync/pull?since=0", { cache: "no-store" });
        const j = await r.json();
        return j.changes.find((c: { doc: { title: string } }) => c.doc.title === title)?.doc;
      }, online);
      console.log("DIAG server", JSON.stringify(server));
      console.log("DIAG laptop", JSON.stringify(await laptop.evaluate(readDb, online)));
      console.log("DIAG phone", JSON.stringify(await page.evaluate(readDb, online)));
      console.log("DIAG phone log\n" + phoneLog.join("\n"));
      console.log("DIAG online id", server?.id);
      console.log("DIAG laptop log\n" + laptopLog.join("\n"));
      throw err;
    }
    await other.close();
  });
});
