# Family Finance Manager

A full-stack app for one family to track daily **income & expenses**, record **loans** (given or taken) with **simple interest**, and see a single **profit / loss** figure (the family net position).

Built from scratch:
- **Backend** — Node.js + Express, SQLite via the built-in `node:sqlite` (no native build, no ORM install), JWT auth.
- **Frontend** — React + Vite (in `web/`). A zero-build version of the same dashboard ships in `server/public/` so you can run everything with **just the server**.

---

## Quick start (one command, no build)

```bash
cd server
npm install
npm run seed        # creates family.db with demo data + a demo login
npm start           # http://localhost:4000
```

Open **http://localhost:4000** and sign in:

```
email:    family@home.com
password: password123
```

That's it — the server serves the dashboard from `server/public/`. You'll see the seeded numbers and can add income, expenses, and loans live.

> The seed leaves the family **in profit by ₹75,586.30** as of 2026‑06‑27, including ₹1,479.45 interest receivable on a ₹50,000 loan given at 12%.

## Running the React (Vite) client separately

The `server/public` dashboard and the `web/` React app are the *same UI*; use whichever you prefer. For the React dev server with hot reload:

```bash
# terminal 1
cd server && npm start
# terminal 2
cd web && npm install && npm run dev      # http://localhost:5173  (proxies API to :4000)
```

To bundle the React app and have the server serve it instead of the fallback:

```bash
cd web && npm run build      # outputs web/dist
cd ../server && npm start    # now serves web/dist
```

---

## How the money works

- All amounts are stored as integer **paise** (₹1 = 100 paise) to avoid floating-point errors; formatted to ₹ only in the UI.
- **Simple interest:** `SI = P × R × T / 100`, with `T` in years (`days / 365`). Rates entered per day/month/year are normalised to annual.
- **Net position:**
  `(Income − Expenses) + (Loans Given + interest receivable) − (Loans Taken + interest payable)`
  Positive → **PROFIT**, negative → **LOSS**.

The interest + net-position logic lives in `server/src/core.js` and is covered by unit tests:

```bash
cd server && npm test
```

---

## Project structure

```
family-finance-app/
├─ server/
│  ├─ src/
│  │  ├─ core.js        # money + simple-interest + net-position (pure, tested)
│  │  ├─ core.test.js   # unit tests (node:test)
│  │  ├─ db.js          # node:sqlite schema + connection
│  │  ├─ auth.js        # JWT sign / verify middleware
│  │  ├─ seed.js        # demo data + demo login
│  │  └─ index.js       # Express API + serves the web UI
│  ├─ public/index.html # zero-build dashboard (served by default)
│  └─ package.json
└─ web/                 # React + Vite client (same UI, proper build)
   ├─ src/{App.jsx, api.js, main.jsx, styles.css}
   └─ package.json
```

## API

```
POST /auth/register · POST /auth/login        → JWT
GET  /summary?from=&to=&asOf=                 → the profit/loss figure
GET  /transactions  · POST /transactions  · DELETE /transactions/:id
GET  /categories    · POST /categories
GET  /loans?status= · POST /loans · PUT /loans/:id/close · POST /loans/:id/payments
GET  /members
```

All routes except `/auth/*` require an `Authorization: Bearer <token>` header.

---

## Going to production

- **Database:** the schema in `db.js` maps 1:1 to PostgreSQL. For prod, swap `node:sqlite` for `pg` (or Prisma) and point at a hosted Postgres (Neon/Supabase). Column types already match.
- **Mobile:** the React Native (Expo) client reuses this exact REST API and the `core.js` math — share `core.js` as a small package between web and mobile.
- **Secrets:** set `JWT_SECRET` and `DB_FILE` via environment variables (see `server/.env.example`).
