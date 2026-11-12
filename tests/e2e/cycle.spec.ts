import { expect, test, type Page } from "@playwright/test";
import { addToday, run, waitForSynced } from "./helpers";

test.use({ storageState: "test-results/.auth.json" });

/**
 * Phase 1C: cycles and rituals. The account is fresh for each run but shared by the desktop and
 * phone projects, so tests that need a particular day move the browser's date (as week.spec does)
 * and each project gets its own days. The account's timezone is UTC.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

async function openPanel(page: Page, title: string) {
  await page
    .getByRole("button", { name: `Open ${title}` })
    .first()
    .click();
}

test("plan a cycle: pull a task in, estimate it, and commit", async ({ page }) => {
  const r = run();
  const title = `Cycle task ${r}`;
  await page.goto("/today");
  await waitForSynced(page);
  await addToday(page, title);

  await page.goto("/cycle?tab=plan");
  await page.getByRole("textbox", { name: "Search tasks" }).fill(r);
  await page.getByRole("button", { name: `Add ${title} to the cycle` }).click();
  const row = page.getByRole("listitem").filter({ hasText: title });
  await expect(row.getByRole("button", { name: `Remove ${title} from the cycle` })).toBeVisible();
  await row.getByRole("button", { name: "Effort" }).click();
  await page.getByRole("menuitem", { name: /3 points/ }).click();
  await expect(row.getByRole("button", { name: "Effort" })).toHaveText(/3 pts/);

  const commit = page.getByRole("button", { name: /^Commit to cycle \d+$/ });
  await expect(commit).toBeDisabled();
  await page.getByRole("checkbox", { name: /I commit to these/ }).check();
  const number = (await commit.textContent())!.match(/\d+/)![0];
  await commit.click();
  await expect(page.getByText(`Committed to cycle ${number}`)).toBeVisible();

  // The task now belongs to that cycle.
  await page.goto("/today");
  await openPanel(page, title);
  await expect(page.getByRole("button", { name: "Cycle", exact: true })).toContainText(`Cycle ${number}`);
});

test("daily plan works offline, and a skipped shutdown is picked up the next morning", async ({
  page,
  context,
}, info) => {
  test.setTimeout(120_000);
  const r = run();
  const title = `Plan task ${r}`;
  // Days of their own, well clear of the ones week.spec uses.
  const start = Math.floor(Date.now() / DAY) * DAY + (info.project.name === "phone" ? 7 : 5) * DAY;

  await page.clock.install({ time: new Date(start + 9 * HOUR) });
  await page.goto("/today");
  await waitForSynced(page);
  await addToday(page, title);
  await waitForSynced(page);

  await context.setOffline(true);
  await page.getByRole("button", { name: /Plan your day/ }).click();
  const dialog = page.getByRole("dialog", { name: "Plan your day" });
  await expect(dialog).toBeVisible();
  // Closing keeps the progress; the card offers to resume.
  await dialog.getByRole("button", { name: /Close/ }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: /Plan your day/ }).click();
  await expect(dialog).toBeVisible();
  // Earlier tests left tasks on earlier days; tick them off so yesterday is clear.
  const leftover = dialog.getByRole("button", { name: /^Mark .* done$/ });
  for (let i = 0; i < 30 && (await leftover.count()); i++) {
    await leftover.first().click();
    await page.waitForTimeout(100);
  }
  await dialog.getByRole("button", { name: "Continue" }).click(); // yesterday
  await dialog.getByRole("button", { name: /Continue|Leave the rest/ }).click(); // inbox
  await dialog.getByRole("button", { name: `Make ${title} a Must-do` }).click();
  await expect(dialog.getByRole("button", { name: `Remove ${title} from Must-dos` })).toBeVisible();
  await dialog.getByRole("button", { name: "Continue" }).click(); // must-dos
  await dialog.getByRole("textbox", { name: title }).fill(`Open the notes ${r}`);
  await dialog.getByRole("textbox", { name: title }).press("Enter");
  await dialog.getByRole("button", { name: "Continue" }).click(); // first steps
  await expect(dialog.getByText(`↳ Open the notes ${r}`)).toBeVisible();
  await dialog.getByRole("button", { name: "Commit to my day" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Plan your day/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: `Remove ${title} from Must-dos` })).toBeVisible();

  await context.setOffline(false);
  await waitForSynced(page);

  // No shutdown that evening. Next morning, the plan starts by closing out yesterday.
  await page.clock.setSystemTime(new Date(start + DAY + 8 * HOUR));
  await page.reload();
  const card = page.getByRole("button", { name: /Plan your day/ });
  await expect(card).toContainText("Includes closing out yesterday");
  await card.click();
  const next = page.getByRole("dialog", { name: "Plan your day" });
  await expect(next.getByText("Last night's shutdown didn't happen")).toBeVisible();
  // Firm: each leftover needs a decision before moving on.
  const cont = next.getByRole("button", { name: "Continue" });
  await expect(cont).toBeDisabled();
  await next.getByRole("button", { name: `Do ${title} today` }).click();
  await expect(cont).toBeEnabled();
});

test("cycle review: every unfinished task is decided, then the next cycle is planned", async ({ page }, info) => {
  test.skip(info.project.name === "phone", "A cycle can only be reviewed once, and the account is shared");
  test.setTimeout(150_000);
  const r = run();
  const roll = `Roll over ${r}`;
  const shelve = `Shelve ${r}`;

  await page.goto("/today");
  await waitForSynced(page);
  for (const t of [roll, shelve]) {
    await addToday(page, t);
    await openPanel(page, t);
    await page.getByRole("button", { name: "Cycle", exact: true }).click();
    await page.getByRole("menuitem", { name: /\(now\)/ }).click();
    await expect(page.getByRole("button", { name: "Cycle", exact: true })).toContainText("(now)");
    await page.getByRole("button", { name: "Close" }).first().click();
  }
  await waitForSynced(page);

  // Jump to the cycle's last day, after the review time (18:00).
  await page.goto("/cycle");
  const left = Number(
    (await page
      .getByText(/(\d+) days left|Last day/)
      .first()
      .textContent())!.match(/\d+/)?.[0] ?? 1,
  );
  const lastDay = Math.floor(Date.now() / DAY) * DAY + (left - 1) * DAY;
  await page.clock.install({ time: new Date(lastDay + 19 * HOUR) });
  await page.goto("/today");
  const card = page.getByRole("button", { name: /Review cycle \d+/ });
  await expect(card).toBeVisible();
  const number = Number((await card.textContent())!.match(/Review cycle (\d+)/)![1]);
  await card.click();

  const dialog = page.getByRole("dialog", { name: "Review the cycle" });
  await expect(dialog.getByRole("heading", { name: `Cycle ${number} in numbers` })).toBeVisible();
  await dialog.getByRole("button", { name: "Continue" }).click();

  // Nothing rolls over by itself.
  const cont = dialog.getByRole("button", { name: "Continue" });
  await expect(cont).toBeDisabled();
  await dialog.getByRole("button", { name: `Roll ${roll} over to cycle ${number + 1}` }).click();
  await dialog.getByRole("button", { name: `Move ${shelve} back to the backlog` }).click();
  // Anything else this run put in the cycle goes back to the backlog too.
  const back = dialog.getByRole("button", { name: /back to the backlog$/ });
  for (let i = 0; i < 20 && !(await cont.isEnabled()); i++) {
    await back
      .first()
      .click({ timeout: 3_000 })
      .catch(() => {});
  }
  await expect(cont).toBeEnabled();
  await cont.click(); // unfinished
  await cont.click(); // goals
  await cont.click(); // stale
  await dialog.getByRole("textbox", { name: "Win 1" }).fill(`Shipped the review ${r}`);
  await cont.click(); // wins
  await dialog.getByRole("textbox", { name: "What went well?" }).fill("Mornings");
  await cont.click(); // reflect

  // Plan the next cycle inside the review: the rolled-over task is already in it.
  await expect(dialog.getByRole("heading", { name: `Plan cycle ${number + 1}` })).toBeVisible();
  await expect(dialog.getByRole("button", { name: `Remove ${roll} from the cycle` })).toBeVisible();
  await dialog.getByRole("checkbox", { name: /I commit to these/ }).check();
  await dialog.getByRole("button", { name: `Commit to cycle ${number + 1}` }).click();
  await expect(page.getByText(`Committed to cycle ${number + 1}`)).toBeVisible();
  await dialog.getByRole("button", { name: "Finish the review" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Review cycle/ })).toHaveCount(0);

  await page.goto("/cycle?tab=review");
  // Listed under past cycles (on its last day it is also still the cycle in the header).
  await expect(page.getByRole("listitem").getByText(`Cycle ${number}`, { exact: true })).toBeVisible();
  await expect(page.getByText("Went well: Mornings")).toBeVisible();
});
