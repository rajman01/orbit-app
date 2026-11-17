import { expect, request, test } from "@playwright/test";
import { run, waitForSynced } from "./helpers";

test.use({ storageState: "test-results/.auth.json" });

/** Phase 5A: the ledger. The shared test account keeps its money between runs, so rows carry a run id. */

test("money is logged from the Money page and Quick Add, shown by month, edited and deleted", async ({ page }) => {
  const r = run();
  await page.goto("/money");
  await waitForSynced(page);

  // From the page: amount, category, note.
  await page.getByRole("button", { name: "Log", exact: true }).click();
  const form = page.getByRole("dialog", { name: "Log money" });
  await form.getByRole("textbox", { name: "Amount" }).fill("12.50");
  await form.getByRole("radio", { name: "Food & drink" }).click();
  await form.getByRole("textbox", { name: "Note" }).fill(`Lunch ${r}`);
  await form.getByRole("button", { name: "Log it" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Spending logged" })).toBeVisible();
  const lunch = page.getByRole("button", { name: `Open Lunch ${r}` });
  await expect(lunch).toBeVisible();
  await expect(lunch).toContainText("-₦12.50");
  await expect(lunch).toContainText("Food & drink");
  await expect(page.getByRole("list", { name: "Spending by category" })).toContainText("Food & drink");

  // From Quick Add: "got 40 from Ada" is money, not a task.
  await page.getByRole("button", { name: "New task" }).first().click();
  const quick = page.getByRole("dialog", { name: "New task" });
  const input = quick.getByRole("textbox", { name: "New task" });
  await input.fill(`got 40 from Ada ${r}`);
  await expect(quick).toContainText("Received ₦40.00");
  await input.press("Enter");
  await input.press("Escape");
  const ada = page.getByRole("button", { name: `Open Ada ${r}` });
  await expect(ada).toBeVisible();
  await expect(ada).toContainText("+₦40.00");

  // The Transactions tab lists the month; the previous month doesn't have them.
  await page.getByRole("radio", { name: "Transactions" }).click();
  await expect(page.getByRole("button", { name: `Open Ada ${r}` })).toBeVisible();
  await page.getByRole("button", { name: "Previous month" }).click();
  await expect(page.getByRole("button", { name: `Open Ada ${r}` })).toHaveCount(0);
  await page.getByRole("button", { name: "Next month" }).click();

  // Edited, then deleted.
  await page.getByRole("button", { name: `Open Lunch ${r}` }).click();
  const edit = page.getByRole("dialog", { name: "Edit transaction" });
  await edit.getByRole("textbox", { name: "Note" }).fill(`Lunch with Ada ${r}`);
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("button", { name: `Open Lunch with Ada ${r}` })).toBeVisible();
  await page.getByRole("button", { name: `Open Lunch with Ada ${r}` }).click();
  await edit.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("button", { name: `Open Lunch with Ada ${r}` })).toHaveCount(0);
  await waitForSynced(page);
});

test("accounts hold a balance, and the Shortcut logs money from outside", async ({ page, baseURL }, info) => {
  test.skip(info.project.name === "phone", "the same page; the API needs one run");
  const r = run();
  await page.goto("/money?tab=accounts");
  await waitForSynced(page);
  await page.getByRole("button", { name: "New account" }).click();
  const form = page.getByRole("dialog", { name: "New account" });
  await form.getByRole("textbox", { name: "Name" }).fill(`Cash ${r}`);
  await form.getByRole("radio", { name: "cash" }).click();
  await form.getByRole("textbox", { name: /Balance today/ }).fill("100");
  await form.getByRole("button", { name: "Add account" }).click();
  const row = page.getByRole("listitem").filter({ hasText: `Cash ${r}` });
  await expect(row).toContainText("₦100.00");

  // Spending from that account lowers it.
  await page.getByRole("button", { name: "Log", exact: true }).click();
  const log = page.getByRole("dialog", { name: "Log money" });
  await log.getByRole("textbox", { name: "Amount" }).fill("30");
  await log.getByRole("button", { name: "Account" }).click();
  await page.getByRole("menuitem", { name: `Cash ${r}` }).click();
  await log.getByRole("button", { name: "Log it" }).click();
  await expect(row).toContainText("₦70.00");
  await waitForSynced(page);

  // As the iOS Shortcut would, with a token and no cookies.
  await page.goto("/capture");
  await page.getByRole("textbox", { name: "Token name" }).fill(`Money ${r}`);
  await page.getByRole("button", { name: "New token" }).click();
  const token = (await page.getByLabel("New token").textContent())!.trim();
  const api = await request.newContext({ baseURL });
  const res = await api.post("/api/capture", {
    headers: { Authorization: `Bearer ${token}` },
    data: { text: `spent 7.5 taxi ${r}` },
  });
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ ok: true, message: `Logged: Spent ₦7.50 · taxi ${r}` });
  await page.goto("/money?tab=transactions");
  await expect(page.getByRole("button", { name: `Open taxi ${r}` })).toBeVisible({ timeout: 20_000 });
});

test("a budget shows its pace, and a recurring entry comes back as due to confirm", async ({ page }, info) => {
  test.skip(info.project.name === "phone", "the same components; one run");
  const r = run();
  await page.clock.install({ time: new Date("2026-11-17T12:00:00") });
  await page.goto("/money?tab=budgets");
  await waitForSynced(page);

  // A budget for Transport: nothing spent yet, so it's under pace.
  await page.getByRole("button", { name: "Transport" }).click();
  const form = page.getByRole("dialog", { name: "Budget for Transport" });
  await form.getByRole("textbox", { name: "Budget" }).fill("1000");
  await form.getByRole("button", { name: "Save" }).click();
  const row = page.getByRole("list", { name: "Budgets" }).getByRole("button", { name: /^Transport:/ });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Under pace");

  // A recurring fuel entry, dated the 1st, makes the budget move and comes round again.
  await page.getByRole("button", { name: "Log", exact: true }).click();
  const log = page.getByRole("dialog", { name: "Log money" });
  await log.getByRole("textbox", { name: "Amount" }).fill("400");
  await log.getByRole("radio", { name: "Transport" }).click();
  await log.getByRole("textbox", { name: "Note" }).fill(`Fuel ${r}`);
  await log.getByRole("button", { name: "Day" }).click();
  await page.locator('input[type="date"]').fill("2026-10-01");
  await log.getByRole("button", { name: "Repeats" }).click();
  await page.getByRole("menuitem", { name: "Every month" }).click();
  await log.getByRole("button", { name: "Log it" }).click();
  await expect(log).toHaveCount(0);

  // Due on the 1st of November: skip or confirm. Confirmed, it counts against the budget.
  await page.goto("/money");
  const due = page.getByRole("region", { name: "Due" });
  await expect(due).toContainText(`Fuel ${r}`);
  await due.getByRole("button", { name: "Confirm" }).click();
  await expect(due).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Coming up" })).toContainText(`Fuel ${r}`);
  await page.getByRole("radio", { name: "Budgets" }).click();
  await expect(row).toContainText("₦400 of ₦1,000");

  // Remove the budget so the next run starts clean.
  await row.click();
  await page
    .getByRole("dialog", { name: "Budget for Transport" })
    .getByRole("button", { name: "Remove budget" })
    .click();
  await expect(row).toHaveCount(0);
  await waitForSynced(page);
});
