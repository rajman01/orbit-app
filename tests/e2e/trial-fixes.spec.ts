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

/** Icon-only buttons must show their icon (they once rendered empty on desktop: no room left by padding). */
test("icon-only buttons show their icons", async ({ page }) => {
  const r = run();
  const title = `Icons ${r}`;
  await page.goto("/today");
  await waitForSynced(page);
  await addToday(page, title);
  await page.getByRole("button", { name: `Open ${title}` }).click();
  await expect(page.getByRole("button", { name: "Delete task" })).toBeVisible();

  for (const path of [null, "/habits", "/areas"]) {
    if (path) await page.goto(path);
    const empty = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLButtonElement>("button[aria-label]")]
        .filter((b) => b.offsetParent !== null && !b.textContent?.trim() && b.querySelector("svg"))
        .filter((b) => b.querySelector("svg")!.getBoundingClientRect().width < 8)
        .map((b) => b.getAttribute("aria-label")),
    );
    expect(empty, `icon buttons with no visible icon on ${path ?? "/today"}`).toEqual([]);
  }
});

test("board cards have the right-click menu too", async ({ page, isMobile }) => {
  test.skip(isMobile, "Right-click is desktop-only");
  const r = run();
  const title = `Board card ${r}`;
  await page.goto("/today");
  await waitForSynced(page);
  await addToday(page, title);
  await page.goto("/tasks");
  await page.getByRole("radio", { name: "Board" }).click();
  const card = page.getByLabel(`Open ${title}`, { exact: true });
  await card.click({ button: "right" });
  await page.getByRole("menuitem", { name: /Delete task/ }).click();
  await page
    .getByRole("dialog", { name: `Delete “${title}”?` })
    .getByRole("button", { name: "Delete task" })
    .click();
  await expect(card).toHaveCount(0);
});

test("closing a picker inside the task panel keeps the panel open", async ({ page, isMobile }) => {
  test.skip(isMobile, "The side panel is desktop-only");
  const r = run();
  const title = `Picker ${r}`;
  await page.goto("/today");
  await waitForSynced(page);
  await addToday(page, title);
  const panel = page.getByRole("complementary", { name: "Task details" });
  await page.getByRole("button", { name: `Open ${title}` }).click();
  const box = (await panel.boundingBox())!;
  await panel.getByRole("button", { name: "Priority" }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  // A click elsewhere in the panel (near its bottom left) closes the picker only.
  await page.mouse.click(box.x + 40, box.y + box.height - 40);
  await expect(page.getByRole("menu")).toHaveCount(0);
  // Wait past the slide-out (it would still look open mid-animation), then check it stayed.
  await page.waitForTimeout(800);
  await expect(panel).toBeVisible();
  await expect(panel).toBeInViewport({ ratio: 0.95 });
  // The next click outside the panel closes the panel.
  await page.getByRole("heading", { name: "Today", exact: true }).click();
  await expect(panel).toHaveCount(0);
});

test("a dragged board card stays under the pointer", async ({ page, isMobile }) => {
  test.skip(isMobile, "Mouse drag; phones use long-press");
  const r = run();
  const title = `Drag me ${r}`;
  await page.goto("/today");
  await waitForSynced(page);
  await addToday(page, title);
  await page.goto("/tasks");
  await page.getByRole("radio", { name: "Board" }).click();
  const card = page.getByLabel(`Open ${title}`, { exact: true });
  // Earlier tests fill the board: bring the card into view before grabbing it.
  await card.scrollIntoViewIfNeeded();
  const box = (await card.boundingBox())!;
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  const end = { x: start.x + 160, y: start.y + 40 };
  await page.mouse.move(start.x + 20, start.y + 5, { steps: 3 });
  await page.mouse.move(end.x, end.y, { steps: 10 });
  await expect(page.locator(`[aria-label="Open ${title}"]`)).toHaveCount(2); // the card and its drag preview
  const overlay = await page.evaluate(
    ({ label }) => {
      const lifted = [...document.querySelectorAll(`[aria-label="${label}"]`)].find((el) => {
        for (let n: Element | null = el; n; n = n.parentElement)
          if (getComputedStyle(n).position === "fixed") return true;
        return false;
      });
      const r = lifted?.getBoundingClientRect();
      return r ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom } : null;
    },
    { label: `Open ${title}` },
  );
  await page.mouse.up();
  expect(overlay).not.toBeNull();
  expect(end.x).toBeGreaterThanOrEqual(overlay!.left);
  expect(end.x).toBeLessThanOrEqual(overlay!.right);
  expect(end.y).toBeGreaterThanOrEqual(overlay!.top);
  expect(end.y).toBeLessThanOrEqual(overlay!.bottom);
});

test("a long subtask wraps instead of being cut off", async ({ page }) => {
  const r = run();
  const title = `Subtask parent ${r}`;
  const long = `Email the recruiter about the senior role, attach the updated CV and the portfolio link, and ask about the timeline ${r}`;
  await page.goto("/today");
  await waitForSynced(page);
  await addToday(page, title);
  await page.getByRole("button", { name: `Open ${title}` }).click();
  await page.getByRole("textbox", { name: "New subtask" }).fill(long);
  await page.getByRole("textbox", { name: "New subtask" }).press("Enter");
  const text = page.getByRole("region", { name: "Subtasks" }).getByText(long, { exact: true });
  await expect(text).toBeVisible();
  const box = await text.evaluate((el) => ({
    clipped: el.scrollWidth > el.clientWidth + 1,
    lines: Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)),
  }));
  expect(box.clipped).toBe(false);
  expect(box.lines).toBeGreaterThan(1);
  await page
    .getByRole("region", { name: "Subtasks" })
    .screenshot({ path: `test-results/long-subtask-${test.info().project.name}.png` });
});

