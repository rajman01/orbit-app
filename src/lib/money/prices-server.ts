import "server-only";
import type { Db, Document } from "mongodb";
import { ulid } from "ulid";
import { dayOf } from "@/lib/dates";
import { holdingValueId } from "@/features/money/holdings";
import { applyMutations } from "@/lib/sync/server";
import type { Mutation } from "@/lib/sync/protocol";

/**
 * 5E (D49): daily prices for holdings with a symbol. Crypto from CoinGecko (no key, coin ids like
 * "bitcoin"), stocks and ETFs from Finnhub (FINNHUB_API_KEY, quotes in USD), and the rate into the
 * person's currency from open.er-api.com (no key). Prices are written in the main currency per
 * unit; a failed lookup keeps the last price. PRICES_FAKE=1 answers from a fixed table (tests).
 */

const live = <T extends Document>(filter: T) => ({ ...filter, deletedAt: null });
const sentLog = (db: Db) => db.collection<{ _id: string; userId: string; at: Date }>("sentNotifications");

export interface Quote {
  /** Per unit, in `currency`. */
  price: number;
  currency: string;
}

interface Source {
  crypto(ids: string[]): Promise<Map<string, Quote>>;
  stock(symbols: string[]): Promise<Map<string, Quote>>;
  /** How many units of `to` one unit of `from` buys. */
  rate(from: string, to: string): Promise<number | null>;
}

const FAKE_PRICES: Record<string, number> = { bitcoin: 60000, ethereum: 2500, AAPL: 190, VOO: 420, MTNN: 180 };
const fake: Source = {
  async crypto(ids) {
    return new Map(ids.filter((i) => FAKE_PRICES[i]).map((i) => [i, { price: FAKE_PRICES[i], currency: "USD" }]));
  },
  async stock(symbols) {
    return new Map(symbols.filter((s) => FAKE_PRICES[s]).map((s) => [s, { price: FAKE_PRICES[s], currency: "USD" }]));
  },
  async rate(from, to) {
    if (from === to) return 1;
    return to === "NGN" ? 1500 : to === "GBP" ? 0.8 : 1;
  },
};

const fetchJson = async (url: string, init?: RequestInit): Promise<unknown> => {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`${url.split("?")[0]}: ${res.status}`);
  return res.json();
};

const real: Source = {
  async crypto(ids) {
    if (!ids.length) return new Map();
    const data = (await fetchJson(
      `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids.join(","))}&vs_currencies=usd`,
    )) as Record<string, { usd?: number }>;
    const out = new Map<string, Quote>();
    for (const id of ids) if (data[id]?.usd) out.set(id, { price: data[id].usd!, currency: "USD" });
    return out;
  },
  async stock(symbols) {
    const key = process.env.FINNHUB_API_KEY;
    const out = new Map<string, Quote>();
    if (!key) return out;
    for (const s of symbols) {
      try {
        const q = (await fetchJson(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(s)}&token=${key}`)) as {
          c?: number;
        };
        if (q.c) out.set(s, { price: q.c, currency: "USD" });
      } catch (err) {
        console.error("finnhub", s, err);
      }
    }
    return out;
  },
  async rate(from, to) {
    if (from === to) return 1;
    const data = (await fetchJson(`https://open.er-api.com/v6/latest/${from}`)) as { rates?: Record<string, number> };
    return data.rates?.[to] ?? null;
  },
};

export const priceSource = (): Source => (process.env.PRICES_FAKE === "1" ? fake : real);

/** Prices every priced holding of one user and writes them, in the user's currency. */
export async function refreshPrices(db: Db, userId: string, now: number, source = priceSource()) {
  const settings = await db.collection("settings").findOne(live({ userId }));
  const currency = (settings?.currency as string | undefined) ?? "NGN";
  const tz = (settings?.timezone as string | undefined) ?? "UTC";
  const holdings = await db
    .collection("holdings")
    .find(live({ userId, archivedAt: null, symbol: { $nin: [null, ""] } }))
    .toArray();
  if (!holdings.length) return { priced: 0 };
  const cryptoIds = holdings.filter((h) => h.type === "crypto").map((h) => String(h.symbol).toLowerCase());
  const stockSymbols = holdings
    .filter((h) => h.type === "stock" || h.type === "etf")
    .map((h) => String(h.symbol).toUpperCase());
  const [crypto, stocks] = await Promise.all([
    source.crypto([...new Set(cryptoIds)]).catch((err) => (console.error("coingecko", err), new Map<string, Quote>())),
    source.stock([...new Set(stockSymbols)]).catch((err) => (console.error("finnhub", err), new Map<string, Quote>())),
  ]);
  const rates = new Map<string, number>();
  const rateFor = async (from: string) => {
    if (!rates.has(from)) rates.set(from, (await source.rate(from, currency).catch(() => null)) ?? NaN);
    return rates.get(from)!;
  };
  const month = dayOf(now, tz).slice(0, 7);
  const mutations: Mutation[] = [];
  let priced = 0;
  for (const h of holdings) {
    const key = h.type === "crypto" ? String(h.symbol).toLowerCase() : String(h.symbol).toUpperCase();
    const q = h.type === "crypto" ? crypto.get(key) : stocks.get(key);
    if (!q) continue;
    const rate = await rateFor(q.currency);
    if (!Number.isFinite(rate)) continue;
    const price = Math.round(q.price * rate * 10000) / 10000;
    const id = String(h._id);
    mutations.push({
      mutationId: ulid(),
      entity: "holdings",
      entityId: id,
      op: "upsert",
      fields: { price, priceCurrency: currency, priceAt: now },
      clientTime: now,
    });
    mutations.push({
      mutationId: ulid(),
      entity: "holdingValues",
      entityId: holdingValueId(id, month),
      op: "upsert",
      fields: { holdingId: id, month, value: Math.round(Number(h.quantity) * price * 100) },
      clientTime: now,
    });
    priced++;
  }
  if (mutations.length) await applyMutations(db, userId, mutations, { trusted: true });
  return { priced };
}

/** The per-minute job's part: each user with priced holdings, once a day, a few users per run. */
export async function dispatchPrices(db: Db, now: number) {
  const users = (await db
    .collection("holdings")
    .distinct("userId", live({ archivedAt: null, symbol: { $nin: [null, ""] } }))) as string[];
  let priced = 0;
  let ran = 0;
  for (const userId of users) {
    if (ran >= 5) break;
    const day = dayOf(now, "UTC");
    const claimed = await sentLog(db)
      .insertOne({ _id: `${userId}:prices:${day}`, userId, at: new Date(now) })
      .then(() => true)
      .catch(() => false);
    if (!claimed) continue;
    ran++;
    try {
      priced += (await refreshPrices(db, userId, now)).priced;
    } catch (err) {
      console.error("prices failed", userId, err);
    }
  }
  return { pricedHoldings: priced };
}
