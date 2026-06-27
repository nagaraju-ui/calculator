import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, getFamilyId } from './db.js';
import { signToken, requireAuth } from './auth.js';
import { accruedInterestPaise, netPosition } from './core.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json());

const today = () => new Date().toISOString().slice(0, 10);

/* ----------------------------- AUTH ----------------------------- */
app.post('/auth/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'name, email, password required' });
  const fid = getFamilyId();
  try {
    const hash = bcrypt.hashSync(password, 10);
    const info = db.prepare('INSERT INTO app_user(family_id,name,email,password_hash,role) VALUES (?,?,?,?,?)')
      .run(fid, name, email, hash, 'admin');
    const user = db.prepare('SELECT * FROM app_user WHERE id=?').get(Number(info.lastInsertRowid));
    res.json({ token: signToken(user), user: { id: user.id, name: user.name, role: user.role } });
  } catch (e) {
    res.status(409).json({ error: 'Email already registered' });
  }
});

app.post('/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM app_user WHERE email=?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash))
    return res.status(401).json({ error: 'Invalid credentials' });
  res.json({ token: signToken(user), user: { id: user.id, name: user.name, role: user.role } });
});

// List family members (so an entry can be attributed to a member)
app.get('/members', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT id,name,role FROM app_user WHERE family_id=?').all(req.user.fid));
});

/* --------------------------- CATEGORIES -------------------------- */
app.get('/categories', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM category WHERE family_id=? ORDER BY kind,name').all(req.user.fid));
});
app.post('/categories', requireAuth, (req, res) => {
  const { name, kind } = req.body;
  const info = db.prepare('INSERT INTO category(family_id,name,kind) VALUES (?,?,?)').run(req.user.fid, name, kind);
  res.json(db.prepare('SELECT * FROM category WHERE id=?').get(Number(info.lastInsertRowid)));
});

/* -------------------------- TRANSACTIONS ------------------------- */
app.get('/transactions', requireAuth, (req, res) => {
  const { from, to, kind } = req.query;
  let sql = `SELECT t.*, c.name AS category_name, u.name AS user_name
             FROM "transaction" t
             LEFT JOIN category c ON c.id=t.category_id
             LEFT JOIN app_user u ON u.id=t.user_id
             WHERE t.family_id=?`;
  const args = [req.user.fid];
  if (from) { sql += ' AND t.txn_date>=?'; args.push(from); }
  if (to)   { sql += ' AND t.txn_date<=?'; args.push(to); }
  if (kind) { sql += ' AND t.kind=?'; args.push(kind); }
  sql += ' ORDER BY t.txn_date DESC, t.id DESC';
  res.json(db.prepare(sql).all(...args));
});

app.post('/transactions', requireAuth, (req, res) => {
  const { kind, amount_paise, category_id, note, txn_date } = req.body;
  if (!['income', 'expense'].includes(kind)) return res.status(400).json({ error: 'kind must be income|expense' });
  if (!Number.isInteger(amount_paise) || amount_paise <= 0) return res.status(400).json({ error: 'amount_paise must be a positive integer' });
  const info = db.prepare(
    'INSERT INTO "transaction"(family_id,user_id,kind,amount_paise,category_id,note,txn_date) VALUES (?,?,?,?,?,?,?)'
  ).run(req.user.fid, req.user.uid, kind, amount_paise, category_id || null, note || null, txn_date || today());
  res.json(db.prepare('SELECT * FROM "transaction" WHERE id=?').get(Number(info.lastInsertRowid)));
});

app.delete('/transactions/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM "transaction" WHERE id=? AND family_id=?').run(req.params.id, req.user.fid);
  res.json({ ok: true });
});

/* ------------------------------ LOANS ---------------------------- */
function loanWithInterest(loan, asOf) {
  const interest = accruedInterestPaise(loan.principal_paise, loan.interest_rate, loan.rate_basis, loan.start_date, asOf);
  return { ...loan, interest_paise: interest, total_paise: loan.principal_paise + interest };
}

