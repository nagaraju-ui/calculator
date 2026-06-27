import pg from 'pg';

// Return DATE columns as plain 'YYYY-MM-DD' strings (avoid TZ off-by-one).
pg.types.setTypeParser(1082, (v) => v);

const { Pool } = pg;
let pool;
export function getPool() {
  // Test seam: allow an injected pool (e.g. pg-mem) without touching prod config.
  if (globalThis.__PG_POOL__) return globalThis.__PG_POOL__;
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // Neon and most hosted Postgres require SSL.
      ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false },
      max: 3,
    });
  }
  return pool;
}

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS family (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS app_user (
  id SERIAL PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES family(id),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member'
);
CREATE TABLE IF NOT EXISTS category (
  id SERIAL PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES family(id),
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('income','expense'))
);
CREATE TABLE IF NOT EXISTS txn (
  id SERIAL PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES family(id),
  user_id INTEGER REFERENCES app_user(id),
  kind TEXT NOT NULL CHECK (kind IN ('income','expense')),
  amount_paise BIGINT NOT NULL,
  category_id INTEGER REFERENCES category(id),
  note TEXT,
  txn_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS loan (
  id SERIAL PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES family(id),
  counterparty TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('given','taken')),
  principal_paise BIGINT NOT NULL,
  interest_rate REAL NOT NULL,
  rate_basis TEXT NOT NULL DEFAULT 'annual' CHECK (rate_basis IN ('annual','monthly','daily')),
  start_date DATE NOT NULL,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS loan_payment (
  id SERIAL PRIMARY KEY,
  loan_id INTEGER NOT NULL REFERENCES loan(id),
  amount_paise BIGINT NOT NULL,
  pay_date DATE NOT NULL,
  applies_to TEXT NOT NULL CHECK (applies_to IN ('principal','interest')),
  note TEXT
);
`;

// Create tables once per warm instance.
let schemaReady;
export function ensureSchema() {
  if (!schemaReady) schemaReady = getPool().query(SCHEMA_SQL);
  return schemaReady;
}

export async function q(text, params) { return (await getPool().query(text, params)).rows; }
export async function q1(text, params) { return (await getPool().query(text, params)).rows[0] || null; }

export async function getFamilyId() {
  let row = await q1('SELECT id FROM family LIMIT 1');
  if (!row) row = await q1("INSERT INTO family(name) VALUES ('Our Family') RETURNING id");
  return row.id;
}

// Default categories so a brand-new family has something to pick.
export async function seedDefaultCategories(familyId) {
  const have = await q1('SELECT COUNT(*)::int AS c FROM category WHERE family_id=$1', [familyId]);
  if (have.c > 0) return;
  const cats = [
    ['Salary', 'income'], ['Business', 'income'], ['Rent received', 'income'],
    ['Groceries', 'expense'], ['Bills', 'expense'], ['School fees', 'expense'],
  ];
  for (const [name, kind] of cats)
    await q('INSERT INTO category(family_id,name,kind) VALUES ($1,$2,$3)', [familyId, name, kind]);
}
