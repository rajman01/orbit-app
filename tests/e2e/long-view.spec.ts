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