app.get('/loans', requireAuth, (req, res) => {
  const asOf = req.query.asOf || today();
  let sql = 'SELECT * FROM loan WHERE family_id=?';
  const args = [req.user.fid];
  if (req.query.status) { sql += ' AND status=?'; args.push(req.query.status); }
  sql += ' ORDER BY start_date DESC, id DESC';
  res.json(db.prepare(sql).all(...args).map((l) => loanWithInterest(l, asOf)));
});

app.post('/loans', requireAuth, (req, res) => {
  const { counterparty, direction, principal_paise, interest_rate, rate_basis, start_date, due_date } = req.body;
  if (!['given', 'taken'].includes(direction)) return res.status(400).json({ error: 'direction must be given|taken' });
  const info = db.prepare(
    `INSERT INTO loan(family_id,counterparty,direction,principal_paise,interest_rate,rate_basis,start_date,due_date)
     VALUES (?,?,?,?,?,?,?,?)`
  ).run(req.user.fid, counterparty, direction, principal_paise, interest_rate,
        rate_basis || 'annual', start_date || today(), due_date || null);
  res.json(loanWithInterest(db.prepare('SELECT * FROM loan WHERE id=?').get(Number(info.lastInsertRowid))));
});

app.put('/loans/:id/close', requireAuth, (req, res) => {
  db.prepare('UPDATE loan SET status=? WHERE id=? AND family_id=?').run('closed', req.params.id, req.user.fid);
  res.json({ ok: true });
});

app.post('/loans/:id/payments', requireAuth, (req, res) => {
  const { amount_paise, applies_to, pay_date, note } = req.body;
  const info = db.prepare('INSERT INTO loan_payment(loan_id,amount_paise,applies_to,pay_date,note) VALUES (?,?,?,?,?)')
    .run(req.params.id, amount_paise, applies_to, pay_date || today(), note || null);
  res.json({ id: Number(info.lastInsertRowid) });
});

/* ----------------------------- SUMMARY --------------------------- */
// THE key endpoint: the single family profit/loss figure.
app.get('/summary', requireAuth, (req, res) => {
  const fid = req.user.fid;
  const { from, to } = req.query;
  const asOf = req.query.asOf || today();

  let tsql = 'SELECT kind, COALESCE(SUM(amount_paise),0) s FROM "transaction" WHERE family_id=?';
  const args = [fid];
  if (from) { tsql += ' AND txn_date>=?'; args.push(from); }
  if (to)   { tsql += ' AND txn_date<=?'; args.push(to); }
  tsql += ' GROUP BY kind';
  const rows = db.prepare(tsql).all(...args);
  const totalIncome = Number(rows.find((r) => r.kind === 'income')?.s || 0);
  const totalExpenses = Number(rows.find((r) => r.kind === 'expense')?.s || 0);

  const loans = db.prepare("SELECT * FROM loan WHERE family_id=? AND status='active'").all(fid);
  let givenPrincipal = 0, interestReceivable = 0, takenPrincipal = 0, interestPayable = 0;
  for (const l of loans) {
    const interest = accruedInterestPaise(l.principal_paise, l.interest_rate, l.rate_basis, l.start_date, asOf);
    if (l.direction === 'given') { givenPrincipal += l.principal_paise; interestReceivable += interest; }
    else { takenPrincipal += l.principal_paise; interestPayable += interest; }
  }

  res.json(netPosition({ totalIncome, totalExpenses, givenPrincipal, interestReceivable, takenPrincipal, interestPayable }));
});

/* ------------------- serve the web UI -----------------------------
   Prefers the built React app (web/dist) if you ran `npm run build`,
   otherwise falls back to the zero-build dashboard in server/public.  */
const webDist = path.join(__dirname, '..', '..', 'web', 'dist');
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(webDist));
app.use(express.static(publicDir));

const API_PREFIXES = ['/auth', '/members', '/categories', '/transactions', '/loans', '/summary'];
app.use((req, res, next) => {
  if (req.method !== 'GET' || API_PREFIXES.some((p) => req.path.startsWith(p))) return next();
  res.sendFile(path.join(webDist, 'index.html'), (err) =>
    err && res.sendFile(path.join(publicDir, 'index.html'), (e2) => e2 && next()));
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Family Finance API on http://localhost:${PORT}`));
