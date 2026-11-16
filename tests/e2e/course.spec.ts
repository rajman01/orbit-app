import { expect, test } from "@playwright/test";
import { run, waitForSynced } from "./helpers";

test.use({ storageState: "test-results/.auth.json" });

/** Phase 3F (CAR-6): a course in sections, planned to a date, ticked off part by part. */
test("a course split from a syllabus, planned, ticked and unplanned", async ({ page }) => {
  const r = run();
  const course = `SQL for analysts ${r}`;
  const noon = new Date();
  noon.setHours(12, 0, 0, 0);
  await page.clock.install({ time: noon });

  await page.goto("/learning");
  await waitForSynced(page);
  await page.getByRole("textbox", { name: "Something to learn from" }).fill(course);
  await page.getByRole("combobox", { name: "Kind" }).selectOption("course");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("link", { name: `Open ${course}` }).click();
  await expect(page).toHaveURL(/\/learning\/item\?id=/);
  await expect(page.getByRole("heading", { name: course, level: 1 })).toBeVisible();

  // One by hand, then a pasted syllabus.
  await page.getByRole("textbox", { name: "New section" }).fill("Setting up");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Paste a syllabus or table of contents" }).click();
  const paste = page.getByRole("dialog", { name: "Paste the sections" });
  await paste
    .getByRole("textbox", { name: "Sections to paste" })
    .fill("Week 1: Foundations (45 min)\nWeek 2: Joins (90 min)\nWeek 3: Indexes");
  await expect(paste).toContainText("3 sections, 2 with a length");
  await paste.getByRole("button", { name: "Add 3 sections" }).click();
  const sections = page.getByRole("list", { name: "Sections" });
  await expect(sections.getByRole("listitem")).toHaveCount(4);
  await expect(sections.getByRole("listitem").nth(2)).toContainText("Joins");
  await expect(sections.getByRole("listitem").nth(2)).toContainText("1.5 h");

  // Reorder: Setting up is already first; move Indexes above Joins.
  await page.getByRole("button", { name: "Move Indexes up" }).click();
  await expect(sections.getByRole("listitem").nth(2)).toContainText("Indexes");

  // Plan it: the preview says how it fits, then the sections become tasks.
  await page.getByRole("button", { name: "Plan it" }).click();
  const plan = page.getByRole("dialog", { name: "Plan it" });
  await plan.getByRole("combobox", { name: "Time a day" }).selectOption("60");
  await expect(plan).toContainText("4 sections over");
  await plan.getByRole("button", { name: "Plan it" }).click();
  await expect(page.getByText("Planned 4 sections")).toBeVisible();
  const progress = page.getByRole("region", { name: "Progress" });
  await expect(progress).toContainText("0 of 4 sections");
  await expect(progress).toContainText("On pace");
  await expect(progress).toContainText("next: Setting up");

  // Ticking a section ticks its task and moves the course on.
  await page.getByRole("checkbox", { name: "Done: Setting up" }).click();
  await expect(progress).toContainText("1 of 4 sections");
  await expect(progress).toContainText("25%");
  await expect(progress).toContainText("next: Foundations");

  // Its tasks are ordinary tasks.
  await page.goto("/tasks");
  await expect(page.getByText(`${course}: Foundations`).first()).toBeVisible();

  // Removing the plan keeps the sections and progress.
  await page.goBack();
  await page.getByRole("button", { name: "Remove the plan" }).click();
  await page.getByRole("dialog", { name: "Remove the plan?" }).getByRole("button", { name: "Remove the plan" }).click();
  await expect(progress).not.toContainText("On pace");
  await expect(progress).toContainText("1 of 4 sections");
  await expect(page.getByRole("button", { name: "Plan it" })).toBeVisible();
});
