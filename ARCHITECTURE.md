# Family Finance Manager — System Architecture & Workflow

**Prepared as a senior-engineer spec for a developer/student build.**
Scope: one shared family account, web + mobile clients, database-backed, tracking daily income & expenses, loans with simple interest, and an overall family profit/loss (+/−) figure.

---

## 1. What the app does (in one screen)

The family enters every rupee in and out: daily income (salary, rent received, business takings) and daily expenses (groceries, bills, school fees). Separately it records loans — money the family **gave** to someone (earns interest, an asset) or **took** from someone (owes interest, a liability). The app applies **simple interest** to each loan and rolls everything up into a single number:

```
Family Net Position = (Total Income − Total Expenses)
                    + (Loans Given still outstanding + interest receivable)
                    − (Loans Taken still outstanding + interest payable)
```

If the result is **positive** the family is in profit; if **negative** they are net in debt.

---

## 2. The core math — simple interest

Simple interest is always charged on the original principal only (never compounded):

```
SI = P × R × T / 100

P = principal (loan amount)
R = interest rate in % per annum
T = time in YEARS
```

Because the requirement allows entering a **daily or yearly** loan, normalise everything to years before computing:

| Entry basis        | Convert T to years          |
|--------------------|-----------------------------|
| Time given in days | T = days / 365              |
| Time given in months | T = months / 12           |
| Time given in years | T = years (as-is)          |

**Accrued interest as of today** (for an active loan) uses elapsed time, not the full term:

```
days_elapsed   = today − start_date
T              = days_elapsed / 365
interest_today = P × R × T / 100
amount_due     = P + interest_today      (for a loan taken)
amount_owed_to_family = P + interest_today (for a loan given)
```

Worked example: Family lends ₹50,000 at 12% p.a., 90 days elapsed.
`SI = 50000 × 12 × (90/365) / 100 = ₹1,479.45`. Receivable = ₹51,479.45.

> Keep all money as integer **paise** (×100) in the database to avoid floating-point rounding errors, and format to rupees only in the UI.

---

## 3. Technology stack (recommended)

You want web + mobile from one codebase and you're building it yourself, so share as much TypeScript as possible.

| Layer | Choice | Why |
|-------|--------|-----|
| Web client | **React + Vite + TypeScript** | Fast, standard, huge ecosystem |
| Mobile client | **React Native (Expo)** | Reuse your React/TS skills; one language for both apps |
| Shared logic | **A `core` TS package** | Interest math, validation, types shared by web + mobile |
| Backend API | **Node.js + Express (or NestJS) + TypeScript** | Same language top-to-bottom |
| Database | **PostgreSQL** | ACID, reliable for money; relational fits this data |
| ORM | **Prisma** | Type-safe queries, easy migrations |
| Auth | **JWT** (single shared family login) | Simple; one account, optional per-member names |
| Hosting | DB on **Neon/Supabase**, API on **Render/Railway**, web on **Vercel** | Free tiers, quick deploy |

**Lower-effort alternative:** use **Supabase** (hosted Postgres + auth + auto-generated REST/realtime API). You'd skip writing most of the backend and call Supabase directly from both clients. Good if you want to ship fast; the custom Express API gives you more control over the interest calculations server-side. The schema below works for either path.

---

## 4. System architecture

Three tiers — clients, API, database — with all business rules (especially interest) computed on the **server** so web and mobile always agree.

```
 ┌──────────────┐     ┌──────────────┐
 │  Web (React) │     │ Mobile (RN)  │     ← shared `core` TS package
 └──────┬───────┘     └──────┬───────┘
        │   HTTPS / JSON (JWT in header)
        └──────────┬─────────┘
                   ▼
         ┌───────────────────┐
         │  REST API (Node)  │   auth · validation · interest engine
         │  - /transactions  │
         │  - /loans         │
         │  - /summary       │
         └─────────┬─────────┘
                   │ Prisma ORM
                   ▼
         ┌───────────────────┐
         │   PostgreSQL DB   │   family · users · transactions · loans
         └───────────────────┘
```

---

## 5. Database schema

Single family, but keep a `family` table so you could support more families later without a rewrite.

