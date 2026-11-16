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

test("the playable Today: tick, put one off and get asked why, start the timer", async ({ page }) => {
  await page.goto("/");
  const demo = page.getByRole("list", { name: "Sample must-dos" });
  await demo.scrollIntoViewIfNeeded();
  await demo.getByRole("checkbox", { name: "Done: Call mum" }).click();
  await expect(page.getByText("Must-dos · 1 of 3 done")).toBeVisible();
  await expect(page.getByText("10 XP", { exact: true })).toBeVisible();

  // Putting off the stale one asks why; "Too big" offers a first step.
  await page.getByRole("button", { name: "Update my CV: Not today" }).click();
  const why = page.getByRole("group", { name: "Why are you putting this off?" });
  await why.getByRole("button", { name: "Too big" }).click();
  await expect(why).toContainText("Open the doc and rewrite the summary (2 min)");
  await why.getByRole("button", { name: "Start 5 minutes" }).click();
  const timer = page.getByRole("group", { name: "Focus timer" });
  await expect(timer).toContainText("Update my CV");
  await expect(timer).toContainText(/0[45]:\d\d/);
  // Finishing a task you'd put off three times earns a bonus.
  await timer.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("35 XP", { exact: true })).toBeVisible();

  // "No time" moves it; Start over puts everything back.
  await page.getByRole("button", { name: "Move £50 to savings: Not today" }).click();
  await why.getByRole("button", { name: "No time" }).click();
  await why.getByRole("button", { name: "Move it" }).click();
  await expect(page.getByText("Moved to Thursday: Move £50 to savings")).toBeVisible();
  await page.getByRole("button", { name: "Start over" }).click();
  await expect(page.getByText("Must-dos · 0 of 3 done")).toBeVisible();
  await expect(page.getByText("0 XP", { exact: true })).toBeVisible();
});

test("how it works: four steps, each with its screen", async ({ page }) => {
  await page.goto("/");
  const how = page.getByRole("region", { name: "One loop, every two weeks." });
  for (const step of ["Capture", "Plan", "Do", "Review"])
    await expect(how.getByRole("heading", { name: step, exact: true })).toBeAttached();
  // The step being read shows its screen in the phone (wide screens).
  if (test.info().project.name === "desktop") {
    await how.getByRole("heading", { name: "Review", exact: true }).scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -window.innerHeight / 2 + 40));
    await expect(how.getByText("Level 7 · +240 XP").first()).toBeVisible();
  }
  await expect(
    page.getByText("I built Orbit because I’m a world-class procrastinator.", { exact: false }),
  ).toBeAttached();
});

test("link previews: the page has preview tags and the image renders", async ({ page, request }) => {
  await page.goto("/");
  const og = (p: string) => page.locator(`meta[property="${p}"]`).getAttribute("content");
  expect(await og("og:title")).toBe("Orbit — Linear for your life");
  expect(await og("og:site_name")).toBe("Orbit");
  const image = await og("og:image");
  expect(image).toMatch(/^https?:\/\/.+\/opengraph-image/);
  expect(await page.locator('meta[name="twitter:card"]').getAttribute("content")).toBe("summary_large_image");
  expect(await og("og:image:width")).toBe("1200");
  // Fetch it from this server (the tag carries the production address).
  const res = await request.get(new URL(image!).pathname + new URL(image!).search);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("image/png");
  expect((await res.body()).length).toBeGreaterThan(20_000);
});

test("the guide: linked from the landing page, every section reachable, no sideways scrolling", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Read the guide to using Orbit →" }).click();
  await expect(page).toHaveURL(/\/guide$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("How to use Orbit, all of it.");
  const sections = page.locator("main section[id]");
  await expect(sections).toHaveCount(23);
  // The contents list links to every section.
  const phone = test.info().project.name === "phone";
  if (phone) await page.locator("summary", { hasText: "Contents" }).click();
  const toc = page.getByRole("navigation", { name: "Guide contents" }).or(page.locator("details"));
  await toc.getByRole("link", { name: "The coach" }).first().click();
  await expect(page).toHaveURL(/#coach$/);
  await expect(page.getByRole("heading", { name: "The coach", level: 2 })).toBeInViewport();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
