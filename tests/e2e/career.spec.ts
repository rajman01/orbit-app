import { expect, test } from "@playwright/test";
import { run, waitForSynced } from "./helpers";

test.use({ storageState: "test-results/.auth.json" });

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Phase 3B: skills (CAR-2) and the learning queue linked to them (CAR-3). */
test("a skill with something to learn from: level up, start, finish", async ({ page }) => {
  const r = run();
  const name = `System design ${r}`;
  const book = `Designing Data-Intensive Applications ${r}`;
  await page.goto("/skills");
  await waitForSynced(page);
  await page.getByRole("button", { name: "New skill" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New skill" });
  await dialog.getByRole("textbox", { name: "Skill" }).fill(name);
  await dialog.getByRole("combobox", { name: "Category" }).fill("Engineering");
  await dialog.getByRole("button", { name: "Set level now to 2: Beginner" }).click();
  await dialog.getByRole("button", { name: "Set target level to 4: Skilled" }).click();
  await dialog.getByRole("button", { name: "Add skill" }).click();

  // It opens the skill's page.
  await expect(page).toHaveURL(/\/skill\?id=/);
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
  await expect(page.getByRole("region", { name: "Level" })).toContainText("Beginner");
  await expect(page.getByRole("region", { name: "Level" })).toContainText("Aiming for Skilled");
  await page.getByRole("button", { name: `Set ${name} to 3: Practising` }).click();
  await expect(page.getByRole("region", { name: "Level" })).toContainText("Practising");

  await page.getByRole("button", { name: "Add something to learn from" }).click();
  const add = page.getByRole("dialog", { name: "Add to learn" });
  await add.getByRole("textbox", { name: "Title" }).fill(book);
  await expect(add.getByRole("combobox", { name: "For the skill" })).toHaveValue(/.+/);
  await add.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("link", { name: `Open ${book}` })).toBeVisible();

  // The learning queue: up next → in progress → done.
  await page.goto("/learning");
  const upNext = page.getByRole("list", { name: "Up next" });
  await expect(upNext.getByRole("link", { name: `Open ${book}` })).toContainText(name);
  await upNext.getByRole("button", { name: `Start ${book}` }).click();
  const inProgress = page.getByRole("list", { name: "In progress" });
  await expect(inProgress.getByRole("link", { name: `Open ${book}` })).toBeVisible();
  await inProgress.getByRole("button", { name: `Finish ${book}` }).click();
  await expect(page.getByRole("link", { name: `Open ${book}` })).toBeHidden();
  await page.getByRole("button", { name: "Show finished" }).click();
  await expect(page.getByRole("list", { name: "Done" }).getByRole("link", { name: `Open ${book}` })).toBeVisible();

  // The skills list shows it with its category and level.
  await page.goto("/skills");
  await expect(page.getByRole("link", { name: new RegExp(name) })).toContainText("Practising → Skilled");
});

/** CAR-4: the job search board. */
test("a job lead with a next step due, moved along the board and closed", async ({ page, isMobile }) => {
  const r = run();
  const company = `Acme ${r}`;
  // Midday, so "today" is the same for the browser and the app's timezone.
  const noon = new Date();
  noon.setHours(12, 0, 0, 0);
  await page.clock.install({ time: noon });

  await page.goto("/jobs");
  await waitForSynced(page);
  await page.getByRole("radio", { name: "Pipeline" }).click();
  await page.getByRole("button", { name: "New lead" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New lead" });
  await dialog.getByRole("textbox", { name: "Company" }).fill(company);
  await dialog.getByRole("textbox", { name: "Role" }).fill("Product Designer");
  await dialog.getByRole("textbox", { name: "Next step" }).fill("Send the portfolio");
  await dialog.locator('input[type="date"]').fill(iso(noon));
  await dialog.getByRole("button", { name: "Add lead" }).click();

  const card = page.getByRole("button", { name: `Open ${company}, Product Designer` });
  await expect(
    page
      .getByRole("region", { name: "Researching" })
      .getByRole("button", { name: `Open ${company}, Product Designer` }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Next steps due" })).toContainText(`${company} · Send the portfolio`);

  // Move it to Applied: by dragging on desktop, from its dialog on phones.
  if (!isMobile) {
    const target = page.getByRole("region", { name: "Applied" });
    await card.scrollIntoViewIfNeeded();
    const from = (await card.boundingBox())!;
    const to = (await target.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 20, from.y + from.height / 2 + 5, { steps: 3 });
    await page.mouse.move(to.x + to.width / 2, to.y + 60, { steps: 12 });
    await page.mouse.up();
  } else {
    // A card opens the lead's page; Edit changes the stage.
    await card.click();
    await page.getByRole("button", { name: "Edit lead" }).click();
    const edit = page.getByRole("dialog", { name: company });
    await edit.getByRole("combobox", { name: "Stage" }).selectOption("applied");
    await edit.getByRole("button", { name: "Save" }).click();
    await expect(edit).toBeHidden();
    await page.goto("/jobs");
  }
  await expect(
    page.getByRole("region", { name: "Applied" }).getByRole("button", { name: `Open ${company}, Product Designer` }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Job search" })).toBeVisible();
  await expect(page.getByText(/\d+ applied ·/)).toBeVisible();

  // Close it with an outcome.
  // (Scoped to the column: the drag preview can linger for a moment after the drop.)
  await page
    .getByRole("region", { name: "Applied" })
    .getByRole("button", { name: `Open ${company}, Product Designer` })
    .click();
  await expect(page).toHaveURL(/\/jobs\/lead\?id=/);
  await page.getByRole("button", { name: "Edit lead" }).click();
  const edit = page.getByRole("dialog", { name: company });
  await edit.getByRole("combobox", { name: "Stage" }).selectOption("closed");
  await edit.getByRole("combobox", { name: "How it ended" }).selectOption("rejected");
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(edit).toBeHidden();
  await page.goto("/jobs");
  const closed = page
    .getByRole("region", { name: "Closed" })
    .getByRole("button", { name: `Open ${company}, Product Designer` });
  await expect(closed).toContainText("Rejected");
  // Closed leads have no next step due (the box goes once nothing is due).
  await expect(page.getByRole("region", { name: "Next steps due" }).filter({ hasText: company })).toHaveCount(0);
});
