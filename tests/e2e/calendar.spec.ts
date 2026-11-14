import { expect, test } from "@playwright/test";
import { addToday, run, waitForSynced } from "./helpers";

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

interface FakeEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
}

/**
 * Phase 2B.2: time blocks. A block made in Orbit appears in the "Orbit" calendar in (fake) Google;
 * dragging it on the Calendar page moves it there; moving it in Google moves it in Orbit.
 */
test("block time for a task, drag it on the calendar, and see moves in Google come back", async ({ page }, info) => {
  test.skip(info.project.name === "phone", "Dragging with a mouse; the phone flow is checked below");
  const orbitEvents = async () =>
    ((await (await page.request.get("/api/calendar/fake")).json()).events ?? []) as FakeEvent[];
  const today = new Date().toISOString().slice(0, 10); // the test account's timezone is UTC
  const title = `Write the essay ${run()}`;

  // Make sure Google is connected in this server run (connecting again is harmless).
  await page.goto("/settings");
  await page.getByRole("link", { name: /Connect (another )?Google/ }).click();
  await expect(page.getByText(/Google Calendar connected/)).toBeVisible();

  await page.goto("/today");
  await addToday(page, title);
  await page.getByRole("button", { name: `Open ${title}` }).click();
  await page.getByRole("region", { name: "Time blocks" }).getByRole("button", { name: "Block time" }).click();
  const dialog = page.getByRole("dialog", { name: "Block time" });
  await dialog.getByLabel("Day").fill(today);
  await dialog.getByLabel("Starts").fill("10:00");
  await dialog.getByRole("radio", { name: "1h" }).click();
  await dialog.getByRole("button", { name: "Block time" }).click();
  await expect(page.getByRole("region", { name: "Time blocks" }).getByText("10:00 AM – 11:00 AM")).toBeVisible();

  // The server writes it to the Orbit calendar.
  await expect
    .poll(async () => (await orbitEvents()).find((e) => e.summary === title)?.start, { timeout: 20_000 })
    .toBe(`${today}T10:00:00.000Z`);

  // Drag it two hours later on the week view.
  await page.keyboard.press("Escape");
  await page.goto("/calendar");
  const block = page.getByRole("button", { name: new RegExp(`^Time block: ${title}`) });
  await block.scrollIntoViewIfNeeded();
  const box = (await block.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 10);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + box.width / 2, box.y + 10 + i * 13);
  await page.mouse.up();
  await expect(block).toHaveAccessibleName(`Time block: ${title}, 12:00 PM to 1:00 PM`);
  await expect
    .poll(async () => (await orbitEvents()).find((e) => e.summary === title)?.start, { timeout: 20_000 })
    .toBe(`${today}T12:00:00.000Z`);

  // Moved in Google Calendar: it moves here too.
  const event = (await orbitEvents()).find((e) => e.summary === title)!;
  const moved = await page.request.post("/api/calendar/fake", {
    data: { eventId: event.id, start: `${today}T15:00:00.000Z`, end: `${today}T16:30:00.000Z` },
  });
  expect(moved.ok()).toBe(true);
  await expect(block).toHaveAccessibleName(`Time block: ${title}, 3:00 PM to 4:30 PM`, { timeout: 30_000 });

  // Tap it to change or delete it; deleting takes it off the calendar.
  await block.click();
  await page.getByRole("dialog", { name: "Time block" }).getByRole("button", { name: "Delete block" }).click();
  await expect(block).toHaveCount(0);
  await expect
    .poll(async () => (await orbitEvents()).some((e) => e.summary === title), { timeout: 20_000 })
    .toBe(false);
  await waitForSynced(page);
});

test("on a phone, the calendar shows one day; tap an empty time to block it", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "Phone layout");
  const title = `Phone block ${run()}`;
  await page.goto("/calendar");
  await expect(page.getByRole("radio", { name: "Day" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("tablist", { name: "Days" })).toBeVisible();

  const day = page.locator('[role="group"][aria-label]').first();
  await day.evaluate((el) => {
    el.closest(".overflow-y-auto")!.scrollTop = 13 * 52;
  });
  await day.click({ position: { x: 40, y: 14 * 52 + 10 } });
  const dialog = page.getByRole("dialog", { name: "Block time" });
  await dialog.getByPlaceholder(/Find a task/).fill(title);
  await expect(dialog.getByLabel("Starts")).toHaveValue("14:00");
  await dialog.getByRole("button", { name: "Block time" }).click();
  const block = page.getByRole("button", { name: new RegExp(`^Time block: ${title}`) });
  await expect(block).toBeVisible();
  await block.click();
  await page.getByRole("dialog", { name: "Time block" }).getByRole("button", { name: "Delete block" }).click();
  await expect(block).toHaveCount(0);
  await waitForSynced(page);
});

