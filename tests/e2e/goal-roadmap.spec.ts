import { expect, test, type Page } from "@playwright/test";
import { run, waitForSynced } from "./helpers";

test.use({ storageState: "test-results/.auth.json" });

/** GOAL-10: a goal's roadmap, a path from today to its target with a stop at each dated milestone. */

async function pickDate(page: Page, button: ReturnType<Page["getByRole"]>, day: string) {
  await button.click();
  await page.locator('input[type="date"]').fill(day);
  await expect(page.locator('input[type="date"]')).toHaveCount(0);
}

async function canadaGoal(page: Page) {
  const r = run();
  const goal = `Move to Canada ${r}`;
  await page.clock.install({ time: new Date("2026-11-17T12:00:00") });
  await page.goto("/goals");
  await waitForSynced(page);
  await page.getByRole("button", { name: "New goal" }).click();
  await page.getByRole("textbox", { name: "Goal", exact: true }).fill(goal);
  await page.getByRole("button", { name: "Create goal" }).click();
  await expect(page).toHaveURL(/\/goal\?id=/);
  await expect(page.getByText("Give this goal a target date")).toBeVisible();

  await pickDate(page, page.getByRole("button", { name: "Target date" }), "2028-08-01");
  const add = page.getByRole("textbox", { name: "New milestone" });
  for (const m of ["Research visa routes", "IELTS exam", "Credential assessment"]) {
    await add.fill(m);
    await add.press("Enter");
    await expect(page.getByRole("checkbox", { name: `Milestone done: ${m}` })).toBeVisible();
  }
  const dates = page.getByRole("button", { name: "Milestone date" });
  await pickDate(page, dates.nth(0), "2026-10-20");
  await pickDate(page, dates.nth(1), "2027-02-01");
  await pickDate(page, dates.nth(2), "2027-05-01");
  await page.getByRole("checkbox", { name: "Milestone done: Research visa routes" }).click();
  return goal;
}

test("a goal's roadmap: stops along a path, opened to their tasks, dragged to a new date", async ({ page }, info) => {
  test.skip(info.project.name === "phone", "the phone test covers the journey view");
  await canadaGoal(page);
  const road = page.getByRole("region", { name: "Roadmap" });
  await expect(road).toContainText("1 of 3 milestones done · Target Aug 2028");
  await expect(road.getByRole("button", { name: /^Milestone: Research visa routes, Oct 2026, done/ })).toBeVisible();
  const ielts = road.getByRole("button", { name: /^Milestone: IELTS exam, Feb 2027, up next/ });
  await expect(ielts).toBeVisible();
  await expect(road.getByRole("button", { name: /^Milestone: Credential assessment, May 2027, later/ })).toBeVisible();
  await expect(road.getByRole("img", { name: "Target: Aug 2028" })).toBeVisible();

  // Tapped, a stop opens its card; a task added there belongs to that milestone.
  await ielts.click();
  const card = page.getByRole("region", { name: "Milestone IELTS exam" });
  await expect(card).toContainText("No tasks yet");
  await card.getByRole("button", { name: "Add a task to this milestone" }).click();
  await page.keyboard.type("Book the test date");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(card).toContainText("Book the test date");
  await expect(card).toContainText("0 of 1 tasks done");

  // Dragged along the path, the stop moves to a later date.
  const box = (await ielts.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 60, cy, { steps: 6 });
  await page.mouse.up();
  await expect(road.getByRole("button", { name: /^Milestone: IELTS exam, (Mar|Apr) 2027/ })).toBeVisible();

  // The arrow keys move it a week at a time.
  const moved = road.getByRole("button", { name: /^Milestone: IELTS exam/ });
  const date = card.getByRole("button", { name: "Milestone date" });
  const before = await date.textContent();
  await moved.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(date).not.toHaveText(before!);
});

test("on a phone the roadmap is a journey from top to bottom", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "the desktop test covers the path");
  const goal = await canadaGoal(page);
  const stops = page.getByRole("list", { name: "Roadmap stops" });
  await expect(stops.getByRole("listitem")).toHaveText([
    /2026Research visa routes/,
    /You are here/,
    /2027IELTS exam.*Up next/,
    /Credential assessment.*Later/,
    new RegExp(goal),
  ]);
  await stops.getByRole("button", { name: /^Milestone: IELTS exam/ }).click();
  await expect(page.getByRole("region", { name: "Milestone IELTS exam" })).toContainText("No tasks yet");

  // All goals together: the year's timeline, from the Goals page.
  await page.goto("/goals");
  await page.getByRole("link", { name: "All goals on a timeline" }).click();
  await expect(page.getByRole("region", { name: "Goals timeline" }).getByRole("link", { name: goal })).toBeVisible();
});
