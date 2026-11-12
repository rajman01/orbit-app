import { expect, type Page } from "@playwright/test";

/** Helpers shared by the Today specs. */

export const run = () => Math.random().toString(36).slice(2, 7);

export async function addToday(page: Page, title: string) {
  const input = page.getByRole("textbox", { name: "New task" });
  await input.fill(title);
  await input.press("Enter");
  await expect(page.getByRole("button", { name: `Open ${title}` })).toBeVisible();
}

/** The account is shared between runs: start each test with no Must-dos today. */
export async function clearMustDos(page: Page) {
  // A fresh browser starts empty: wait for the first sync so earlier runs' Must-dos are here.
  await waitForSynced(page);
  const remove = page.getByRole("button", { name: /^Remove .* from Must-dos$/ });
  for (let i = 0; i < 5 && (await remove.count()); i++) {
    await remove.first().click();
    await page.waitForTimeout(150);
  }
  await expect(remove).toHaveCount(0);
  await waitForSynced(page);
}

/** Opens the skip flow from the keyboard (the same on desktop and phone sizes). */
export async function openSkip(page: Page, title: string) {
  await page
    .getByRole("button", { name: `Open ${title}` })
    .first()
    .focus();
  await page.keyboard.press("s");
  await expect(page.getByRole("dialog", { name: `Move “${title}”` })).toBeVisible();
}

export async function waitForSynced(page: Page) {
  await expect(page.getByRole("status", { name: "All changes synced" }).first()).toBeAttached({ timeout: 15_000 });
}
