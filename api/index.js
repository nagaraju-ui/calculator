import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import { q, q1, ensureSchema, getFamilyId, seedDefaultCategories } from '../lib/db.js';
import { signToken, requireAuth } from '../lib/auth.js';
import { accruedInterestPaise, netPosition } from '../lib/core.js';

const app = express();
app.use(cors());
app.use(express.json());

// Vercel routes /api/* to this function; strip the prefix so routes are clean.
app.use((req, _res, next) => {
  if (req.url === '/api') req.url = '/';
  else if (req.url.startsWith('/api/')) req.url = req.url.slice(4);
  next();
});

// Make sure tables exist (runs once per warm instance).
app.use(async (req, res, next) => {
  try { await ensureSchema(); next(); } catch (e) { next(e); }
});

const today = () => new Date().toISOString().slice(0, 10);
const num = (v) => Number(v); // BIGINT comes back from pg as a string
const ymd = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10)); // normalise DATE

app.get('/health', (_req, res) => res.json({ ok: true }));

/* ----------------------------- AUTH ----------------------------- */
app.post('/auth/register', async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'name, email, password required' });
    const fid = await getFamilyId();
    const hash = bcrypt.hashSync(password, 10);
    let user;
    try {
      user = await q1(
        'INSERT INTO app_user(family_id,name,email,password_hash,role) VALUES ($1,$2,$3,$4,$5) RETURNING *',
        [fid, name, email, hash, 'admin']);
    } catch { return res.status(409).json({ error: 'Email already registered' }); }
    await seedDefaultCategories(fid);
    res.json({ token: signToken(user), user: { id: user.id, name: user.name, role: user.role } });
  } catch (e) { next(e); }
});

app.post('/auth/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await q1('SELECT * FROM app_user WHERE email=$1', [email]);
    if (!user || !bcrypt.compareSync(password, user.password_hash))
      return res.status(401).json({ error: 'Invalid credentials' });
    res.json({ token: signToken(user), user: { id: user.id, name: user.name, role: user.role } });
  } catch (e) { next(e); }
});

app.get('/members', requireAuth, async (req, res, next) => {
  try { res.json(await q('SELECT id,name,role FROM app_user WHERE family_id=$1', [req.user.fid])); }
  catch (e) { next(e); }
});

/* --------------------------- CATEGORIES -------------------------- */
app.get('/categories', requireAuth, async (req, res, next) => {
  try { res.json(await q('SELECT * FROM category WHERE family_id=$1 ORDER BY kind,name', [req.user.fid])); }
  catch (e) { next(e); }
});
app.post('/categories', requireAuth, async (req, res, next) => {
  try {
    const { name, kind } = req.body;
    res.json(await q1('INSERT INTO category(family_id,name,kind) VALUES ($1,$2,$3) RETURNING *', [req.user.fid, name, kind]));
  } catch (e) { next(e); }
});

/* -------------------------- TRANSACTIONS ------------------------- */
app.get('/transactions', requireAuth, async (req, res, next) => {
  try {
    const { from, to, kind } = req.query;
    let sql = `SELECT t.*, c.name AS category_name, u.name AS user_name
               FROM txn t LEFT JOIN category c ON c.id=t.category_id
               LEFT JOIN app_user u ON u.id=t.user_id WHERE t.family_id=$1`;
    const args = [req.user.fid];
    if (from) { args.push(from); sql += ` AND t.txn_date>=$${args.length}`; }
    if (to)   { args.push(to);   sql += ` AND t.txn_date<=$${args.length}`; }
    if (kind) { args.push(kind); sql += ` AND t.kind=$${args.length}`; }
    sql += ' ORDER BY t.txn_date DESC, t.id DESC';
    res.json(await q(sql, args));
  } catch (e) { next(e); }
});

