import bcrypt from 'bcryptjs';
import { db, getFamilyId } from './db.js';
import { toPaise } from './core.js';

const fid = getFamilyId();

// Demo login
const email = 'family@home.com';
if (!db.prepare('SELECT 1 FROM app_user WHERE email=?').get(email)) {
  db.prepare('INSERT INTO app_user(family_id,name,email,password_hash,role) VALUES (?,?,?,?,?)')
    .run(fid, 'Nagaraju', email, bcrypt.hashSync('password123', 10), 'admin');
}
const uid = db.prepare('SELECT id FROM app_user WHERE email=?').get(email).id;

const cats = [
  ['Salary', 'income'], ['Business', 'income'], ['Rent received', 'income'],
  ['Groceries', 'expense'], ['Bills', 'expense'], ['School fees', 'expense'],
];
const haveCat = db.prepare('SELECT COUNT(*) c FROM category WHERE family_id=?').get(fid).c;
if (!haveCat) for (const [n, k] of cats)
  db.prepare('INSERT INTO category(family_id,name,kind) VALUES (?,?,?)').run(fid, n, k);

const catId = (n) => db.prepare('SELECT id FROM category WHERE family_id=? AND name=?').get(fid, n).id;

const haveTxn = db.prepare('SELECT COUNT(*) c FROM "transaction" WHERE family_id=?').get(fid).c;
if (!haveTxn) {
  const tx = [
    ['income', 75000, 'Salary', '2026-06-01'],
    ['income', 30000, 'Business', '2026-06-10'],
    ['income', 20000, 'Rent received', '2026-06-05'],
    ['expense', 18000, 'Groceries', '2026-06-12'],
    ['expense', 12000, 'Bills', '2026-06-15'],
    ['expense', 50000, 'School fees', '2026-06-20'],
  ];
  for (const [kind, rupees, cat, date] of tx)
    db.prepare('INSERT INTO "transaction"(family_id,user_id,kind,amount_paise,category_id,note,txn_date) VALUES (?,?,?,?,?,?,?)')
      .run(fid, uid, kind, toPaise(rupees), catId(cat), null, date);
}

const haveLoan = db.prepare('SELECT COUNT(*) c FROM loan WHERE family_id=?').get(fid).c;
if (!haveLoan) {
  db.prepare(`INSERT INTO loan(family_id,counterparty,direction,principal_paise,interest_rate,rate_basis,start_date)
              VALUES (?,?,?,?,?,?,?)`).run(fid, 'Ramesh (neighbour)', 'given', toPaise(50000), 12, 'annual', '2026-03-29');
  db.prepare(`INSERT INTO loan(family_id,counterparty,direction,principal_paise,interest_rate,rate_basis,start_date)
              VALUES (?,?,?,?,?,?,?)`).run(fid, 'City Bank', 'taken', toPaise(20000), 10, 'annual', '2026-01-15');
}

console.log('Seeded. Login -> email: family@home.com  password: password123');
