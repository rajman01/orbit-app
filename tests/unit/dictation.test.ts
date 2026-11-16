import { describe, expect, it } from "vitest";
import { joinDictation } from "@/components/ui/dictation";

describe("dictation (AI-10)", () => {
  it("adds what's said to what's typed, with one space or on the new line", () => {
    expect(joinDictation("", "  call the bank ")).toBe("call the bank");
    expect(joinDictation("Hi.", "call the bank")).toBe("Hi. call the bank");
    expect(joinDictation("Hi.   ", "call the bank")).toBe("Hi. call the bank");
    expect(joinDictation("First\n", "second")).toBe("First\nsecond");
    expect(joinDictation("Hi.", "   ")).toBe("Hi.");
  });
});
