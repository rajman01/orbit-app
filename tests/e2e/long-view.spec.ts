import { expect, test } from "@playwright/test";
import { run, waitForSynced } from "./helpers";

test.use({ storageState: "test-results/.auth.json" });

/** Phase 2D.1: vision, values, quarters and quarters leading cycle planning. */
test("vision with a value, a goal that serves it, in the quarter, flagged in cycle planning", async ({
  page,
}, info) => {
  test.skip(info.project.name === "phone", "One run is enough: the vision and quarter are shared");
  const r = run();
  const value = `Craft ${r}`;
  const goalTitle = `Ship the portfolio ${r}`;
  const step = `Sketch the case study ${r}`;

  // Vision: theme, a value, a 1-year vision.
  await page.goto("/vision");
  await waitForSynced(page);
  const year = new Date().getFullYear();
  await page.getByRole("textbox", { name: `${year} theme` }).fill(`Foundation ${r}`);
  await page.getByRole("textbox", { name: `${year} theme` }).press("Enter");
  await page.getByRole("button", { name: /Add (your first|a) value/ }).click();
  await page.getByRole("textbox", { name: "Value", exact: true }).fill(value);
  await page.getByRole("textbox", { name: "What it means to you" }).fill("Do work I'm proud of");
  await page.getByRole("button", { name: "Add value" }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("textbox", { name: "In a year" }).fill(`Working as a designer ${r}`);
  await page.getByRole("textbox", { name: "In a year" }).blur();
  await waitForSynced(page);
  await page.reload();
  await expect(page.getByRole("textbox", { name: `${year} theme` })).toHaveValue(`Foundation ${r}`);
  await expect(page.getByRole("list", { name: "Values" })).toContainText(value);
  await expect(page.getByRole("textbox", { name: "In a year" })).toHaveValue(`Working as a designer ${r}`);

  // A goal that serves the value.
  await page.goto("/goals");
  await page.getByRole("button", { name: "New goal" }).click();
  await page.getByRole("textbox", { name: "Goal", exact: true }).fill(goalTitle);
  await page.getByRole("textbox", { name: "First step (optional)" }).fill(step);
  await page.getByRole("button", { name: "Create goal" }).click();
  await expect(page).toHaveURL(/\/goal\?id=/);
  const why = page.getByRole("region", { name: "Why this matters" });
  await why.getByRole("button", { name: /values does this serve/ }).click();
  await page.getByRole("menuitem", { name: value }).click();
  await expect(why).toContainText("Do work I'm proud of");
  await page.goto("/vision");
  await expect(page.getByRole("list", { name: "Values" }).getByRole("link", { name: goalTitle })).toBeVisible();

  // Into this quarter.
  await page.goto("/quarter");
  await page.getByRole("button", { name: "Add a goal" }).click();
  await page.getByRole("menuitem", { name: goalTitle }).click();
  const goals = page.getByRole("list", { name: "Quarter goals" });
  await expect(goals).toContainText(goalTitle);
  await expect(page.getByRole("meter", { name: "Time gone" })).toBeVisible();

  // Cycle planning flags it and adds its first step.
  await page.goto("/cycle?tab=plan");
  const quarter = page.getByRole("region", { name: "Quarter goals" });
  await expect(quarter).toContainText(`Nothing for ${goalTitle} in this cycle yet`);
  await quarter.getByRole("listitem").filter({ hasText: goalTitle }).getByRole("button", { name: /^Add/ }).click();
  await expect(quarter).not.toContainText(goalTitle);
  await expect(page.getByRole("region", { name: /^In cycle/ })).toContainText(step);

  // Tidy up: out of the quarter, and the value removed (the account is shared).
  await page.goto("/quarter");
  await page.getByRole("button", { name: `Take ${goalTitle} out of the quarter` }).click();
  await expect(goals).toHaveCount(0);
  await page.goto("/vision");
  await page.getByRole("button", { name: `Remove ${value}` }).click();
  await expect(page.getByRole("list", { name: "Values" })).not.toContainText(value);
});

test("the quarter page moves between quarters", async ({ page }) => {
  await page.goto("/quarter");
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3) + 1;
  await expect(page.getByRole("heading", { name: `Q${q} ${now.getFullYear()}` })).toBeVisible();
  await page.getByRole("button", { name: "Next quarter" }).click();
  const next = q === 4 ? `Q1 ${now.getFullYear() + 1}` : `Q${q + 1} ${now.getFullYear()}`;
  await expect(page.getByRole("heading", { name: next })).toBeVisible();
  await page.getByRole("button", { name: "This quarter" }).click();
  await expect(page.getByRole("heading", { name: `Q${q} ${now.getFullYear()}` })).toBeVisible();
});

