import React, { useEffect, useState } from 'react';
import { api, fmt, toPaise, getToken, setToken } from './api.js';

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function App() {
  const [authed, setAuthed] = useState(!!getToken());
  if (!authed) return <Login onAuthed={() => setAuthed(true)} />;
  return <Dashboard onLogout={() => { setToken(''); setAuthed(false); }} />;
}

function Login({ onAuthed }) {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('family@home.com');
  const [password, setPassword] = useState('password123');
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      const r = mode === 'login'
        ? await api.login(email, password)
        : await api.register(name, email, password);
      setToken(r.token);
      onAuthed();
    } catch (e) { setErr(e.message); }
  };

  return (
    <div className="auth">
      <form className="card auth-card" onSubmit={submit}>
        <h1>Family Finance</h1>
        <p className="muted">{mode === 'login' ? 'Sign in to your family account' : 'Create your family account'}</p>
        {mode === 'register' && (
          <input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} required />
        )}
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {err && <div className="err">{err}</div>}
        <button className="primary" type="submit">{mode === 'login' ? 'Sign in' : 'Create account'}</button>
        <button type="button" className="link" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'Need an account? Register' : 'Have an account? Sign in'}
        </button>
      </form>
    </div>
  );
}

function Dashboard({ onLogout }) {
  const [summary, setSummary] = useState(null);
  const [txns, setTxns] = useState([]);
  const [loans, setLoans] = useState([]);
  const [cats, setCats] = useState([]);
  const [range, setRange] = useState({ from: '', to: '' });

  const load = async () => {
    const q = range.from || range.to ? `?from=${range.from}&to=${range.to}` : '';
    const [s, t, l, c] = await Promise.all([
      api.summary(q), api.transactions(q), api.loans(), api.categories(),
    ]);
    setSummary(s); setTxns(t); setLoans(l); setCats(c);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [range.from, range.to]);

  return (
    <div className="app">
      <header>
        <h1>Family Finance</h1>
        <button className="link" onClick={onLogout}>Logout</button>
      </header>

      {summary && <NetCard s={summary} />}

      <div className="filters card">
        <label>From <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></label>
        <label>To <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></label>
        <button className="link" onClick={() => setRange({ from: '', to: '' })}>Clear</button>
      </div>

      <div className="grid">
        <TransactionPanel cats={cats} onChange={load} txns={txns} />
        <LoanPanel loans={loans} onChange={load} />
      </div>
    </div>
  );
}

function NetCard({ s }) {
  const profit = s.status === 'PROFIT';
  return (
    <div className={`card net ${profit ? 'pos' : 'neg'}`}>
      <div className="net-main">
        <span className="muted">Family Net Position</span>
        <span className="net-amount">{profit ? '+' : '−'} {fmt(Math.abs(s.netPosition))}</span>
        <span className={`badge ${profit ? 'pos' : 'neg'}`}>{s.status}</span>
      </div>
      <div className="net-break">
        <Stat label="Income" value={fmt(s.totalIncome)} />
        <Stat label="Expenses" value={fmt(s.totalExpenses)} />
        <Stat label="Operating" value={fmt(s.operatingBalance)} />
        <Stat label="Lent + interest" value={fmt(s.loansGiven.principalOutstanding + s.loansGiven.interestReceivable)} />
        <Stat label="Borrowed + interest" value={fmt(s.loansTaken.principalOutstanding + s.loansTaken.interestPayable)} />
      </div>
    </div>
  );
}
const Stat = ({ label, value }) => (
  <div className="stat"><span className="muted">{label}</span><strong>{value}</strong></div>
);

