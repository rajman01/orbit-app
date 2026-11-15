import { expect, test } from "@playwright/test";
import { run, waitForSynced } from "./helpers";

test.use({ storageState: "test-results/.auth.json" });

/**
 * Phase 3D: the job assistant end to end — profile from a pasted CV → add a job by its text →
 * make it a lead → prepare the pack (the scripted model in tests) → download the PDF → applied.
 */
test("profile from a CV, a job added and tailored, the CV downloaded, applied", async ({ page }) => {
  const r = run();
  // Synced first: a new profile opens "Start from your CV" at once, which hides the rest of the page.
  await page.goto("/today");
  await waitForSynced(page);
  await page.goto("/jobs/profile");
  // The first run opens "Start from my CV" itself; later runs (shared account) use the button.
  const paste = page.getByRole("dialog", { name: "Start from your CV" });
  if (!(await paste.isVisible())) await page.getByRole("button", { name: /from (my|a) CV/ }).click();
  await paste
    .getByRole("textbox", { name: "Your CV" })
    .fill(
      [
        `Ada Obi ${r}`,
        "Product designer, fintech",
        "Senior Product Designer at Paystack (2021-03 – now)",
        "- Redesigned checkout, lifting conversion by 12%",
        "- Led design for 3 merchant products",
        "Product Designer at Andela (2018-06 – 2021-02)",
        "- Built the first design system in Figma",
        "Skills: Figma, user research, design systems",
      ].join("\n"),
    );
  await paste.getByRole("button", { name: "Fill in my profile" }).click();
  await expect(paste).toBeHidden();
  await expect(page.getByRole("listitem", { name: "Role 1" }).getByRole("textbox", { name: "Company" })).toHaveValue(
    "Paystack",
  );

  const roles = page.getByRole("textbox", { name: "Roles", exact: true });
  if (!(await page.getByRole("button", { name: "Remove Product designer" }).count())) {
    await roles.fill("Product designer");
    await roles.press("Enter");
  }
  const remote = page.getByRole("group", { name: "Markets" }).getByRole("button", { name: "Remote, worldwide" });
  if ((await remote.getAttribute("aria-pressed")) !== "true") await remote.click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Profile saved")).toBeVisible();

  // Add a job by pasting its text (as for a LinkedIn posting).
  await page.goto("/jobs");
  await page.getByRole("radio", { name: /Found for you/ }).click();
  await page.getByRole("button", { name: "Add a job link" }).click();
  const add = page.getByRole("dialog", { name: "Add a job" });
  await add.getByRole("button", { name: "Paste the text instead" }).click();
  await add
    .getByRole("textbox", { name: "Job text" })
    .fill(
      [
        `Lead Product Designer ${r}`,
        "Northwind",
        "Remote. You'll own our merchant dashboard: research with users, prototypes in Figma and a design system.",
      ].join("\n"),
    );
  await add.getByRole("button", { name: "Add and rank" }).click();
  await expect(page.getByText("Added to your saved roles")).toBeVisible();
  await page.getByRole("button", { name: /^Saved/ }).click();
  const card = page
    .getByRole("list", { name: "Saved roles" })
    .getByRole("listitem")
    .filter({ hasText: `Lead Product Designer ${r}` });
  await expect(card).toContainText("Northwind");
  await expect(card.getByLabel(/% fit/)).toBeVisible();
  await card.getByRole("button", { name: "Make a lead" }).click();

  // The lead page: prepare the pack.
  await expect(page).toHaveURL(/\/jobs\/lead\?id=/);
  await expect(page.getByRole("heading", { level: 1, name: `Lead Product Designer ${r}` })).toBeVisible();
  await page.getByRole("button", { name: "Prepare application" }).click();
  await expect(page.getByText("Every line traces back to your profile.")).toBeVisible({ timeout: 30_000 });
  const cv = page.getByRole("article", { name: "Tailored CV" });
  await expect(cv).toContainText("Senior Product Designer · Paystack");
  await expect(cv.getByRole("textbox", { name: "Bullet 1 at Paystack" })).toHaveValue(
    "Redesigned checkout, lifting conversion by 12%",
  );

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CV (PDF)" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^Ada-Obi-.*-CV-Northwind\.pdf$/);

  await page.getByRole("radio", { name: "Letter" }).click();
  await expect(page.getByRole("textbox", { name: "Cover letter" })).toHaveValue(/Northwind/);
  await page.getByRole("radio", { name: "Note" }).click();
  await expect(page.getByRole("textbox", { name: "Note to a recruiter or hiring manager" })).toHaveValue(/Northwind/);

  // Applied: it moves on the board with a follow-up in a week.
  await page.getByRole("button", { name: "I’ve applied" }).click();
  await expect(page.getByText("Moved to Applied. Follow-up set for a week from today.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Lead" })).toContainText("Follow up if no reply");
  await page.goto("/jobs");
  await page.getByRole("radio", { name: "Pipeline" }).click();
  await expect(
    page
      .getByRole("region", { name: "Applied" })
      .getByRole("button", { name: /^Open Northwind, Lead Product Designer/ })
      .first(),
  ).toBeVisible();
});