app.post('/transactions', requireAuth, async (req, res, next) => {
  try {
    const { kind, amount_paise, category_id, note, txn_date } = req.body;
    if (!['income', 'expense'].includes(kind)) return res.status(400).json({ error: 'kind must be income|expense' });
    if (!Number.isInteger(amount_paise) || amount_paise <= 0) return res.status(400).json({ error: 'amount_paise must be a positive integer' });
    const row = await q1(
      `INSERT INTO txn(family_id,user_id,kind,amount_paise,category_id,note,txn_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user.fid, req.user.uid, kind, amount_paise, category_id || null, note || null, txn_date || today()]);
    res.json(row);
  } catch (e) { next(e); }
});

app.delete('/transactions/:id', requireAuth, async (req, res, next) => {
  try { await q('DELETE FROM txn WHERE id=$1 AND family_id=$2', [req.params.id, req.user.fid]); res.json({ ok: true }); }
  catch (e) { next(e); }
});

/* ------------------------------ LOANS ---------------------------- */
function withInterest(loan, asOf) {
  const interest = accruedInterestPaise(loan.principal_paise, loan.interest_rate, loan.rate_basis, ymd(loan.start_date), asOf);
  return { ...loan, interest_paise: interest, total_paise: num(loan.principal_paise) + interest };
}
app.get('/loans', requireAuth, async (req, res, next) => {
  try {
    const asOf = req.query.asOf || today();
    let sql = 'SELECT * FROM loan WHERE family_id=$1';
    const args = [req.user.fid];
    if (req.query.status) { args.push(req.query.status); sql += ` AND status=$${args.length}`; }
    sql += ' ORDER BY start_date DESC, id DESC';
    res.json((await q(sql, args)).map((l) => withInterest(l, asOf)));
  } catch (e) { next(e); }
});

app.post('/loans', requireAuth, async (req, res, next) => {
  try {
    const { counterparty, direction, principal_paise, interest_rate, rate_basis, start_date, due_date } = req.body;
    if (!['given', 'taken'].includes(direction)) return res.status(400).json({ error: 'direction must be given|taken' });
    const row = await q1(
      `INSERT INTO loan(family_id,counterparty,direction,principal_paise,interest_rate,rate_basis,start_date,due_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.fid, counterparty, direction, principal_paise, interest_rate, rate_basis || 'annual', start_date || today(), due_date || null]);
    res.json(withInterest(row, today()));
  } catch (e) { next(e); }
});

app.put('/loans/:id/close', requireAuth, async (req, res, next) => {
  try { await q("UPDATE loan SET status='closed' WHERE id=$1 AND family_id=$2", [req.params.id, req.user.fid]); res.json({ ok: true }); }
  catch (e) { next(e); }
});

app.post('/loans/:id/payments', requireAuth, async (req, res, next) => {
  try {
    const { amount_paise, applies_to, pay_date, note } = req.body;
    const row = await q1('INSERT INTO loan_payment(loan_id,amount_paise,applies_to,pay_date,note) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [req.params.id, amount_paise, applies_to, pay_date || today(), note || null]);
    res.json(row);
  } catch (e) { next(e); }
});

/* ----------------------------- SUMMARY --------------------------- */
app.get('/summary', requireAuth, async (req, res, next) => {
  try {
    const fid = req.user.fid;
    const { from, to } = req.query;
    const asOf = req.query.asOf || today();

    let tsql = 'SELECT kind, COALESCE(SUM(amount_paise),0) AS s FROM txn WHERE family_id=$1';
    const args = [fid];
    if (from) { args.push(from); tsql += ` AND txn_date>=$${args.length}`; }
    if (to)   { args.push(to);   tsql += ` AND txn_date<=$${args.length}`; }
    tsql += ' GROUP BY kind';
    const rows = await q(tsql, args);
    const totalIncome = num(rows.find((r) => r.kind === 'income')?.s || 0);
    const totalExpenses = num(rows.find((r) => r.kind === 'expense')?.s || 0);

    const loans = await q("SELECT * FROM loan WHERE family_id=$1 AND status='active'", [fid]);
    let givenPrincipal = 0, interestReceivable = 0, takenPrincipal = 0, interestPayable = 0;
    for (const l of loans) {
      const interest = accruedInterestPaise(l.principal_paise, l.interest_rate, l.rate_basis, ymd(l.start_date), asOf);
      if (l.direction === 'given') { givenPrincipal += num(l.principal_paise); interestReceivable += interest; }
      else { takenPrincipal += num(l.principal_paise); interestPayable += interest; }
    }
    res.json(netPosition({ totalIncome, totalExpenses, givenPrincipal, interestReceivable, takenPrincipal, interestPayable }));
  } catch (e) { next(e); }
});

// JSON error handler
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error', detail: String(err.message || err) });
});

export default app;