```sql
-- One row for the household (extensible to multi-family later)
family(
  id            PK,
  name          text,
  created_at    timestamptz
)

-- Members who share the one account (each can log entries under their name)
app_user(
  id            PK,
  family_id     FK -> family.id,
  name          text,
  email         text unique,
  password_hash text,
  role          text  -- 'admin' | 'member'
)

-- Reusable income/expense categories
category(
  id            PK,
  family_id     FK,
  name          text,           -- 'Salary', 'Groceries', 'School fees'
  kind          text            -- 'income' | 'expense'
)

-- Every daily income or expense entry
transaction(
  id            PK,
  family_id     FK,
  user_id       FK -> app_user.id,
  kind          text,           -- 'income' | 'expense'
  amount_paise  bigint,         -- store money as integer paise
  category_id   FK -> category.id,
  note          text,
  txn_date      date,           -- the day it happened
  created_at    timestamptz
)

-- Loans given out or taken, with simple-interest terms
loan(
  id               PK,
  family_id        FK,
  counterparty     text,        -- who borrowed from / lent to the family
  direction        text,        -- 'given'  (asset)  | 'taken' (liability)
  principal_paise  bigint,
  interest_rate    numeric(5,2),-- % per annum
  rate_basis       text,        -- 'annual' | 'monthly' | 'daily' (how user entered it)
  start_date       date,
  due_date         date NULL,   -- expected end (optional)
  status           text,        -- 'active' | 'closed'
  created_at       timestamptz
)

-- Repayments against a loan (principal and/or interest)
loan_payment(
  id            PK,
  loan_id       FK -> loan.id,
  amount_paise  bigint,
  pay_date      date,
  applies_to    text,           -- 'principal' | 'interest'
  note          text
)
```

The `summary` figures (totals, accrued interest, net position) are **computed on demand**, not stored — derive them with SQL aggregates + the interest formula so they're never stale.

---

## 6. API endpoints

```
POST  /auth/login            → JWT for the shared family account

GET   /transactions?from=&to=&kind=     list / filter by date range
POST  /transactions                     add income or expense
PUT   /transactions/:id                 edit
DELETE/transactions/:id                 remove

GET   /categories                       list categories
POST  /categories                       add a category

GET   /loans?status=active              list loans with live accrued interest
POST  /loans                            add a loan (given/taken)
PUT   /loans/:id                         edit terms
POST  /loans/:id/payments               record a repayment
PUT   /loans/:id/close                   mark closed

GET   /summary?from=&to=                THE key endpoint — see below
```

**`GET /summary`** returns everything the dashboard needs:

```json
{
  "totalIncome":        125000.00,
  "totalExpenses":       80000.00,
  "operatingBalance":    45000.00,
  "loansGiven": {
    "principalOutstanding": 50000.00,
    "interestReceivable":    1479.45
  },
  "loansTaken": {
    "principalOutstanding": 20000.00,
    "interestPayable":        657.53
  },
  "netPosition":         76821.92,
  "status": "PROFIT"
}
```

`netPosition = operatingBalance + (givenPrincipal + interestReceivable) − (takenPrincipal + interestPayable)`. Sign of `netPosition` drives the PROFIT / LOSS badge.

---

## 7. User workflow

1. **Login** once to the shared family account; pick which member you are (for the `user_id` on entries).
2. **Daily entry** — tap *Add Income* or *Add Expense*, choose category, amount, date, optional note. Saved instantly.
3. **Add a loan** — choose *Given* or *Taken*, enter counterparty, principal, interest rate, and basis (per day/month/year), start date. The server normalises to annual and starts accruing interest from `start_date`.
4. **Record repayments** against a loan as they happen; status flips to *closed* when settled.
5. **Dashboard** calls `/summary` and shows: total income, total expenses, operating balance, loan assets (principal + interest receivable), loan liabilities (principal + interest payable), and the single **Net Position** with a green **+** (profit) or red **−** (loss).
6. **Filter** any view by date range (today / this month / this year / custom) — the summary recomputes for that window.

---

## 8. Build order (suggested milestones)

1. **DB + Prisma schema** and migrations — get the tables above live.
2. **Auth** — one shared login returning a JWT.
3. **Transactions CRUD** + categories — the daily income/expense core.
4. **Loans CRUD** + the **interest engine** (the `core` package function `accruedInterest(loan, asOfDate)`), with unit tests on the worked examples.
5. **`/summary` endpoint** — the aggregate that produces profit/loss.
6. **Web dashboard** (React) consuming the API.
7. **Mobile app** (Expo) reusing the same `core` package and API.
8. **Polish** — date filters, charts (income vs expense over time), export to CSV/PDF.

---

## 9. Things to get right early

- **Money as integer paise** everywhere; format to ₹ only at display time.
- **Compute interest server-side** so web and mobile can never disagree.
- **Unit-test the interest function** against hand-checked examples (the ₹50,000 @ 12% / 90-day case above).
- **Time zone**: store dates as plain `date` (not timestamp) for daily entries to avoid off-by-one-day bugs.
- **Soft-delete or audit log** for transactions if the family wants a tamper-evident record of money.
- Keep a single `family` row now, but the `family_id` foreign keys mean you can open it to multiple families later with almost no schema change.