function TransactionPanel({ cats, onChange, txns }) {
  const [f, setF] = useState({ kind: 'expense', amount: '', category_id: '', note: '', txn_date: todayStr() });
  const add = async (e) => {
    e.preventDefault();
    await api.addTransaction({
      kind: f.kind, amount_paise: toPaise(f.amount),
      category_id: f.category_id ? Number(f.category_id) : null,
      note: f.note || null, txn_date: f.txn_date,
    });
    setF({ ...f, amount: '', note: '' });
    onChange();
  };
  const opts = cats.filter((c) => c.kind === f.kind);
  return (
    <div className="card">
      <h2>Income & Expenses</h2>
      <form className="row" onSubmit={add}>
        <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value, category_id: '' })}>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </select>
        <input type="number" step="0.01" min="0" placeholder="Amount ₹" value={f.amount}
          onChange={(e) => setF({ ...f, amount: e.target.value })} required />
        <select value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })}>
          <option value="">Category…</option>
          {opts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input type="date" value={f.txn_date} onChange={(e) => setF({ ...f, txn_date: e.target.value })} />
        <input placeholder="Note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        <button className="primary" type="submit">Add</button>
      </form>
      <ul className="list">
        {txns.map((t) => (
          <li key={t.id}>
            <span className={`dot ${t.kind}`} />
            <span className="grow">{t.category_name || t.note || t.kind}</span>
            <span className="muted small">{t.txn_date}</span>
            <strong className={t.kind}>{t.kind === 'income' ? '+' : '−'}{fmt(t.amount_paise)}</strong>
            <button className="x" onClick={async () => { await api.delTransaction(t.id); onChange(); }}>×</button>
          </li>
        ))}
        {!txns.length && <li className="muted">No entries yet.</li>}
      </ul>
    </div>
  );
}

function LoanPanel({ loans, onChange }) {
  const [f, setF] = useState({ counterparty: '', direction: 'given', principal: '', interest_rate: '', rate_basis: 'annual', start_date: todayStr() });
  const add = async (e) => {
    e.preventDefault();
    await api.addLoan({
      counterparty: f.counterparty, direction: f.direction,
      principal_paise: toPaise(f.principal), interest_rate: Number(f.interest_rate),
      rate_basis: f.rate_basis, start_date: f.start_date,
    });
    setF({ ...f, counterparty: '', principal: '', interest_rate: '' });
    onChange();
  };
  return (
    <div className="card">
      <h2>Loans & Simple Interest</h2>
      <form className="row" onSubmit={add}>
        <input placeholder="Person / bank" value={f.counterparty} onChange={(e) => setF({ ...f, counterparty: e.target.value })} required />
        <select value={f.direction} onChange={(e) => setF({ ...f, direction: e.target.value })}>
          <option value="given">Given (we lent)</option>
          <option value="taken">Taken (we borrowed)</option>
        </select>
        <input type="number" step="0.01" placeholder="Principal ₹" value={f.principal} onChange={(e) => setF({ ...f, principal: e.target.value })} required />
        <input type="number" step="0.01" placeholder="Rate %" value={f.interest_rate} onChange={(e) => setF({ ...f, interest_rate: e.target.value })} required />
        <select value={f.rate_basis} onChange={(e) => setF({ ...f, rate_basis: e.target.value })}>
          <option value="annual">per year</option>
          <option value="monthly">per month</option>
          <option value="daily">per day</option>
        </select>
        <input type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} />
        <button className="primary" type="submit">Add</button>
      </form>
      <ul className="list">
        {loans.map((l) => (
          <li key={l.id}>
            <span className={`dot ${l.direction === 'given' ? 'income' : 'expense'}`} />
            <span className="grow">{l.counterparty} <span className="muted small">({l.direction}, {l.interest_rate}% {l.rate_basis})</span></span>
            <span className="small muted">+int {fmt(l.interest_paise)}</span>
            <strong>{fmt(l.total_paise)}</strong>
            {l.status === 'active' && <button className="x" title="close" onClick={async () => { await api.closeLoan(l.id); onChange(); }}>✓</button>}
          </li>
        ))}
        {!loans.length && <li className="muted">No loans yet.</li>}
      </ul>
    </div>
  );
}
