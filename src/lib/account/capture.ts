import "server-only";
import type { Db } from "mongodb";
import { ulid } from "ulid";
import { defaultSettings, settingsId } from "@/features/settings/model";
import { parseQuickAdd } from "@/features/quick-add/parse";
import { newTaskFields } from "@/features/tasks/model";
import { DEFAULT_CURRENCY, formatMoney, newTransactionFields } from "@/features/money/model";
import { parseMoney } from "@/features/money/parse";
import { today } from "@/lib/dates";
import { applyMutations } from "@/lib/sync/server";

/**
 * §13 quick capture from outside the app (iOS Shortcut, scripts): text becomes a task, parsed like
 * Quick Add (dates, !1–!4, #area, +goal). It lands in the Inbox unless it was given a place or a
 * date. Written through the same sync path as devices, so it reaches them like any edit.
 */
export async function capture(db: Db, userId: string, input: { text: string; note?: string | null }, now = Date.now()) {
  const text = input.text.replace(/\s+/g, " ").trim().slice(0, 500);
  if (!text) return { ok: false as const, error: "Nothing to capture" };
  const live = { userId, deletedAt: null };
  const [settings, areas, goals, categories] = await Promise.all([
    db.collection("settings").findOne({ _id: settingsId(userId) as never, deletedAt: null }),
    db
      .collection("areas")
      .find({ ...live, archivedAt: null })
      .toArray(),
    db
      .collection("goals")
      .find({ ...live, status: { $in: ["active", "planned"] } })
      .toArray(),
    db
      .collection("categories")
      .find({ ...live, archivedAt: null })
      .toArray(),
  ]);
  const timezone = (settings?.timezone as string | undefined) ?? defaultSettings().timezone;
  const currency = (settings?.currency as string | undefined) ?? DEFAULT_CURRENCY;

  // "spent 12.50 lunch" is money, not a task (5A).
  const money = parseMoney(text, {
    currency,
    categories: categories.map((c) => ({
      id: String(c._id),
      name: String(c.name),
      kind: c.kind as "expense" | "income",
    })),
    timezone,
    now: new Date(now),
  });
  if (money) {
    const id = ulid();
    const fields = newTransactionFields({
      kind: money.kind,
      amount: money.amount,
      categoryId: money.categoryId,
      note: money.note,
      date: money.date ?? today(timezone, now),
      createdBy: "capture",
    });
    const res = await applyMutations(db, userId, [
      { mutationId: ulid(), entity: "transactions", entityId: id, op: "upsert", fields, clientTime: now },
    ]);
    if (res.rejected.length) return { ok: false as const, error: res.rejected[0].reason };
    const title = `${money.kind === "income" ? "Received" : "Spent"} ${formatMoney(money.amount, currency)}${
      money.categoryLabel ? ` · ${money.categoryLabel}` : money.note ? ` · ${money.note}` : ""
    }`;
    return { ok: true as const, id, title, status: "money" as const, dueDate: null };
  }
  const parsed = parseQuickAdd(text, {
    areas: areas.map((a) => ({ id: String(a._id), name: String(a.name) })),
    goals: goals.map((g) => ({ id: String(g._id), title: String(g.title) })),
    timezone,
    now: new Date(now),
  });
  const goal = goals.find((g) => String(g._id) === parsed.goalId);
  const areaId = parsed.areaId ?? (goal?.areaId as string | null | undefined) ?? null;
  const triaged = Boolean(areaId || parsed.goalId || parsed.dueDate);
  const id = ulid();
  const fields = newTaskFields({
    title: parsed.title || text,
    description: input.note?.trim().slice(0, 20000) ?? "",
    priority: parsed.priority ?? "none",
    areaId,
    goalId: parsed.goalId,
    dueDate: parsed.dueDate,
    status: triaged ? "todo" : "inbox",
    createdBy: "capture",
    order: now,
  });
  const res = await applyMutations(db, userId, [
    { mutationId: ulid(), entity: "tasks", entityId: id, op: "upsert", fields, clientTime: now },
    {
      mutationId: ulid(),
      entity: "taskEvents",
      entityId: ulid(),
      op: "upsert",
      fields: {
        taskId: id,
        type: "created",
        from: null,
        to: fields.status,
        reason: "capture",
        reasonText: null,
        actor: "system",
        at: now,
      },
      clientTime: now,
    },
  ]);
  if (res.rejected.length) return { ok: false as const, error: res.rejected[0].reason };
  return { ok: true as const, id, title: fields.title, status: fields.status, dueDate: fields.dueDate };
}
