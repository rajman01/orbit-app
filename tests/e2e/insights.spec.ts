import { expect, test } from "@playwright/test";
import { addToday, run, waitForSynced } from "./helpers";

test.use({ storageState: "test-results/.auth.json" });

/** Phase 3A: Insights (INS-1–4), area health (AREA-3) and the Wheel of Life (AREA-4). */
test("the Insights page shows the sections and changes range", async ({ page }) => {
  await page.goto("/insights");
  await waitForSynced(page);
  await expect(page.getByRole("heading", { name: "Insights", level: 1 })).toBeVisible();
  for (const name of [
    "Plan finished per cycle",
    "Focus hours per week",
    "Tasks done by area",
    "Rituals",
    "Area health",
  ])
    await expect(page.getByRole("region", { name })).toBeVisible();
  await expect(page.getByRole("img", { name: /^Daily plan: \d+ of \d+$/ })).toBeVisible();
  // Mood and energy need a week of journal ratings; the shared test account may not have them.
  await expect(page.getByRole("region", { name: "On days you felt…" })).toBeVisible();

  await page.getByRole("radio", { name: "8 cycles" }).click();
  await expect(page.getByRole("radio", { name: "8 cycles" })).toBeChecked();
  await page.reload();
  await expect(page.getByRole("radio", { name: "8 cycles" })).toBeChecked();
  await page.getByRole("radio", { name: "4 cycles" }).click();
});

test("rate the Wheel of Life from Insights", async ({ page }) => {
  const area = `Wheel ${run()}`;
  await page.goto("/areas");
  await page.getByRole("button", { name: "New area" }).first().click();
  const form = page.getByRole("dialog", { name: "New area" });
  await form.getByRole("textbox").first().fill(area);
  await form.getByRole("button", { name: "Create area" }).click();
  await expect(form).toBeHidden();

  await page.goto("/insights");
  await waitForSynced(page);
  await page.getByRole("button", { name: "Rate now" }).click();
  const dialog = page.getByRole("dialog", { name: "Wheel of Life" });
  await dialog.getByRole("slider", { name: `How ${area} is going` }).fill("8");
  await dialog.getByRole("slider", { name: `How much ${area} matters` }).fill("9");
  await dialog.getByRole("button", { name: "Save rating" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Wheel of Life saved")).toBeVisible();
  await expect(page.getByRole("region", { name: "Wheel of Life" })).toContainText("Rated today");
  await expect(page.getByRole("region", { name: "Time vs what matters" })).toBeVisible();

  // Opening it again starts from what was saved.
  await page.getByRole("button", { name: "Rate now" }).click();
  await expect(dialog.getByRole("slider", { name: `How ${area} is going` })).toHaveValue("8");
  await expect(dialog.getByRole("slider", { name: `How much ${area} matters` })).toHaveValue("9");
  await page.keyboard.press("Escape");
});

test("an overdue task turns its area amber", async ({ page, isMobile }) => {
  const r = run();
  const area = `Health check ${r}`;
  const title = `Book the physio ${r}`;
  // Midday, so "yesterday" is the same day for the browser and the app's timezone.
  const noon = new Date();
  noon.setHours(12, 0, 0, 0);
  await page.clock.install({ time: noon });
  const y = new Date(noon);
  y.setDate(y.getDate() - 1);
  const yesterday = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(y.getDate()).padStart(2, "0")}`;

  await page.goto("/areas");
  await page.getByRole("button", { name: "New area" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New area" });
  await dialog.getByRole("textbox").first().fill(area);
  await dialog.getByRole("button", { name: "Create area" }).click();
  await expect(page.getByRole("img", { name: "Healthy" }).first()).toBeAttached();

  await page.goto("/today");
  await addToday(page, title);
  await page.getByRole("button", { name: `Open ${title}` }).click();
  await page.getByRole("button", { name: "Area", exact: true }).last().click();
  await page.getByRole("menuitem", { name: area }).click();
  await page.getByRole("button", { name: "Due date" }).click();
  await page.locator('input[type="date"]').last().fill(yesterday);
  await expect(page.getByRole("button", { name: "Due date" })).toHaveText(/Yesterday/);
  await page.getByRole("button", { name: "Close" }).first().click();

  await page.goto("/areas");
  await page
    .getByRole("link", { name: new RegExp(`^${area}`) })
    .first()
    .click();
  await expect(page.getByText("Needs attention · 1 overdue task")).toBeVisible();
  if (!isMobile) {
    await page.goto("/insights");
    await expect(
      page.getByRole("region", { name: "Area health" }).getByRole("link", { name: new RegExp(area) }),
    ).toContainText("1 overdue task");
  }

  // Tidy up.
  await page.goto("/today");
  await page
    .getByRole("button", { name: `Open ${title}` })
    .first()
    .focus();
  await page.keyboard.press("Delete");
  await page.getByRole("button", { name: "Delete task" }).click();
});