test("a focus session shows on every device and can be controlled from any of them", async ({
  page,
  context,
  browser,
}, info) => {
  test.skip(info.project.name === "phone", "Uses two browser contexts; once is enough");
  test.setTimeout(120_000);
  const r = run();
  const title = `Shared focus ${r}`;
  await page.goto("/today");
  await waitForSynced(page);
  await addToday(page, title);
  await page.getByRole("button", { name: `Open ${title}` }).click();
  await page.getByRole("button", { name: "Start focus" }).click();
  const focusA = page.getByRole("dialog", { name: `Focus: ${title}` });
  await expect(focusA).toBeVisible();

  // Minimised, the task offers Continue, not Start.
  await focusA.getByRole("button", { name: "Minimise" }).click();
  await expect(focusA).toHaveCount(0);
  await expect(page.getByRole("button", { name: `Continue ${title}` })).toBeVisible();
  await expect(page.getByRole("button", { name: `Start ${title}` })).toHaveCount(0);
  await expect(page.getByRole("button", { name: `Continue: ${title}` })).toBeVisible();
  await waitForSynced(page);

  // The laptop sees it too, and pauses it.
  const other = await browser.newContext();
  await other.addCookies(await context.cookies());
  const laptop = await other.newPage();
  await laptop.goto("/today");
  await laptop.getByRole("button", { name: `Continue ${title}` }).click({ timeout: 20_000 });
  const focusB = laptop.getByRole("dialog", { name: `Focus: ${title}` });
  await focusB.getByRole("button", { name: "Pause" }).click();
  await expect(focusB.getByText("Paused")).toBeVisible();

  // Within a few seconds the first device shows it paused.
  await page.getByRole("button", { name: `Continue ${title}` }).click();
  await expect(focusA.getByText("Paused")).toBeVisible({ timeout: 15_000 });

  // Ending it on the first device closes it on the laptop.
  await focusA.getByRole("button", { name: "End" }).click();
  await focusA.getByRole("button", { name: "Just stop" }).click();
  await expect(focusA).toHaveCount(0);
  await expect(focusB).toHaveCount(0, { timeout: 15_000 });
  await expect(laptop.getByRole("button", { name: `Continue ${title}` })).toHaveCount(0);
  await other.close();
});

test("focus mode fits a phone screen: controls stay inside it and notes stay readable", async ({ page }, info) => {
  const r = run();
  const title = `Apply for a masters programme ${r}`;
  await page.goto("/today");
  await waitForSynced(page);
  await addToday(page, title);
  await page.getByRole("button", { name: `Open ${title}` }).click();
  await page.getByRole("button", { name: "Start focus" }).click();
  const focus = page.getByRole("dialog", { name: `Focus: ${title}` });
  await expect(focus).toBeVisible();
  await focus.getByRole("textbox").fill(Array.from({ length: 12 }, (_, i) => `Note line ${i + 1}`).join("\n\n"));

  // Every control is fully on screen, on one line.
  const width = page.viewportSize()!.width;
  for (const name of ["Pause", "+5 min", "Done", "End"]) {
    const box = (await focus.getByRole("button", { name, exact: true }).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
  }
  await page.waitForTimeout(800);
  await page.screenshot({ path: `test-results/focus-layout-${info.project.name}.png` });
  await focus.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `test-results/focus-layout-${info.project.name}-end.png` });
  // The controls stay pinned to the bottom of the screen while the notes scroll.
  const bar = (await focus.getByRole("button", { name: "End", exact: true }).boundingBox())!;
  expect(page.viewportSize()!.height - (bar.y + bar.height)).toBeLessThan(80);
  await focus.getByRole("button", { name: "End", exact: true }).click();
  await focus.getByRole("button", { name: "Just stop" }).click();
  await expect(focus).toHaveCount(0);
});

test("changing a setting on a new device before its first sync keeps the account's settings", async ({
  page,
  context,
  browser,
}, info) => {
  test.skip(info.project.name === "phone", "Uses a second browser context; once is enough");
  await page.goto("/today");
  await waitForSynced(page);

  // A brand-new device: open Settings and change something straight away, before anything has synced.
  const fresh = await browser.newContext();
  await fresh.addCookies(await context.cookies());
  const phone = await fresh.newPage();
  await phone.goto("/settings");
  await phone
    .getByRole("radiogroup", { name: "What the coach may do" })
    .getByRole("radio", { name: "Act and tell me" })
    .click();
  await waitForSynced(phone);
  await fresh.close();

  // The account is still set up: nobody is sent back to onboarding.
  await page.reload();
  await waitForSynced(page);
  await page.goto("/today");
  await page.waitForTimeout(1500);
  await expect(page).toHaveURL(/\/today/);
});

test("on a phone, the tab bar hides while the keyboard is up instead of riding on top of it", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "phone", "Only phones have an on-screen keyboard");
  await page.goto("/today");
  const tabBar = page.locator("nav[data-hide-on-keyboard]");
  await expect(tabBar).toBeVisible();
  const size = page.viewportSize()!;

  // Typing with the keyboard up: a text field has focus and the visible area shrinks.
  await page.getByRole("textbox", { name: "New task" }).focus();
  await page.setViewportSize({ width: size.width, height: Math.round(size.height * 0.55) });
  await expect(tabBar).toBeHidden();

  // Keyboard down again.
  await page.setViewportSize(size);
  await page.getByRole("textbox", { name: "New task" }).blur();
  await expect(tabBar).toBeVisible();

  // Focus alone (e.g. a hardware keyboard, screen not shrunk) leaves the bar where it is.
  await page.getByRole("textbox", { name: "New task" }).focus();
  await page.waitForTimeout(300);
  await expect(tabBar).toBeVisible();
});
