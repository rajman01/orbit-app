import { expect, test } from "@playwright/test";
import { addToday, run, waitForSynced } from "./helpers";

test.use({ storageState: "test-results/.auth.json" });

/**
 * Phase 3H: a coach conversation about one goal, task, job or course. The fake model (COACH_FAKE=1)
 * echoes the message and notes the item the context said it's about: "[about the goal “…”]".
 */

test("a goal's own conversation: opened from the goal, focused on it, picked up again later", async ({ page }) => {
  const r = run();
  const goal = `Run a half marathon ${r}`;
  await page.goto("/goals");
  await waitForSynced(page);
  await page.getByRole("button", { name: "New goal" }).click();
  await page.getByRole("textbox", { name: "Goal", exact: true }).fill(goal);
  await page.getByRole("button", { name: "Create goal" }).click();
  await expect(page).toHaveURL(/\/goal\?id=/);
  const goalUrl = page.url();

  await page.getByRole("button", { name: "Talk to the coach about this goal" }).click();
  const panel = page.getByRole("dialog", { name: "Coach" });
  await expect(panel.getByText("Goal", { exact: true })).toBeVisible();
  await expect(panel.getByRole("link", { name: goal })).toBeVisible();
  await expect(panel).toContainText("A conversation just about this goal.");
  await panel.getByRole("button", { name: "Am I on track?" }).click();
  await expect(panel.getByText(`You said: Am I on track? [about the goal “${goal}”]`)).toBeVisible({
    timeout: 15_000,
  });

  // Closed and opened again from the goal: the same conversation, carried on.
  await panel.getByRole("button", { name: "Close coach" }).click();
  await page.getByRole("button", { name: "Continue with the coach about this goal" }).click();
  await expect(panel.getByText(`You said: Am I on track?`)).toBeVisible();
  const box = panel.getByRole("textbox", { name: "Message the coach" });
  await box.fill(`still here ${r}`);
  await box.press("Enter");
  await expect(panel.getByText(`You said: still here ${r} [about the goal “${goal}”]`)).toBeVisible({
    timeout: 15_000,
  });

  // The heading goes back to the goal; the coach page lists it as the goal's conversation.
  await waitForSynced(page);
  await page.goto("/coach");
  const item = page.getByRole("button", { name: new RegExp(goal) });
  await expect(item).toContainText("Goal ·");
  await item.click();
  await expect(page.getByText(`You said: still here ${r}`)).toBeVisible();
  await page.getByRole("link", { name: goal }).click();
  await expect(page).toHaveURL(goalUrl);
});

test("a task's, a job's and a course's own conversations", async ({ page }, info) => {
  test.skip(info.project.name === "phone", "the goal test covers phones; the rest are the same panel");
  const r = run();
  const noon = new Date();
  noon.setHours(12, 0, 0, 0);
  await page.clock.install({ time: noon });
  const panel = page.getByRole("dialog", { name: "Coach" });
  const box = panel.getByRole("textbox", { name: "Message the coach" });

  // A task, from its panel; the heading opens the task again.
  const task = `Book the physio ${r}`;
  await page.goto("/today");
  await waitForSynced(page);
  await addToday(page, task);
  await page.getByRole("button", { name: `Open ${task}` }).click();
  const details = page.getByRole("complementary", { name: "Task details" });
  await details.getByRole("button", { name: "Talk to the coach about this task" }).click();
  await expect(details).toHaveCount(0);
  await expect(panel).toContainText("A conversation just about this task.");
  await box.fill("help me start");
  await box.press("Enter");
  await expect(panel.getByText(`You said: help me start [about the task “${task}”]`)).toBeVisible({
    timeout: 15_000,
  });
  await panel.getByRole("button", { name: task }).click();
  await expect(panel).toHaveCount(0);
  await expect(details).toBeVisible();
  await details.getByRole("button", { name: "Close" }).click();

  // A job lead, from its page.
  const company = `Northwind ${r}`;
  await page.goto("/jobs");
  await page.getByRole("radio", { name: "Pipeline" }).click();
  await page.getByRole("button", { name: "New lead" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New lead" });
  await dialog.getByRole("textbox", { name: "Company" }).fill(company);
  await dialog.getByRole("textbox", { name: "Role" }).fill("Data Analyst");
  await dialog.getByRole("button", { name: "Add lead" }).click();
  await page.getByRole("button", { name: `Open ${company}, Data Analyst` }).click();
  await expect(page).toHaveURL(/\/jobs\/lead\?id=/);
  await page.getByRole("button", { name: "Talk to the coach about this job" }).click();
  await expect(panel.getByText("Job", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "What should my next step be?" }).click();
  await expect(
    panel.getByText(`You said: What should my next step be? [about the job “Data Analyst at ${company}”]`),
  ).toBeVisible({ timeout: 15_000 });
  await panel.getByRole("button", { name: "Close coach" }).click();

  // A course, from its page.
  const course = `Statistics 101 ${r}`;
  await page.goto("/learning");
  await page.getByRole("textbox", { name: "Something to learn from" }).fill(course);
  await page.getByRole("combobox", { name: "Kind" }).selectOption("course");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("link", { name: `Open ${course}` }).click();
  await page.getByRole("button", { name: "Talk to the coach about this course" }).click();
  await panel.getByRole("button", { name: "Make me a study plan." }).click();
  await expect(panel.getByText(`You said: Make me a study plan. [about the course “${course}”]`)).toBeVisible({
    timeout: 15_000,
  });

  // An ordinary new chat isn't about anything.
  await panel.getByRole("button", { name: "New chat" }).click();
  await expect(panel).toContainText("Your coach");
  await box.fill(`general ${r}`);
  await box.press("Enter");
  await expect(panel.getByText(`You said: general ${r}`, { exact: true })).toBeVisible({ timeout: 15_000 });
});
