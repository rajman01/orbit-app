import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createActions } from "@/features/actions";
import { coachContext, runCoachTool } from "@/features/coach/device";
import { undoAction } from "@/features/coach/write-tools";
import { openLocalDb } from "@/lib/local-db/db";
import { SyncEngine } from "@/lib/sync/engine";

const USER = "user0000000001";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.UTC(2026, 10, 18, 9));
});
afterEach(() => vi.useRealTimers());

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = (o: { content: string }) => JSON.parse(o.content) as any;

function setup() {
  const db = openLocalDb(`money-coach-${Math.random().toString(36).slice(2)}`);
  const engine = new SyncEngine(db, (() => new Promise<Response>(() => {})) as typeof fetch);
  const actions = createActions(engine, USER);
  const deps = { db, engine, actions, userId: USER, now: Date.now(), turn: { writes: 0 } };
  return { db, engine, actions, deps };
}

describe("the coach and money (5F)", () => {
  it("logs spending in the main unit, by category name, and can undo it", async () => {
    const { db, actions, deps } = setup();
    await actions.saveSettings({ currency: "NGN", timezone: "UTC" });
    await actions.ensureDefaultCategories();
    const out = await runCoachTool(
      "log_transaction",
      { kind: "expense", amount: 12.5, category: "food", note: "Lunch" },
      deps,
    );
    const res: { done: string; transactionId: string; category: string } = json(out);
    expect(res.done).toBe("Log spending: ₦12.50 · Lunch");
    expect(res.category).toBe("Food & drink");
    const row = await db.transactions.get(res.transactionId);
    expect(row).toMatchObject({ kind: "expense", amount: 1250, note: "Lunch", createdBy: "ai", date: "2026-11-18" });
    // The per-turn context now carries a money line.
    expect(await coachContext(db, USER, Date.now())).toMatch(/Money \(NGN, 2026-11\): in 0, out 12\.5, left -12\.5/);
    const action = (await db.aiActions.toArray()).find((a) => a.tool === "log_transaction")!;
    await undoAction(deps.engine, action.id);
    expect((await db.transactions.get(res.transactionId))?.deletedAt).not.toBeNull();
    // An unknown category is refused rather than guessed.
    const bad = await runCoachTool("log_transaction", { kind: "expense", amount: 5, category: "unicorns" }, deps);
    expect(bad.isError).toBe(true);
    expect(bad.content).toContain("unicorns");
  });

  it("sets budgets, puts money in a pot (moving its key result), and records a debt and a payment", async () => {
    const { db, actions, deps } = setup();
    await actions.saveSettings({ currency: "NGN", timezone: "UTC" });
    await actions.ensureDefaultCategories();
    await runCoachTool("set_budget", { category: "transport", amount: 40000 }, deps);
    expect((await db.budgets.toArray()).map((b) => [b.month, b.amount])).toEqual([["*", 4_000_000]]);

    const potId = await actions.createPot({ name: "Canada fund", target: 100_000_00, targetDate: "2028-08-01" });
    const goalId = await actions.makePotGoal((await actions.getPot(potId))!);
    await runCoachTool("contribute_to_pot", { potId, amount: 25000 }, deps);
    const kr = (await db.keyResults.where("goalId").equals(goalId).toArray())[0];
    expect(kr.current).toBe(25000);
    const money: { pots: { balance: number }[]; netWorth: number } = json(await runCoachTool("get_money", {}, deps));
    expect(money.pots[0].balance).toBe(25000);

    const added = json(
      await runCoachTool(
        "add_debt",
        {
          name: "Car loan",
          direction: "owe",
          principal: 1_200_000,
          interestRate: 12,
          minimumPayment: 40000,
          dueDay: 5,
        },
        deps,
      ),
    ) as { debtId: string };
    await runCoachTool("pay_debt", { debtId: added.debtId, amount: 100000 }, deps);
    const plan: { order: { debt: string; balance: number }[]; clearsBy: string } = json(
      await runCoachTool("get_payoff_plan", { monthly: 150000 }, deps),
    );
    expect(plan.order[0]).toMatchObject({ debt: "Car loan", balance: 1_100_000 });
    expect(plan.clearsBy).toMatch(/^\d{4}-\d{2}$/);
    const inv: { netWorth: { debts: number; pots: number } } = json(await runCoachTool("get_investments", {}, deps));
    expect(inv.netWorth).toMatchObject({ debts: 1_100_000, pots: 25000 });

    // A focused conversation about the pot or the debt gets its facts.
    expect(await coachContext(db, USER, Date.now(), { kind: "pot", id: potId })).toContain(
      "one savings pot: “Canada fund”",
    );
    expect(await coachContext(db, USER, Date.now(), { kind: "debt", id: added.debtId })).toContain(
      "one debt: “Car loan”",
    );
    const hits = json(await runCoachTool("search", { query: "canada", kinds: ["pot"] }, deps)) as {
      matches: { kind: string }[];
    };
    expect(hits.matches.map((m) => m.kind)).toEqual(["pot"]);
  });
});
