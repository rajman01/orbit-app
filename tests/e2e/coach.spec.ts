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
  // Two model calls (the tool call, then the answer): allow for a busy test server.
  await expect(panel.getByText(`Searched for “lookup ${r}”`)).toBeVisible({ timeout: 15_000 });
  await expect(panel.getByText(new RegExp(`Done: .*${title}`))).toBeVisible({ timeout: 15_000 });
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

/** Sends one message on the /coach page and waits for the fake model's reply. */
async function ask(page: import("@playwright/test").Page, text: string) {
  const box = page.getByRole("textbox", { name: "Message the coach" });
  await box.fill(text);
  await box.press("Enter");
  await expect(page.getByText(/^(Done:|You said:)/).last()).toBeVisible({ timeout: 15_000 });
}

test("the coach creates a task: it shows as a card with View and Undo, and Undo takes it back", async ({ page }) => {
  const r = run();
  const title = `Coach made ${r}`;
  await page.goto("/coach?new=1");
  await ask(page, `add it [tool:create_task {"title":"${title}","status":"todo"}]`);
  const card = page.locator("[data-ai-action]").filter({ hasText: `Create task “${title}”` });
  await expect(card).toHaveAttribute("data-ai-action", "applied");

  // It's a real task, marked as the coach's work.
  await card.getByRole("button", { name: "View" }).click();
  await expect(page.getByRole("textbox", { name: "Title", exact: true })).toHaveValue(title);
  await page.keyboard.press("Escape");
  await page.goto("/tasks");
  const row = page.getByRole("button", { name: `Open ${title}` });
  await expect(row).toBeVisible();
  await expect(row.getByRole("img", { name: "Made by the coach" })).toBeVisible();

  // Undo from Settings → AI activity.
  await page.goto("/settings");
  const activity = page.locator("[data-ai-action]").filter({ hasText: `Create task “${title}”` });
  await activity.getByRole("button", { name: `Undo: Create task “${title}”` }).click();
  await expect(activity).toHaveAttribute("data-ai-action", "undone");
  await page.goto("/tasks");
  await expect(page.getByRole("button", { name: `Open ${title}` })).toHaveCount(0);
});

test("in Suggest only, the coach's change waits for Accept", async ({ page }, info) => {
  test.skip(info.project.name === "phone", "One run is enough: it changes a shared setting");
  const r = run();
  const title = `Suggested goal ${r}`;
  await page.goto("/settings");
  const autonomy = page.getByRole("radiogroup", { name: "What the coach may do" });
  await autonomy.getByRole("radio", { name: "Suggest only" }).click();
  await expect(autonomy.getByRole("radio", { name: "Suggest only" })).toBeChecked();
  try {
    await page.goto("/coach?new=1");
    await ask(page, `[tool:create_goal {"title":"${title}"}]`);
    await expect(page.getByText(/Done: Not done yet/)).toBeVisible();
    const card = page.locator("[data-ai-action]").filter({ hasText: `Create goal “${title}”` });
    await expect(card).toHaveAttribute("data-ai-action", "proposed");
    await page.goto("/goals");
    await expect(page.getByText(title)).toHaveCount(0);

    await page.goto("/settings");
    await page.getByRole("button", { name: `Accept: Create goal “${title}”` }).click();
    await expect(page.locator("[data-ai-action]").filter({ hasText: `Create goal “${title}”` })).toHaveAttribute(
      "data-ai-action",
      "applied",
    );
    await page.goto("/goals");
    await expect(page.getByRole("heading", { name: new RegExp(title) })).toBeVisible();
  } finally {
    await page.goto("/settings");
    const act = page
      .getByRole("radiogroup", { name: "What the coach may do" })
      .getByRole("radio", { name: "Act and tell me" });
    await act.click();
    // Saved on this device first (then queued), and only then synced: other tests share this account.
    await expect(act).toBeChecked();
    await waitForSynced(page);
  }
});

test("a plan is previewed, edited, applied as a whole, and undone as a whole", async ({ page }) => {
  const r = run();
  const plan = {
    goal: { title: `Run a 10k ${r}` },
    milestones: [
      {
        title: `Run 5k without stopping ${r}`,
        tasks: [{ title: `Buy running shoes ${r}`, effort: 1 }, { title: `First 20-minute run ${r}` }],
      },
    ],
  };
  await page.goto("/coach?new=1");
  await ask(page, `plan it [tool:propose_plan ${JSON.stringify(plan)}]`);
  const preview = page.getByRole("region", { name: "Proposed plan" });
  await expect(preview).toBeVisible();

  // Edit before applying: rename the goal, drop a task.
  await preview.getByRole("textbox", { name: "Goal" }).fill(`Run my first 10k ${r}`);
  await preview.getByRole("button", { name: `Remove task First 20-minute run ${r}` }).click();
  await preview.getByRole("button", { name: "Apply plan" }).click();
  const card = page
    .locator("[data-ai-action]")
    .filter({ hasText: `Plan for “Run my first 10k ${r}”: 1 milestone, 1 task` });
  await expect(card).toHaveAttribute("data-ai-action", "applied");

  await card.getByRole("link", { name: "View" }).click();
  await expect(page.getByRole("textbox", { name: "Goal title" })).toHaveValue(`Run my first 10k ${r}`);
  await expect(page.getByRole("button", { name: `Open Buy running shoes ${r}` })).toBeVisible();
  await expect(page.getByText(`First 20-minute run ${r}`).filter({ visible: true })).toHaveCount(0);

  // One Undo takes the whole plan back.
  await page.goto("/settings");
  await page.getByRole("button", { name: `Undo: Plan for “Run my first 10k ${r}”: 1 milestone, 1 task` }).click();
  await expect(
    page.locator("[data-ai-action]").filter({ hasText: `Plan for “Run my first 10k ${r}”` }),
  ).toHaveAttribute("data-ai-action", "undone");
  await page.goto("/goals");
  await expect(page.getByText(`Run my first 10k ${r}`).filter({ visible: true })).toHaveCount(0);
});

