import { expect, test } from "@playwright/test";
import { run, waitForSynced } from "./helpers";

test.use({ storageState: "test-results/.auth.json" });

/** Phase 2C.1: people, the interaction log and follow-ups. */

test("add a person, log a call with a follow-up, and see it on another device", async ({ page, context, browser }) => {
  const r = run();
  const name = `Ada ${r}`;
  await page.goto("/people");
  await waitForSynced(page);

  await page.getByRole("button", { name: "New person" }).click();
  const form = page.getByRole("dialog", { name: "New person" });
  await form.getByRole("textbox", { name: "Name" }).fill(name);
  await form.getByRole("radio", { name: "Family" }).click();
  await form.getByRole("radio", { name: "Every 2 weeks" }).click();
  await form.getByRole("button", { name: "Add birthday" }).click();
  await form.getByRole("combobox", { name: "Day" }).selectOption("10");
  await form.getByRole("combobox", { name: "Month" }).selectOption("12");
  await form.getByRole("textbox", { name: "Year (optional)" }).fill("1990");
  await form.getByRole("textbox", { name: "Interests" }).fill("Maths, poetry");
  await form.getByRole("button", { name: "Add person" }).click();

  // The new person's page.
  await expect(page).toHaveURL(/\/person\?id=/);
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByRole("button", { name: "Keep in touch" })).toContainText("Every 2 weeks");
  await expect(page.getByText("Nothing logged yet")).toBeVisible();
  await expect(page.getByText("10 December 1990")).toBeVisible();
  await expect(page.getByText("Poetry", { exact: false })).toBeVisible();

  // Things to remember and a gift idea.
  await page.getByRole("textbox", { name: "Add to things to remember" }).fill("Loves engines");
  await page.getByRole("textbox", { name: "Add to things to remember" }).press("Enter");
  await page.getByRole("textbox", { name: "Add to gift ideas" }).fill("Analytical notebook");
  await page.getByRole("textbox", { name: "Add to gift ideas" }).press("Enter");
  await page.getByRole("checkbox", { name: "Given: Analytical notebook" }).click();
  await expect(page.getByRole("checkbox", { name: "Given: Analytical notebook" })).toHaveAttribute(
    "aria-checked",
    "true",
  );

  // Log a call with a follow-up for today.
  await page.getByRole("button", { name: "Log", exact: true }).click();
  const log = page.getByRole("dialog", { name: `Log time with ${name}` });
  await log.getByRole("radio", { name: "Call" }).click();
  await log.getByRole("textbox", { name: "Notes" }).fill("Talked about her new paper");
  await log.getByRole("checkbox", { name: "Add a follow-up task" }).check();
  await log.getByRole("textbox", { name: "Follow-up" }).fill(`Send notes ${r}`);
  await log.getByRole("button", { name: "Do it on" }).click();
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await log.getByRole("button", { name: "Log it" }).click();

  await expect(page.getByText("Last in touch today")).toBeVisible();
  const entries = page.getByRole("list", { name: "Log" });
  await expect(entries).toContainText("Called");
  await expect(entries).toContainText("Talked about her new paper");
  await expect(page.getByRole("list", { name: `Tasks about ${name}` })).toContainText(`Send notes ${r}`);
  await waitForSynced(page);

  // The follow-up is on Today.
  await page.goto("/today");
  await expect(page.getByRole("button", { name: `Open Send notes ${r}` }).first()).toBeVisible();
  // The task knows who it's about.
  await page
    .getByRole("button", { name: `Open Send notes ${r}` })
    .first()
    .click();
  await expect(page.getByRole("button", { name: "Person" })).toContainText(name);
  await page.keyboard.press("Escape");

  // Another device (a phone) gets everything through sync.
  const other = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await other.addCookies(await context.cookies());
  const phone = await other.newPage();
  await phone.goto("/people");
  await phone.getByRole("searchbox", { name: "Search people" }).fill(r);
  const row = phone.getByRole("list", { name: "People" }).getByRole("link", { name: new RegExp(name) });
  await expect(row).toContainText("In touch today", { timeout: 20_000 });
  await row.click();
  await expect(phone.getByRole("heading", { name })).toBeVisible();
  await expect(phone.getByRole("list", { name: "Log" })).toContainText("Talked about her new paper");
  await expect(phone.getByText("Loves engines")).toBeVisible();
  await expect(phone.getByRole("checkbox", { name: "Given: Analytical notebook" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await other.close();

  // Delete: the follow-up task stays, without the link.
  await page.goto("/people");
  await page.getByRole("searchbox", { name: "Search people" }).fill(r);
  await page.getByRole("link", { name: new RegExp(name) }).click();
  await page.getByRole("button", { name: "Person actions" }).click();
  await page.getByRole("menuitem", { name: "Delete person…" }).click();
  await page
    .getByRole("dialog", { name: `Delete ${name}?` })
    .getByRole("button", { name: "Delete person" })
    .click();
  await expect(page).toHaveURL(/\/people$/);
  await page.goto("/today");
  await expect(page.getByRole("button", { name: `Open Send notes ${r}` }).first()).toBeVisible();
});

test("G P opens People", async ({ page }) => {
  await page.goto("/today");
  await waitForSynced(page);
  await page.keyboard.press("g");
  await page.keyboard.press("p");
  await expect(page).toHaveURL(/\/people/);
  await expect(page.getByRole("heading", { name: "People" })).toBeVisible();
});

/** Phase 2C.2: Reach out, snooze, dates coming up, and goals linked to people. */
test("someone overdue shows in Reach out; snooze, undo, log; birthday tomorrow; goal link", async ({ page }) => {
  const r = run();
  const name = `Tolu ${r}`;
  const day = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d;
  };
  const tomorrow = day(1);
  const threeWeeksAgo = day(-20);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  await page.goto("/people");
  await waitForSynced(page);
  await page.getByRole("button", { name: "New person" }).click();
  const form = page.getByRole("dialog", { name: "New person" });
  await form.getByRole("textbox", { name: "Name" }).fill(name);
  await form.getByRole("radio", { name: "Every week" }).click();
  await form.getByRole("button", { name: "Add birthday" }).click();
  await form.getByRole("combobox", { name: "Day" }).selectOption(String(tomorrow.getDate()));
  await form.getByRole("combobox", { name: "Month" }).selectOption(String(tomorrow.getMonth() + 1));
  await form.getByRole("button", { name: "Add person" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  const personUrl = page.url();

  // Last spoke 20 days ago: weekly, so overdue.
  await page.getByRole("button", { name: "Log", exact: true }).click();
  const log = page.getByRole("dialog", { name: `Log time with ${name}` });
  await log.getByLabel("When").fill(iso(threeWeeksAgo));
  await log.getByRole("button", { name: "Log it" }).click();
  await expect(page.getByText(/Last in touch 3 weeks ago/)).toBeVisible();

  // Link a goal to them.
  await page.goto("/goals");
  await page.getByRole("button", { name: "New goal" }).click();
  await page.getByRole("textbox", { name: "Goal", exact: true }).fill(`Closer to ${name}`);
  await page.getByRole("button", { name: "Create goal" }).click();
  await expect(page).toHaveURL(/\/goal\?id=/);
  await page.getByRole("button", { name: "Link a person" }).click();
  await page.getByRole("menuitem", { name }).click();
  await expect(page.getByRole("group", { name: "People" })).toContainText(name);
  await page.goto(personUrl);
  await expect(page.getByRole("region", { name: "Goals" })).toContainText(`Closer to ${name}`);

  // People page: due a catch-up, and the birthday coming up.
  await page.goto("/people");
  await expect(page.getByRole("region", { name: "Coming up" })).toContainText(name);
  await expect(page.getByRole("region", { name: "Coming up" })).toContainText("Tomorrow");
  await expect(page.getByRole("region", { name: "Due a catch-up" })).toContainText(name);

  // Today: in Reach out, with the birthday tomorrow.
  await page.goto("/today");
  const reach = page.getByRole("region", { name: "Reach out" });
  await expect(reach.getByRole("link", { name: `Open ${name}` })).toBeVisible();
  await expect(reach).toContainText(`${name.split(" ")[0]}'s birthday is tomorrow`);
  await expect(reach).toContainText("Last in touch 3 weeks ago · every week");

  // Snooze, then undo.
  await reach.getByRole("button", { name: `Snooze ${name}` }).click();
  await page.getByRole("menuitem", { name: "Next week" }).click();
  await expect(reach.getByRole("link", { name: `Open ${name}` })).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(reach.getByRole("link", { name: `Open ${name}` })).toBeVisible();

  // Log from Today: they leave Reach out.
  await reach.getByRole("button", { name: `Log time with ${name}` }).click();
  await page
    .getByRole("dialog", { name: `Log time with ${name}` })
    .getByRole("button", { name: "Log it" })
    .click();
  await expect(reach.getByRole("link", { name: `Open ${name}` })).toHaveCount(0);
  await waitForSynced(page);

  // Clean up (the account is shared between runs).
  await page.goto(personUrl);
  await page.getByRole("button", { name: "Person actions" }).click();
  await page.getByRole("menuitem", { name: "Delete person…" }).click();
  await page.getByRole("button", { name: "Delete person" }).click();
  await expect(page).toHaveURL(/\/people$/);
});
