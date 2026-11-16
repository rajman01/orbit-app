import { expect, test } from "@playwright/test";

test.use({ storageState: "test-results/.auth.json" });

/**
 * iOS can leave its layout as short as it was with the keyboard up after the keyboard closes,
 * so bars pinned to the bottom float mid-screen. The page can't make iOS do that here, so a
 * stand-in visual viewport reports a visible area taller than the layout, as iOS does then, and
 * the tab bar must move down to the real bottom (lib/keyboard.tsx).
 */
test("the tab bar goes back to the bottom when iOS leaves the layout short", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "the tab bar is phone-only");
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__vvExtra = 0;
    w.__vvTop = 0;
    const vv = new EventTarget() as EventTarget & Record<string, unknown>;
    Object.defineProperties(vv, {
      height: { get: () => window.innerHeight + (w.__vvExtra as number) },
      width: { get: () => window.innerWidth },
      offsetTop: { get: () => w.__vvTop as number },
      offsetLeft: { get: () => 0 },
      scale: { get: () => 1 },
    });
    Object.defineProperty(window, "visualViewport", { get: () => vv });
    w.__vv = vv;
  });
  await page.goto("/today");
  const bar = page.getByRole("navigation", { name: "Main" });
  await expect(bar).toBeVisible();
  // How far the bar is moved down, in px ("0px" or "none" when it isn't).
  const shift = () =>
    bar.evaluate((el) => Number(getComputedStyle(el).translate.split(" ")[1]?.replace("px", "") ?? 0));
  expect(await shift()).toBe(0);

  // The layout is 300px shorter than what's visible: the bar moves down 300px.
  await page.evaluate(() => {
    const w = window as unknown as { __vvExtra: number; __vv: EventTarget };
    w.__vvExtra = 300;
    w.__vv.dispatchEvent(new Event("resize"));
  });
  await expect.poll(shift).toBe(300);

  // A small gap (Safari's toolbars moving) is left alone, and when iOS catches up it resets.
  await page.evaluate(() => {
    const w = window as unknown as { __vvExtra: number; __vv: EventTarget };
    w.__vvExtra = 20;
    w.__vv.dispatchEvent(new Event("resize"));
  });
  await expect.poll(shift).toBe(0);

  // Pulling the page past its top or bottom (iOS reports the visible area as moved) leaves the
  // bar where it is.
  for (const top of [-250, 250]) {
    await page.evaluate((top) => {
      const w = window as unknown as { __vvTop: number; __vv: EventTarget };
      w.__vvTop = top;
      w.__vv.dispatchEvent(new Event("scroll"));
    }, top);
    await page.waitForTimeout(100);
    expect(await shift()).toBe(0);
  }
});
