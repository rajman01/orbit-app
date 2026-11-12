import { expect, test } from "@playwright/test";

test("landing page shows the pitch and a way in, without sideways scrolling", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Stop planning");
  const cta = page.getByRole("link", { name: /Get started/ }).first();
  await expect(cta).toBeVisible();
  await expect(cta).toHaveAttribute("href", "/sign-up");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  // Sections clip overflow, so also check that no text runs past the right edge.
  const clipped = await page.evaluate(
    () =>
      [...document.querySelectorAll("main h1, main h2, main p")].filter(
        (el) => el.getBoundingClientRect().right > window.innerWidth + 1,
      ).length,
  );
  expect(clipped).toBe(0);
});
