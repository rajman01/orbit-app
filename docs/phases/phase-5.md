# Phase 5 — Money

| | |
|---|---|
| **Status** | 5A and 5B built 2026-11-17, 5C and 5D 2026-11-18; 5E–5G planned (owner approved the plan 2026-11-17) |
| **Depends on** | Phase 1 (tasks, goals, settings), 2A (coach tools), 2C (people, for debts), 3A (charts) |
| **PRD** | §7.18 FIN-1–15 (added at 5G), §3.2, §13, §16.1, §21, §23 q1, D46–D52 |
| **Design** | DESIGN.md: lists, sheets, hand-drawn charts; amounts in tabular figures |

## Goal

Help the owner manage money and reach money goals: see where it goes, keep to budgets, save towards goals, clear debts, and know what they hold. Everything entered by hand, in one currency, with the coach reading it.

**Exit criteria**
- A month of real spending and income logged, mostly in under ten seconds per entry.
- Budgets show pace; a savings pot moves a goal's roadmap; a debt has a payoff month; net worth is right.
- The coach can log money, set a budget and explain the month without giving investment advice.

## Scope

| PRD ID | Feature |
|---|---|
| FIN-1 | Currency setting; amounts in minor units (D47) |
| FIN-2 | Accounts with balances |
| FIN-3 | Categories, defaults seeded |
| FIN-4 | Transactions: expense, income, transfer; Money page overview and list |
| FIN-5 | Quick capture of money (Quick Add, Shortcut, coach) |
| FIN-6 | Budgets per category and overall, with pace |
| FIN-7 | Recurring transactions, confirmed when due |
| FIN-8 | Money in the weekly report and email; "log today's spending" nudge |
| FIN-9 | Savings pots linked to goal key results (D48); projection |
| FIN-10 | CSV import of a statement |
| FIN-11 | Debts, payments, payoff plan (D51); due payments on Today |
| FIN-12 | Holdings with daily prices (D49); net worth |
| FIN-13 | Coach tools for money (D52) |
| FIN-14 | Insights card: where the money went |
| FIN-15 | Focused coach conversations about a pot or a debt |

## Decisions

