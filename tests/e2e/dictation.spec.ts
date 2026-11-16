import { expect, test, type Page } from "@playwright/test";
import { waitForSynced } from "./helpers";

test.use({ storageState: "test-results/.auth.json" });

/** A stand-in for the browser's speech recognition, driven by the test (AI-10). */
async function fakeSpeech(page: Page, supported = true) {
  await page.addInitScript((supported) => {
    const w = window as unknown as Record<string, unknown>;
    delete w.webkitSpeechRecognition;
    delete w.SpeechRecognition;
    if (!supported) return;
    class Fake {
      lang = "";
      continuous = false;
      interimResults = false;
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      results: { 0: { transcript: string }; length: 1; isFinal: boolean }[] = [];
      start() {
        w.__speech = this;
      }
      stop() {
        this.onend?.();
      }
      abort() {
        this.onend?.();
      }
      say(text: string, isFinal: boolean) {
        const last = this.results[this.results.length - 1];
        const r = { 0: { transcript: text }, length: 1 as const, isFinal };
        const at = last && !last.isFinal ? this.results.length - 1 : this.results.length;
        this.results[at] = r;
        this.onresult?.({ resultIndex: at, results: this.results });
      }
    }
    w.SpeechRecognition = Fake;
  }, supported);
}
const say = (page: Page, text: string, final: boolean) =>
  page.evaluate(
    ([t, f]) =>
      (window as never as { __speech: { say(t: string, f: boolean): void } }).__speech.say(t as string, f as boolean),
    [text, final] as const,
  );

test("dictating into the coach chat adds to what's typed, and stops on send", async ({ page }) => {
  await fakeSpeech(page);
  await page.goto("/coach?new=1");
  const box = page.getByRole("textbox", { name: "Message the coach" });
  await box.fill("Hi.");
  await page.getByRole("button", { name: "Dictate" }).click();
  await expect(page.getByRole("button", { name: "Stop dictating" })).toHaveAttribute("aria-pressed", "true");
  await say(page, "move the dentist", false);
  await expect(box).toHaveValue("Hi. move the dentist");
  await say(page, "move the dentist to Friday", true);
  await say(page, "please", false);
  await expect(box).toHaveValue("Hi. move the dentist to Friday please");
  await page.getByRole("button", { name: "Stop dictating" }).click();
  await expect(page.getByRole("button", { name: "Dictate" })).toHaveAttribute("aria-pressed", "false");
  // Fixing a word by hand, then sending, works as usual.
  await box.fill("Hi. Move the dentist to Friday please");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(box).toHaveValue("");
});

test("dictating a brain dump", async ({ page }) => {
  await fakeSpeech(page);
  await page.goto("/inbox");
  await waitForSynced(page);
  await page.getByRole("button", { name: /Brain dump/ }).click();
  const dump = page.getByRole("region", { name: "Brain dump" });
  await dump.getByRole("button", { name: "Dictate" }).click();
  await say(page, "call the landlord and book the dentist", true);
  await expect(dump.getByRole("textbox")).toHaveValue("call the landlord and book the dentist");
  await dump.getByRole("button", { name: "Stop dictating" }).click();
  await dump.getByRole("button", { name: "Cancel" }).click();
});

test("no mic button where the browser can't dictate", async ({ page }) => {
  await fakeSpeech(page, false);
  await page.goto("/coach?new=1");
  await expect(page.getByRole("textbox", { name: "Message the coach" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Dictate" })).toHaveCount(0);
});