test("Break down in the task panel asks the coach about that task", async ({ page }) => {
  const r = run();
  const title = `Do my taxes ${r}`;
  await page.goto("/today");
  await waitForSynced(page);
  await addToday(page, title);
  await page.getByRole("button", { name: `Open ${title}` }).click();
  await page.getByRole("button", { name: "Break down with the coach" }).click();
  const coach = page.getByRole("dialog", { name: "Coach" });
  await expect(coach.getByText(new RegExp(`You said: Break down .*${title}`))).toBeVisible({ timeout: 15_000 });
});

test("a brain dump becomes tasks after review", async ({ page }) => {
  const r = run();
  await page.goto("/inbox");
  await page.getByRole("button", { name: /Brain dump/ }).click();
  const dump = page.getByRole("region", { name: "Brain dump" });
  await dump.getByRole("textbox").fill(`Call the landlord ${r}\nBook dentist ${r}\nIdeas for the party ${r}`);
  await dump.getByRole("button", { name: "Turn into tasks" }).click();
  await expect(dump.getByText("3 tasks found")).toBeVisible({ timeout: 15_000 });
  await dump.getByRole("checkbox", { name: `Keep Ideas for the party ${r}` }).click();
  await dump.getByRole("button", { name: "Add 2 to Orbit" }).click();
  await expect(page.getByRole("button", { name: `Open Call the landlord ${r}` })).toBeVisible();
  await expect(page.getByRole("button", { name: `Open Book dentist ${r}` })).toBeVisible();
  await expect(page.getByRole("button", { name: `Open Ideas for the party ${r}` })).toHaveCount(0);
});

test("long text in quick add can go to the brain dump", async ({ page }) => {
  const r = run();
  await page.goto("/upcoming");
  await waitForSynced(page);
  await page.keyboard.press("c");
  const quickAdd = page.getByRole("dialog", { name: "New task" });
  await expect(quickAdd).toBeVisible();
  const input = quickAdd.getByRole("textbox", { name: "New task" });
  const text = `email Sam about the trip ${r}, then renew passport and book the cat sitter`;
  await input.fill(text);
  await page.getByRole("button", { name: /Let the coach sort it/ }).click();
  await expect(page).toHaveURL(/\/inbox\?dump=/);
  await expect(page.getByRole("region", { name: "Brain dump" }).getByRole("textbox")).toHaveValue(text);
});

test("what the coach remembers can be added to, edited and forgotten", async ({ page }) => {
  const r = run();
  await page.goto("/settings");
  const add = page.getByRole("textbox", { name: "Tell the coach something about you" });
  await add.fill(`I train on Tuesdays ${r}`);
  await add.press("Enter");
  await expect(page.getByRole("button", { name: `Forget: I train on Tuesdays ${r}` })).toBeVisible();
  await page.getByRole("button", { name: `Forget: I train on Tuesdays ${r}` }).click();
  await expect(page.getByRole("button", { name: `Forget: I train on Tuesdays ${r}` })).toHaveCount(0);
});

test("a ritual can be run with the coach instead", async ({ page }, info) => {
  test.skip(info.project.name === "phone", "The same button on both; once is enough");
  await page.goto("/today");
  await page
    .getByRole("button", { name: /Plan your day/ })
    .first()
    .click();
  await page.getByRole("button", { name: "With coach" }).click();
  await expect(
    page.getByRole("dialog", { name: "Coach" }).getByText(/You said: Let's do my Daily Plan together/),
  ).toBeVisible({ timeout: 15_000 });
});

test("on a phone, the chat box sits just above the tab bar, and the heading stays put while typing", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "phone", "Only phones have an on-screen keyboard");
  await page.goto("/coach?new=1");
  const box = page.getByRole("textbox", { name: "Message the coach" });
  const form = page.locator("form").filter({ has: box });
  const heading = page.getByRole("heading", { name: "New chat" });
  const tabBar = page.locator("nav[data-hide-on-keyboard]");
  await expect(box).toBeVisible();
  // No extra gap: the tab bar already leaves room for the home indicator.
  const gap = (await tabBar.boundingBox())!.y - ((await form.boundingBox())!.y + (await form.boundingBox())!.height);
  expect(gap).toBeLessThan(32);

  // Keyboard up: the visible area shrinks. The heading stays at the top, the box right above the keyboard.
  const size = page.viewportSize()!;
  await box.focus();
  const visible = Math.round(size.height * 0.55);
  await page.setViewportSize({ width: size.width, height: visible });
  await expect(tabBar).toBeHidden();
  const h = (await heading.boundingBox())!;
  expect(h.y).toBeGreaterThanOrEqual(0);
  expect(h.y).toBeLessThan(80);
  const f = (await form.boundingBox())!;
  expect(f.y + f.height).toBeLessThanOrEqual(visible + 1);
  expect(f.y + f.height).toBeGreaterThan(visible - 24);
  await page.setViewportSize(size);
});
