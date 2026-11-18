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

  // No tab of the Money page may be wider than a phone (a wider page breaks the sheets).
  for (const t of ["overview", "transactions", "budgets", "pots", "debts", "invest", "accounts"]) {
    await page.goto(`/money?tab=${t}`);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), t).toBeLessThanOrEqual(
      0,
    );
  }
  await page.goto("/money?tab=transactions");

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

test("a savings pot: money put in, tied to a goal as a key result, and a statement imported", async ({
  page,
}, info) => {
  test.skip(info.project.name === "phone", "the same components; one run");
  const r = run();
  await page.clock.install({ time: new Date("2026-11-17T12:00:00") });
  await page.goto("/money?tab=pots");
  await waitForSynced(page);

  await page.getByRole("button", { name: "New pot" }).click();
  const form = page.getByRole("dialog", { name: "New savings pot" });
  await form.getByRole("textbox", { name: "What for" }).fill(`Canada fund ${r}`);
  await form.getByRole("textbox", { name: "Target" }).fill("1000000");
  await form.getByRole("button", { name: "Target date" }).click();
  await page.locator('input[type="date"]').fill("2028-08-01");
  await form.getByRole("button", { name: "Add pot" }).click();
  const card = page.getByRole("region", { name: `Pot: Canada fund ${r}` });
  await expect(card).toContainText("₦0 of ₦1,000,000");

  // Money in: the balance, the bar and the projection move.
  await card.getByRole("button", { name: "Put money in" }).click();
  const put = page.getByRole("dialog", { name: `Put money in Canada fund ${r}` });
  await put.getByRole("textbox", { name: "Amount" }).fill("100000");
  await put.getByRole("button", { name: "Put in" }).click();
  await expect(card).toContainText("₦100,000 of ₦1,000,000");
  await expect(card).toContainText("At ₦100,000 a month, you reach it in August 2027");
  await expect(card).toContainText("To make Aug 2028: ₦42,858 a month");

  // Made into a goal: a key result follows the balance; the goal page shows the pot.
  await card.getByRole("button", { name: `More for Canada fund ${r}` }).click();
  await page.getByRole("menuitem", { name: "Make this a goal" }).click();
  await expect(page).toHaveURL(/\/goal\?id=/);
  await expect(page.getByRole("textbox", { name: "Goal title" })).toHaveValue(`Canada fund ${r}`);
  await expect(page.getByText(`Save ₦1,000,000 for Canada fund ${r}`)).toBeVisible();
  const goalPot = page.getByRole("region", { name: `Pot: Canada fund ${r}` });
  await expect(goalPot).toContainText("₦100,000 of ₦1,000,000");
  await goalPot.getByRole("button", { name: "Put money in" }).click();
  await page
    .getByRole("dialog", { name: `Put money in Canada fund ${r}` })
    .getByRole("textbox", { name: "Amount" })
    .fill("50000");
  await page.getByRole("button", { name: "Put in", exact: true }).click();
  await expect(goalPot).toContainText("₦150,000 of ₦1,000,000");
  await expect(page.getByText("15%", { exact: true })).toBeVisible();

  // A statement, imported twice: the second time adds nothing.
  await page.goto("/money?tab=transactions");
  await page.getByRole("button", { name: "Import CSV" }).click();
  const dialog = page.getByRole("dialog", { name: "Import a statement" });
  await dialog.getByLabel("Statement CSV").setInputFiles("tests/e2e/fixtures/statement.csv");
  const rows = dialog.getByRole("list", { name: "Rows to import" });
  await expect(rows).toContainText("CHICKEN REPUBLIC FOOD");
  await expect(rows).toContainText("+₦250,000.00");
  const n = Number((await dialog.getByRole("button", { name: /^Import \d+$/ }).textContent())!.replace(/\D/g, ""));
  await dialog.getByRole("button", { name: `Import ${n}` }).click();
  await expect(
    page.getByRole("status").filter({ hasText: n ? `${n} imported` : "Nothing new to import" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Import CSV" }).click();
  await dialog.getByLabel("Statement CSV").setInputFiles("tests/e2e/fixtures/statement.csv");
  await expect(dialog).toContainText("3 already here");
  await expect(dialog.getByRole("button", { name: "Import 0" })).toBeDisabled();
  await page.keyboard.press("Escape");

  // Tidy: the pot and goal go.
  await page.goto("/money?tab=pots");
  await card.getByRole("button", { name: `More for Canada fund ${r}` }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(card).toHaveCount(0);
  await waitForSynced(page);
});

test("a debt: payments, interest, the payoff plan, a goal to clear it, and settling up", async ({ page }, info) => {
  test.skip(info.project.name === "phone", "the same components; one run");
  const r = run();
  await page.clock.install({ time: new Date("2026-11-18T12:00:00") });
  await page.goto("/money?tab=debts");
  await waitForSynced(page);

  await page.getByRole("button", { name: "New debt" }).click();
  const form = page.getByRole("dialog", { name: "New debt" });
  await form.getByRole("textbox", { name: "What" }).fill(`Visa card ${r}`);
  await form.getByRole("textbox", { name: "Amount now" }).fill("300000");
  await form.getByRole("radio", { name: "Credit card" }).click();
  await form.getByRole("textbox", { name: "Interest % a year" }).fill("36");
  await form.getByRole("textbox", { name: "Due day of month" }).fill("5");
  await form.getByRole("textbox", { name: "Minimum a month" }).fill("15000");
  await form.getByRole("button", { name: "Add debt" }).click();
  const card = page.getByRole("region", { name: `Debt: Visa card ${r}` });
  await expect(card).toContainText("₦300,000 left of ₦300,000");
  await expect(card).toContainText("36% a year");
  await expect(card).toContainText("overdue since Nov 5");

  // A payment: less left, and the due day moves to next month.
  await card.getByRole("button", { name: "Record a payment" }).click();
  const pay = page.getByRole("dialog", { name: `Payment on Visa card ${r}` });
  await expect(pay.getByRole("textbox", { name: "Amount" })).toHaveValue("15000");
  await pay.getByRole("textbox", { name: "Amount" }).fill("100000");
  await pay.getByRole("button", { name: "Record" }).click();
  await expect(card).toContainText("₦200,000 left of ₦300,000");
  await expect(card).toContainText("₦100,000 paid");
  await expect(card).toContainText("next due Dec 5");

  // The plan: this debt in it, a done month, and what more a month saves.
  const plan = page.getByRole("region", { name: "Payoff plan" });
  await expect(plan.getByRole("list", { name: "Order of payoff" })).toContainText(`Visa card ${r}`);
  await expect(plan).toContainText("Everything cleared by");
  await plan.getByRole("textbox", { name: "Monthly amount" }).fill("100000");
  await expect(plan).toContainText("Paying");

  // A goal to clear it, with a key result that counts what's paid.
  await card.getByRole("button", { name: `More for Visa card ${r}` }).click();
  await page.getByRole("menuitem", { name: "Make clearing it a goal" }).click();
  await expect(page).toHaveURL(/\/goal\?id=/);
  await expect(page.getByRole("textbox", { name: "Goal title" })).toHaveValue(`Clear Visa card ${r}`);
  await expect(page.getByText(`Clear Visa card ${r} (₦300,000)`)).toBeVisible();
  await expect(page.getByText("₦100,000 / ₦300,000")).toBeVisible();
  const goalCard = page.getByRole("region", { name: `Debt: Visa card ${r}` });
  await goalCard.getByRole("button", { name: "Record a payment" }).click();
  await page.getByRole("button", { name: /^Settle in full/ }).click();
  await page.getByRole("button", { name: "Record", exact: true }).click();
  await expect(goalCard).toContainText("Cleared");
  await expect(page.getByText("₦300,000 / ₦300,000")).toBeVisible();

  // Tidy.
  await page.getByRole("button", { name: "Goal actions" }).click();
  await page.getByRole("menuitem", { name: "Delete goal…" }).click();
  await page.getByRole("button", { name: "Delete goal" }).click();
  await page.goto("/money?tab=debts");
  await card.getByRole("button", { name: `More for Visa card ${r}` }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(card).toHaveCount(0);
  await waitForSynced(page);
});

test("investments: a priced crypto holding, a hand-valued property, the spread and net worth", async ({
  page,
}, info) => {
  test.skip(info.project.name === "phone", "the same components; one run");
  const r = run();
  await page.goto("/money?tab=invest");
  await waitForSynced(page);

  // Bitcoin, 0.1 of it, bought for ₦6,000,000; the test price source says $60,000 at ₦1,500 to the dollar.
  await page.getByRole("button", { name: "New holding" }).click();
  const form = page.getByRole("dialog", { name: "New holding" });
  await form.getByRole("textbox", { name: "Name" }).fill(`Bitcoin ${r}`);
  await form.getByRole("radio", { name: "Crypto" }).click();
  await form.getByRole("textbox", { name: /Coin id/ }).fill("bitcoin");
  await form.getByRole("textbox", { name: "Units" }).fill("0.1");
  await form.getByRole("textbox", { name: "What it cost in all" }).fill("6000000");
  await form.getByRole("button", { name: "Add holding" }).click();
  const list = page.getByRole("list", { name: "Holdings" });
  const btc = list.getByRole("listitem").filter({ hasText: `Bitcoin ${r}` });
  await expect(btc).toContainText("no price yet");
  await expect(btc).toContainText("₦6,000,000");
  await waitForSynced(page); // the server prices what it has
  await page.getByRole("button", { name: "Refresh prices" }).click();
  await expect(page.getByRole("status").filter({ hasText: "1 price updated" })).toBeVisible();
  await expect(btc).toContainText("0.1 × ₦90,000,000.00", { timeout: 15_000 });
  await expect(btc).toContainText("₦9,000,000");
  await expect(btc).toContainText("+₦3,000,000 · +50%");

  // A flat, valued by hand.
  await page.getByRole("button", { name: "New holding" }).click();
  await form.getByRole("textbox", { name: "Name" }).fill(`Flat ${r}`);
  await form.getByRole("radio", { name: "Property" }).click();
  await form.getByRole("textbox", { name: "What it cost in all" }).fill("20000000");
  await form.getByRole("textbox", { name: /Worth today/ }).fill("25000000");
  await form.getByRole("button", { name: "Add holding" }).click();
  const flat = list.getByRole("listitem").filter({ hasText: `Flat ${r}` });
  await expect(flat).toContainText("₦25,000,000");
  await expect(flat).toContainText("+25%");
  await flat.getByRole("button", { name: `More for Flat ${r}` }).click();
  await page.getByRole("menuitem", { name: "Update value" }).click();
  const value = page.getByRole("dialog", { name: `Flat ${r}: worth today` });
  await value.getByRole("textbox", { name: "Worth today" }).fill("26000000");
  await value.getByRole("button", { name: "Save" }).click();
  await expect(flat).toContainText("₦26,000,000");

  // The spread and the net worth card.
  await expect(page.getByRole("list", { name: "Holdings by type" })).toContainText("Property");
  await expect(page.getByRole("list", { name: "Holdings by type" })).toContainText("Crypto");
  await expect(page.getByRole("region", { name: "Net worth" })).toContainText("holdings");
  await expect(page.getByRole("img", { name: "Net worth over the last twelve months" })).toBeVisible();

  // Tidy.
  for (const name of [`Bitcoin ${r}`, `Flat ${r}`]) {
    await list
      .getByRole("listitem")
      .filter({ hasText: name })
      .getByRole("button", { name: `More for ${name}` })
      .click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await expect(list.getByRole("listitem").filter({ hasText: name })).toHaveCount(0);
  }
  await waitForSynced(page);
});

test("the coach logs money and talks about a pot", async ({ page }, info) => {
  test.skip(info.project.name === "phone", "the same panel; one run");
  const r = run();
  await page.goto("/coach?new=1");
  await waitForSynced(page);
  const box = page.getByRole("textbox", { name: "Message the coach" });
  await box.fill(
    `log it [tool:log_transaction {"kind":"expense","amount":12.5,"category":"food","note":"Lunch ${r}"}]`,
  );
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const card = page.locator("[data-ai-action]").filter({ hasText: `Log spending: ₦12.50 · Lunch ${r}` });
  await expect(card).toHaveAttribute("data-ai-action", "applied", { timeout: 15_000 });
  await card.getByRole("link", { name: "View" }).click();
  await expect(page).toHaveURL(/\/money/);
  await expect(page.getByRole("button", { name: `Open Lunch ${r}` })).toBeVisible();

  // Coach on a pot: a conversation about that one pot.
  await page.goto("/money?tab=pots");
  await page.getByRole("button", { name: "New pot" }).click();
  const form = page.getByRole("dialog", { name: "New savings pot" });
  await form.getByRole("textbox", { name: "What for" }).fill(`Laptop ${r}`);
  await form.getByRole("textbox", { name: "Target" }).fill("500000");
  await form.getByRole("button", { name: "Add pot" }).click();
  const pot = page.getByRole("region", { name: `Pot: Laptop ${r}` });
  await pot.getByRole("button", { name: "Talk to the coach about this savings pot" }).click();
  const panel = page.getByRole("dialog", { name: "Coach" });
  await expect(panel.getByText("Savings pot", { exact: true })).toBeVisible();
  await expect(panel).toContainText("A conversation just about this savings pot.");
  await panel.getByRole("button", { name: "Will I make the target date?" }).click();
  await expect(
    panel.getByText(`You said: Will I make the target date? [about the savings pot “Laptop ${r}”]`),
  ).toBeVisible({
    timeout: 15_000,
  });
  await panel.getByRole("button", { name: "Close coach" }).click();
  await pot.getByRole("button", { name: `More for Laptop ${r}` }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(pot).toHaveCount(0);
  await waitForSynced(page);
});

test("the Plan tab: expected income against bills, budgets, savings and debt minimums", async ({ page }, info) => {
  test.skip(info.project.name === "phone", "the same components; one run");
  const r = run();
  await page.goto("/money?tab=plan");
  await waitForSynced(page);
  await page.getByRole("button", { name: "Add income" }).click();
  const form = page.getByRole("dialog", { name: "Expected income" });
  await form.getByRole("textbox", { name: "From" }).fill(`Salary ${r}`);
  await form.getByRole("textbox", { name: "Per month" }).fill("800000");
  await form.getByRole("textbox", { name: /Day it lands/ }).fill("25");
  await form.getByRole("button", { name: "Add income" }).click();
  const income = page
    .getByRole("list", { name: "Income" })
    .getByRole("listitem")
    .filter({ hasText: `Salary ${r}` });
  await expect(income).toContainText("on the 25th");
  await expect(income).toContainText("₦800,000");
  const plan = page.getByRole("region", { name: "Month plan" });
  await expect(plan).toContainText("Income ₦800,000");

  // A pot with a chosen monthly amount shows under Savings and comes off what's left.
  await page.goto("/money?tab=pots");
  await page.getByRole("button", { name: "New pot" }).click();
  const pot = page.getByRole("dialog", { name: "New savings pot" });
  await pot.getByRole("textbox", { name: "What for" }).fill(`Rainy day ${r}`);
  await pot.getByRole("textbox", { name: "Target" }).fill("300000");
  await pot.getByRole("textbox", { name: /Put in each month/ }).fill("50000");
  await pot.getByRole("button", { name: "Add pot" }).click();
  await expect(page.getByRole("region", { name: `Pot: Rainy day ${r}` })).toBeVisible();
  await waitForSynced(page);
  await page.goto("/money?tab=plan");
  const savings = page.getByRole("list", { name: "Savings" });
  await expect(savings).toContainText(`Rainy day ${r}`);
  await expect(savings.getByRole("listitem").filter({ hasText: `Rainy day ${r}` })).toContainText("chosen");

  // Tidy: the income and the pot go.
  await income.getByRole("button", { name: `Remove Salary ${r}` }).click();
  await expect(income).toHaveCount(0);
  await page.goto("/money?tab=pots");
  const card = page.getByRole("region", { name: `Pot: Rainy day ${r}` });
  await card.getByRole("button", { name: `More for Rainy day ${r}` }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(card).toHaveCount(0);
  await waitForSynced(page);
});