/** Phase 2D.2: the Quarterly Plan (short, mid-quarter) and the Quarterly Review, then the year. */
test("plan the rest of the quarter from Today, review it on its last day, see the year", async ({ page }, info) => {
  test.skip(info.project.name === "phone", "One run is enough: it commits the shared quarter");
  const r = run();
  const goal = `Land a design role ${r}`;
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3) + 1;
  const label = `Q${q} ${now.getFullYear()}`;
  const nextLabel = q === 4 ? `Q1 ${now.getFullYear() + 1}` : `Q${q + 1} ${now.getFullYear()}`;

  await page.goto("/today");
  await waitForSynced(page);
  await page.getByRole("button", { name: new RegExp(`Plan ${label}`) }).click();
  const dialog = page.getByRole("dialog", { name: "Plan the quarter" });
  const cont = dialog.getByRole("button", { name: "Continue" });
  await expect(dialog.getByRole("heading", { name: "Start from the long view" })).toBeVisible();
  await cont.click();

  // Choose: a new goal goes straight in.
  await expect(cont).toBeDisabled();
  await dialog.getByRole("textbox", { name: "New goal" }).fill(goal);
  await dialog.getByRole("button", { name: "Add goal" }).click();
  await expect(dialog.getByRole("button", { name: goal })).toHaveAttribute("aria-pressed", "true");
  await cont.click();

  // Concrete: a key result is required.
  await expect(cont).toBeDisabled();
  await dialog.getByRole("textbox", { name: `Key result for ${goal}` }).fill("Applications sent");
  await dialog.getByRole("textbox", { name: `Target for ${goal}` }).fill("20");
  await dialog.getByRole("button", { name: `Add key result to ${goal}` }).click();
  await expect(cont).toBeEnabled();
  await cont.click();

  // Monthly milestones (optional): one for the first month left.
  await dialog
    .getByRole("textbox", { name: new RegExp(`${goal}: milestone for`) })
    .first()
    .fill("Portfolio live");
  await dialog
    .getByRole("button", { name: /^Add milestone for/ })
    .first()
    .click();
  await expect(dialog.getByText("Portfolio live")).toBeVisible();
  await cont.click();
  await expect(dialog.getByRole("heading", { name: "Is it realistic?" })).toBeVisible();
  await cont.click();

  // Commit.
  await dialog.getByRole("textbox", { name: "Quarter theme" }).fill(`Get hired ${r}`);
  const commit = dialog.getByRole("button", { name: `Commit to ${label}` });
  await expect(commit).toBeDisabled();
  await dialog.getByRole("checkbox").check();
  await commit.click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: new RegExp(`Plan ${label}`) })).toHaveCount(0);

  await page.goto("/quarter");
  await expect(page.getByRole("textbox", { name: "Quarter theme" })).toHaveValue(`Get hired ${r}`);
  await expect(page.getByRole("list", { name: "Quarter goals" })).toContainText(goal);
  await expect(page.getByText(/Committed/)).toBeVisible();
  await page.goto(`/year?y=${now.getFullYear()}`);
  await expect(page.getByRole("region", { name: "Quarters" })).toContainText(goal);
  await expect(page.getByRole("region", { name: "Goals timeline" }).getByRole("link", { name: goal })).toBeVisible();
  await waitForSynced(page);

  // The quarter's last day, after the review time: the review is waiting on Today.
  const lastDay = new Date(now.getFullYear(), q * 3, 0, 19, 0);
  await page.clock.install({ time: lastDay });
  await page.goto("/today");
  await page.getByRole("button", { name: new RegExp(`Review ${label}`) }).click();
  const review = page.getByRole("dialog", { name: "Review the quarter" });
  const next = review.getByRole("button", { name: "Continue" });
  await expect(review.getByRole("heading", { name: `How did ${label} go?` })).toBeVisible();
  await expect(review).toContainText("Applications sent");
  await next.click();
  await expect(next).toBeDisabled();
  await review.getByRole("radio", { name: `Carry into ${nextLabel}` }).click();
  await expect(next).toBeEnabled();
  await next.click();
  await review.getByRole("textbox", { name: "Win 1" }).fill(`Portfolio shipped ${r}`);
  await next.click();
  await review.getByRole("textbox", { name: "Reflection" }).fill("Mornings worked; evenings didn't.");
  await next.click();
  await expect(review).toContainText(`Carried into ${nextLabel}: ${goal}`);
  await review.getByRole("button", { name: `Finish and plan ${nextLabel}` }).click();

  // It leads straight into the next quarter's plan, with the goal carried over.
  const plan = page.getByRole("dialog", { name: "Plan the quarter" });
  await expect(plan).toBeVisible();
  await plan.getByRole("button", { name: "Continue" }).click();
  await expect(plan.getByRole("button", { name: goal })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Close (progress is saved)" }).click();
  await page.goto("/quarter");
  await expect(page.getByText(/reviewed/)).toBeVisible();
});