1. **Manual entry only (D46).** No bank aggregator: fees, KYC, tokens on a server, and patchy support by country. Capture is made fast instead.
2. **One currency, minor units (D47).** `settings.currency` (ISO code, naira by default); every amount is an integer in the minor unit, formatted with `Intl.NumberFormat`.
3. **Savings goals are goals (D48).** A pot links to a key result; contributions check it in, so progress, health, the roadmap and the coach need nothing new.
4. **Prices daily on the server (D49).** CoinGecko for crypto (no key), Finnhub for stocks/ETFs (owner's free key), frankfurter.app for currency; failures keep the last price.
5. **One ledger (D50).** Transfers, pot contributions and debt payments are transactions too, so every balance is a sum over one table.
6. **Debts are records, payments are transactions (D51).** Balance = principal + simple monthly interest − payments; the payoff plan is a pure calculation.
7. **Education, not advice (D52).** The coach explains and compares with rules of thumb; it never says what to buy or sell.
8. **Accounts and categories are optional on a transaction.** Most entries are an amount and a note; an account or category can be added later. (5A)
10. **A recurring entry is its own first occurrence.** The row that carries the rule is a real transaction on its date; later occurrences are copies with a fixed id, made only when confirmed; a skip makes and deletes the copy so its tombstone stops it coming back. Three oldest due at most, so an old rule can't flood the page. (5B)
11. **Pace has ten points of slack.** Used share within ±0.1 of the month's elapsed share is "on pace". A month-only budget overrides the every-month one. (5B)
12. **A pot's key result is in the currency's major unit** (₦ not kobo), so it reads like any other number KR; the pot keeps it in step on every contribution through `checkInKeyResult`. Unlinking removes the KR. (5C)
13. **Projection uses the last three months, or fewer for a young pot**, net of money taken out, rounded to whole units. (5C)
14. **A debt is replayed month by month**: simple interest at the annual rate / 12 on the balance at each month boundary after the start, payments on their days. The payoff plan runs the same way forward. The linked key result counts what's paid (major units) against the principal. (5D)
9. **Money words are past tense.** "spent", "paid", "bought", "got", "received" make a Quick Add entry money; "buy milk" and "pay rent" stay tasks. A currency sign or a leading +/− also counts. (5A)

## Data model (Dexie v19, all synced)

| Entity | Fields | Notes |
|---|---|---|
| `settings` (extend) | `currency?`, `notify.money?`, `money?: { monthStartDay }` | optional for older documents |
| `accounts` | name, type (cash/bank/card/savings/investment/other), openingBalance, openingDate, archivedAt, order | balance = opening + transactions through it |
| `categories` | name, icon, color, kind (expense/income), archivedAt, order | 15 defaults with deterministic ids `c<userId><slug>` |
| `transactions` | kind (expense/income/transfer), amount (minor, > 0), accountId?, toAccountId?, potId?, debtId?, categoryId?, date, note, goalId?, recurrence?, recurrenceParentId?, createdBy (user/ai/capture/import), importHash? | indexes: date, accountId, categoryId, potId, debtId, recurrenceParentId |
| `budgets` | month (YYYY-MM or `*`), categoryId?, amount | 5B |
| `savingsPots` | name, target, targetDate?, goalId?, keyResultId?, accountId?, note, archivedAt, order | 5C |
| `debts` | name, kind (loan/card/bnpl/person/other), direction (owe/owed), principal, startDate, interestRate?, minimumPayment?, dueDay?, personId?, goalId?, keyResultId?, accountId?, note, closedAt, archivedAt, order | 5D |
| `holdings` | name, type (stock/etf/crypto/cash/property/other), symbol?, quantity, costBasis, manualValue?, price?, priceCurrency?, priceAt?, accountId?, note, archivedAt, order | 5E; price fields written by the server |
| `holdingValues` | holdingId, month, value | 5E; one per holding per month |

All eight entities and their references were declared in 5A so later sub-phases don't bump Dexie again.

## Steps

- [x] **5A Ledger** — FIN-1–5: currency setting; accounts; default categories; transactions with a log sheet; Money page (Overview, Transactions, Accounts); `parseMoney` in Quick Add and `/api/capture`; nav and precache; Dexie v19.
- [x] **5B Budgets and rhythm** — FIN-6–8, FIN-14: budgets with pace; recurring transactions; spend and in/out charts; weekly report and email; the Shutdown nudge; Insights card.
- [x] **5C Savings pots and goals** — FIN-9–10: pots, contributions, goal link through a key result, projection on the goal page; CSV import.
- [x] **5D Debts** — FIN-11: debts, payments, settle with a person, payoff plan, goal link, due payments on Today.
- [ ] **5E Investments** — FIN-12: holdings, server price job, net worth and its chart.
- [ ] **5F Coach** — FIN-13, FIN-15: tools, context line, prompt bullet, pot and debt as subjects.
- [ ] **5G Guide, docs, deploy** — PRD rows and decisions, owner checklist.

## Tests

- **Unit:** `money-model.test.ts` (amounts and formatting, months, month sums, spend by category, account balances, labels, the parser's money/task boundary). Later: budget pace, recurring materialisation, projection, payoff plan, net worth, coach tools.
- **Browser:** `money.spec.ts` (log from the page and Quick Add, month navigation, edit and delete, on desktop and phone; accounts and balances, and capture through the token API, on desktop).
- **Manual (owner):** a week of real entries; the Shortcut with "spent …".

## Risks

- A shared ledger across devices while offline: two devices logging the same bill create two rows. Acceptable (delete one); the CSV import de-duplicates by hash.
- Currency formatting differs by locale; totals are only ever in the one currency, so nothing is converted except holding prices (5E).
- Prices from free APIs can rate-limit or change shape: the job keeps the last price and the value is never blank.

## Build log

| Date | What |
|---|---|
| 2026-11-18 | 5D Debts (FIN-11):<br>• **Model:** `features/money/debts.ts` (`debtState`: balance, paid, interest, next due day and days to it; `payoffPlan`: avalanche or snowball, minimums first then the rest to one debt, rolling on, with each debt's clear month and interest and a give-up when payments can't beat the interest; `suggestedMonthly`). Actions: debt CRUD (delete keeps the payments), `payDebt` (a transfer with `debtId`, out of an account for one you owe, into one for money owed to you; closes the debt at zero and notes the settlement on the person's page), `linkDebtToGoal` / `makeDebtGoal` ("Clear …" with a KR counting what's paid), `unlinkDebt`, `syncDebtKeyResult`.<br>• **Debts tab:** You owe / Owed to you totals; a card per debt (who or what kind, rate, left of principal, paid bar, interest so far, next due or overdue, Record a payment / Record money back, menu: edit, open goal, make clearing it a goal, unlink, archive, delete); the Payoff plan card (order toggle, a monthly amount defaulting to the suggestion, the done month and months, total interest, what 10% more a month saves, the order with clear months). Forms: a debt (I owe / owed to me, name, amount, kind, interest, due day, minimum, since, person, goal) and a payment (amount with Settle in full and Minimum chips, day, account). The goal page shows "Clearing it".<br>• **Elsewhere:** a reminder on the due day at Daily Plan time (`debt:<id>:<day>`, under the money toggle); imported rows whose description contains a debt's name become payments; key results in a currency read as money (₦350,000 / ₦5,000,000); transaction rows name the pot or debt.<br>• **Phone fix:** the six Money tabs overflowed a phone's width and widened the page, pushing the Log sheet's button off-screen; the tab strip now scrolls on its own and the sheet's content area scrolls (`min-h-0`).<br>• **Guide:** debts under Money.<br>• **Tests:** 6 unit (`money-debts.test.ts`: payments and interest, never below zero, due days and lateness; avalanche vs snowball order, clear months, interest, more a month, the give-up and the suggestion; import tagging; the due-day reminder) and 1 browser (`money.spec.ts`: a card debt with interest and a due day, a payment, the payoff plan, made into a goal with its KR on the goal page, settled in full).<br>• **Full suite:** 290 unit; 159 browser passed, 40 skipped, 1 failed (the phone tab overflow above, fixed; `money.spec.ts` rerun green on both projects). |
| 2026-11-18 | 5C Savings pots and goals (FIN-9–10):<br>• **Pots:** `features/money/pots.ts` (`potBalance` from transfers in minus out, `potProjection`: rate over the last three months or since the pot began, the month the target is reached, what a month needs for the date, done). Actions: pot CRUD (delete keeps the transfers), `contributeToPot` (a transfer with `potId`, from or to an account; "Take out" sets `toAccountId`), `linkPotToGoal` (a number KR "Save ₦X for …", unit the currency, current the balance), `makePotGoal` (a goal in the Finance area with the pot's date), `unlinkPot`, `syncPotKeyResult`.<br>• **Pots tab:** a card per pot (balance of target, bar, projection sentence, Put money in, the goal link) with a menu (edit, open goal, make this a goal / unlink, archive, delete); forms for a pot (name, target, date, goal) and for putting money in or taking it out. The goal page shows "Saving for it" with the same card above the roadmap.<br>• **Import:** `features/money/import.ts` (`parseCsv` with quotes and `;`, `parseDay` in ISO, day-first, US and "3 Nov 2026" forms, column finding by name, DR/CR flags, categories guessed from words in the description, a djb2 `rowHash`). "Import CSV" on the Transactions tab previews the rows, greys out ones already here and imports the rest; `importTransactions` skips hashes already present.<br>• **Guide:** pots and import under Money.<br>• **Tests:** 4 unit (`money-pots.test.ts`: balances in and out, projection with and without a date, a young pot, a reached pot; CSV shapes and dates; candidates, categories, hashes, debit/credit columns, missing columns) and 1 browser (`money.spec.ts`: a pot with a target and date, money in, the projection, made into a goal with its KR and the pot on the goal page, more money moving the goal to 15%, a statement imported and re-imported with nothing added).<br>• **Full suite:** 284 unit; 159 browser passed, 39 skipped, 0 failed (two sync-timing flakes rerun green). |
| 2026-11-17 | 5B Budgets and rhythm (FIN-6–8, FIN-14):<br>• **Budgets:** `features/money/budgets.ts` (`budgetId` fixed per user, month and category; `budgetFor`, the month's own row over the every-month one; `budgetStatuses` with used, elapsed, pace under/on/over/blown and what's left). `setBudget` creates, updates or removes. A Budgets tab: each budget as a bar with a tick at today's share of the month, the pace in words, spent of limit and what's left; chips to set one for any expense category; an overall budget. The form has a big amount field and "Every month / this month only".<br>• **Recurring:** `features/money/recurring.ts` (`occurrencesUntil`, `dueOccurrences`, `upcomingOccurrences`, `instanceFields`, five repeat options from weekly to every 3 months, reusing the task `recurrenceSchema` and `nextInstanceId`). The Log sheet has a Repeats chip. The Overview shows a Due card (Confirm / Skip) and "Coming up" (14 days); the list marks repeating rows.<br>• **Charts:** `InOutChart` (in green, out grey, six months, sr-only table) on the Overview and on Insights, which also gets "Where the money went" (FIN-14), both only once something is logged.<br>• **Report and email:** Spent and Received tiles for the week on the Report page (with the top category); `WeekSummary.money` and a line in the weekly email's numbers.<br>• **Nudge:** at Shutdown time, "Log today's spending" (`money:<day>`, `/money?log=1`) for someone with money logged in the last 30 days and nothing today; `notify.money` toggle in Settings.<br>• **Tests:** 8 unit (`money-budgets.test.ts`: ids and precedence, pace across the month and for past/future months; occurrences, due until confirmed or skipped, the three-oldest cap, upcoming; six-month series and a week's summary; the nudge's conditions) and 1 browser (`money.spec.ts`: a Transport budget under pace, a monthly fuel entry dated last month that comes back due, confirmed into the budget and listed as coming up).<br>• **Full suite:** 280 unit; 158 browser passed, 38 skipped, 0 failed. |
| 2026-11-17 | 5A Ledger (FIN-1–5):<br>• **Data:** eight money entities and their references (table above), Dexie v19; `settings.currency` (naira by default; the ₦ symbol), `settings.money.monthStartDay`, `notify.money`.<br>• **Model:** `features/money/model.ts` (currencies, `formatMoney`, `parseAmount`, 15 default categories with deterministic ids, month helpers, `monthSummary`, `spendByCategory`, `accountBalance`, `transactionLabel`); `features/money/parse.ts` (`parseMoney`: past-tense money words, a sign or a currency symbol, k/m suffixes, `#category`, a day).<br>• **Actions and hooks:** `ensureDefaultCategories`, category and account CRUD (deleting an account keeps its transactions), `createTransaction` / `updateTransaction` / `deleteTransaction`; `useAccounts`, `useCategories`, `useTransactions`.<br>• **Money page** (`/money`, sidebar and More menu): Overview (In / Out / Left for the month, "Where it went" bars, recent entries), Transactions (the month, grouped by day, with month arrows), Accounts (balances, add/edit/archive, the category set). "Log" opens a sheet: Spent / Received / Transfer, a big amount field, category chips, note, day, accounts. Tapping an entry edits or deletes it. The default categories appear the first time the page opens.<br>• **Capture:** Quick Add shows a green "Spent $12.50 · Food & drink" chip and logs money instead of a task; `/api/capture` (the Shortcut) does the same and replies "Logged: …".<br>• **Settings:** a Currency row (ten quick picks; any ISO code kept).<br>• **Guide:** a Money section.<br>• **Tests:** 9 unit (`money-model.test.ts`) and 3 browser (`money.spec.ts`, desktop and phone).<br>• **Full suite:** 272 unit; 157 browser passed, 37 skipped, 0 failed (the guide section count and one midnight-rollover flake rerun green). |
