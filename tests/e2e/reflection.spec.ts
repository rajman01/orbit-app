import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { addToday, run, waitForSynced } from "./helpers";

test.use({ storageState: "test-results/.auth.json" });

/** Phase 2D.3: journal, the Shutdown filling it in, wins, goal updates, habit history. */
test("write in the journal with a prompt; the evening Shutdown adds mood, energy and its line", async ({
  page,
}, info) => {
  test.skip(info.project.name === "phone", "One run is enough: today's entry is shared");
  const r = run();
  // The whole test happens on one evening, after the Shutdown time.
  const evening = new Date();
  evening.setHours(22, 30, 0, 0);
  await page.clock.install({ time: evening });
  await page.goto("/journal");
  await waitForSynced(page);
  const box = page.getByRole("textbox", { name: "Journal entry" });
  await box.fill(`Morning pages ${r}`);
  await page.getByRole("button", { name: "Prompt" }).click();
  await page.getByRole("menuitem", { name: /What did I learn today/ }).click();
  await expect(box).toHaveValue(new RegExp(`Morning pages ${r}\\n\\n\\*\\*What did I learn today\\?\\*\\*`));
  await box.press("End");
  await box.pressSequentially("Patience.");
  await box.blur();
  await waitForSynced(page);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Journal entry" })).toHaveValue(/Patience\./);

  // The evening Shutdown. Other tests leave tasks planned for today, and deciding on each one
  // isn't what this test is about: Gentle lets the Shutdown go on past them (restored below).
  await page.goto("/settings");
  const strictness = page.getByRole("radiogroup", { name: "Strictness" });
  const before = (await strictness.getByRole("radio", { checked: true }).textContent())?.trim() ?? "Firm";
  await strictness.getByRole("radio", { name: "Gentle" }).click();
  await expect(strictness.getByRole("radio", { name: "Gentle" })).toBeChecked();
  await waitForSynced(page);
  try {
    await shutdown(page, r);
  } finally {
    await page.goto("/settings");
    const restore = page.getByRole("radiogroup", { name: "Strictness" }).getByRole("radio", { name: before });
    await restore.click();
    await expect(restore).toBeChecked();
    await waitForSynced(page);
  }

  await page.goto("/journal");
  await expect(page.getByRole("textbox", { name: "Journal entry" })).toHaveValue(
    new RegExp(`Patience\\.\\n\\nShipped it ${r}$`),
  );
  await expect(
    page.getByRole("radiogroup", { name: "Mood", exact: true }).getByRole("radio", { name: "Good" }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(
    page.getByRole("radiogroup", { name: "Energy", exact: true }).getByRole("radio", { name: "Steady" }),
  ).toHaveAttribute("aria-checked", "true");
});

/** Closes today with the Shutdown: past what was planned, then mood, energy and a line. */
async function shutdown(page: import("@playwright/test").Page, r: string) {
  await page.goto("/today");
  await page.getByRole("button", { name: /Shut down the day/ }).click();
  const dialog = page.getByRole("dialog", { name: "Shut down the day" });
  const cont = dialog.getByRole("button", { name: "Continue" });
  await cont.click();
  await cont.click();
  await dialog.getByRole("radiogroup", { name: "Mood", exact: true }).getByRole("radio", { name: /Good/ }).click();
  await dialog
    .getByRole("radiogroup", { name: "Energy", exact: true })
    .getByRole("radio", { name: /Steady/ })
    .click();
  await cont.click();
  await dialog.getByRole("textbox", { name: "One line about today" }).fill(`Shipped it ${r}`);
  await cont.click();
  await dialog.getByRole("button", { name: "Close the day" }).click();
  await expect(dialog).toHaveCount(0);
}

test("log a finished task as a win, export the wins, post a goal update", async ({ page }) => {
  const r = run();
  const title = `Sent the portfolio ${r}`;
  await page.goto("/today");
  await waitForSynced(page);
  await addToday(page, title);
  await page
    .getByRole("checkbox", { name: `Complete ${title}` })
    .first()
    .click();
  await page
    .getByRole("button", { name: `Open ${title}` })
    .first()
    .click();
  await page.getByRole("button", { name: "Log as win" }).click();
  await expect(page.getByRole("link", { name: "In your wins" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/wins");
  await expect(page.getByText(title)).toBeVisible();
  await expect(page.getByText("From a task").first()).toBeVisible();
  // A win of your own, with impact.
  await page.getByRole("button", { name: "Log a win" }).click();
  const form = page.getByRole("dialog", { name: "Log a win" });
  await form.getByRole("textbox", { name: "What did you achieve?" }).fill(`Ran 10k ${r}`);
  await form.getByRole("textbox", { name: "Impact" }).fill(`First time under an hour ${r}`);
  await form.getByRole("button", { name: "Log win" }).click();
  await expect(form).toHaveCount(0);
  await expect(page.getByText(`First time under an hour ${r}`)).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export as markdown" }).click();
  const file = await (await download).path();
  const md = readFileSync(file, "utf8");
  expect(md).toContain(`**Ran 10k ${r}**`);
  expect(md).toContain(`*Impact:* First time under an hour ${r}`);
  expect(md).toContain(`**${title}**`);

  // A goal's updates feed: a note and a health change.
  await page.goto("/goals");
  await page.getByRole("button", { name: "New goal" }).click();
  await page.getByRole("textbox", { name: "Goal", exact: true }).fill(`Get fit ${r}`);
  await page.getByRole("button", { name: "Create goal" }).click();
  await expect(page).toHaveURL(/\/goal\?id=/);
  await page.getByRole("textbox", { name: "Post an update" }).fill("Three runs this week");
  await page.getByRole("button", { name: "Post update" }).click();
  await page.getByRole("button", { name: "Health" }).click();
  await page.getByRole("menuitem", { name: "At risk" }).click();
  const feed = page.getByRole("list", { name: "Goal updates" });
  await expect(feed.getByRole("listitem")).toHaveCount(2);
  await expect(feed.getByRole("listitem").first()).toContainText("Health: At risk");
  await expect(feed).toContainText("Three runs this week");
});

test("a habit shows its history and consistency", async ({ page }) => {
  const r = run();
  const name = `Stretch ${r}`;
  await page.goto("/habits");
  await waitForSynced(page);
  await page.getByRole("button", { name: "New habit" }).click();
  const dialog = page.getByRole("dialog", { name: "New habit" });
  await dialog.getByRole("textbox", { name: "Habit" }).fill(name);
  await dialog.getByRole("button", { name: "Add habit" }).click();
  await page.getByRole("checkbox", { name: `Check in ${name}` }).click();
  const history = page.getByRole("region", { name: "History" });
  await expect(history.getByRole("img", { name: `${name}: 100% over 30 days, 100% over 90 days` })).toBeVisible();
  // Tidy up (the account is shared).
  await page.getByRole("button", { name: `More for ${name}` }).click();
  await page.getByRole("menuitem", { name: "Archive" }).click();
});
