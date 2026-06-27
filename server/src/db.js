import { DatabaseSync } from 'node:sqlite';

const DB_FILE = process.env.DB_FILE || './family.db';
export const db = new DatabaseSync(DB_FILE);

db.exec(`
PRAGMA journal_mode = DELETE;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS family (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS app_user (
  id            INTEGER PRIMARY KEY,
  family_id     INTEGER NOT NULL REFERENCES family(id),
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'member'
);

CREATE TABLE IF NOT EXISTS category (
  id        INTEGER PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES family(id),
  name      TEXT NOT NULL,
  kind      TEXT NOT NULL CHECK (kind IN ('income','expense'))
);

CREATE TABLE IF NOT EXISTS "transaction" (
  id           INTEGER PRIMARY KEY,
  family_id    INTEGER NOT NULL REFERENCES family(id),
  user_id      INTEGER REFERENCES app_user(id),
  kind         TEXT NOT NULL CHECK (kind IN ('income','expense')),
  amount_paise INTEGER NOT NULL,
  category_id  INTEGER REFERENCES category(id),
  note         TEXT,
  txn_date     TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS loan (
  id              INTEGER PRIMARY KEY,
  family_id       INTEGER NOT NULL REFERENCES family(id),
  counterparty    TEXT NOT NULL,
  direction       TEXT NOT NULL CHECK (direction IN ('given','taken')),
  principal_paise INTEGER NOT NULL,
  interest_rate   REAL NOT NULL,
  rate_basis      TEXT NOT NULL DEFAULT 'annual' CHECK (rate_basis IN ('annual','monthly','daily')),
  start_date      TEXT NOT NULL,
  due_date        TEXT,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS loan_payment (
  id           INTEGER PRIMARY KEY,
  loan_id      INTEGER NOT NULL REFERENCES loan(id),
  amount_paise INTEGER NOT NULL,
  pay_date     TEXT NOT NULL,
  applies_to   TEXT NOT NULL CHECK (applies_to IN ('principal','interest')),
  note         TEXT
);
`);

// Ensure there is exactly one family row (single shared household).
export function getFamilyId() {
  let row = db.prepare('SELECT id FROM family LIMIT 1').get();
  if (!row) {
    const info = db.prepare('INSERT INTO family(name) VALUES (?)').run('Our Family');
    return Number(info.lastInsertRowid);
  }
  return row.id;
}