/** Phase 2B.3: iCloud with an app-specific password (fake iCloud on the test server). */
test("connect iCloud with an app-specific password and see its events on Today", async ({ page }, info) => {
  test.skip(info.project.name === "phone", "One account per run");
  const appleId = `e2e-${run()}@icloud.example`;
  await page.goto("/settings");
  await page.getByRole("button", { name: /Connect (another )?iCloud/ }).click();
  const dialog = page.getByRole("dialog", { name: "Connect iCloud Calendar" });
  await expect(dialog.getByRole("link", { name: "account.apple.com" })).toBeVisible();
  await dialog.getByLabel("Apple ID").fill(appleId);
  await dialog.getByLabel("App-specific password").fill("my-apple-id-password");
  await dialog.getByRole("button", { name: "Connect" }).click();
  await expect(dialog.getByRole("alert")).toContainText("app-specific password");

  await dialog.getByLabel("App-specific password").fill("abcd-efgh-ijkl-mnop");
  await dialog.getByRole("button", { name: "Connect" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText(/iCloud connected/)).toBeVisible();
  const account = page.getByLabel(`Calendar account ${appleId}`);
  // Your own calendars start shown; shared ones (Family) start hidden.
  await expect(account.getByRole("checkbox", { name: "Show Home" })).toBeChecked({ timeout: 20_000 });
  await expect(account.getByRole("checkbox", { name: "Show Family" })).not.toBeChecked();

  await page.goto("/today");
  await expect(page.getByRole("region", { name: "Calendar today" }).getByText("Gym")).toBeVisible({
    timeout: 20_000,
  });

  // Disconnect: its events leave Orbit.
  await page.goto("/settings");
  await page.getByLabel(`Calendar account ${appleId}`).getByRole("button", { name: "Disconnect" }).click();
  await page.getByRole("button", { name: "Disconnect" }).last().click();
  await expect(page.getByLabel(`Calendar account ${appleId}`)).toHaveCount(0);
  await page.goto("/today");
  await expect(page.getByText("Gym", { exact: true })).toHaveCount(0, { timeout: 20_000 });
  await waitForSynced(page);
});

/** Phase 2B.4: the private feed link, and free time in the Daily Plan's terms on Today. */
test("the calendar feed link serves time blocks and can be reset", async ({ page }, info) => {
  test.skip(info.project.name === "phone", "Same on every size");
  const title = `Feed block ${run()}`;
  await page.goto("/calendar");
  const group = page.locator('[role="group"][aria-label]').first();
  await group.evaluate((el) => {
    el.closest(".overflow-y-auto")!.scrollTop = 13 * 52;
  });
  await group.click({ position: { x: 20, y: 14 * 52 + 10 } });
  const dialog = page.getByRole("dialog", { name: "Block time" });
  await dialog.getByPlaceholder(/Find a task/).fill(title);
  await dialog.getByRole("button", { name: "Block time" }).click();
  await waitForSynced(page);

  await page.goto("/settings");
  await page.getByRole("button", { name: "Show my calendar link" }).click();
  const link = page.getByLabel("Calendar feed link");
  const url = await link.inputValue();
  expect(url).toMatch(/\/api\/calendar\/feed\/[A-Za-z0-9_-]{40,}\.ics$/);
  const feed = await page.request.get(url);
  expect(feed.headers()["content-type"]).toContain("text/calendar");
  expect(await feed.text()).toContain(`SUMMARY:${title}`);

  await page.getByRole("button", { name: "Reset link" }).click();
  await page.getByRole("button", { name: "Reset link" }).last().click();
  await expect(link).not.toHaveValue(url);
  expect((await page.request.get(url)).status()).toBe(404);

  // Leave the calendar as it was.
  await page.goto("/calendar");
  await page.getByRole("button", { name: new RegExp(`^Time block: ${title}`) }).click();
  await page.getByRole("dialog", { name: "Time block" }).getByRole("button", { name: "Delete block" }).click();
  await waitForSynced(page);
});
