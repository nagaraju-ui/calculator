import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toPaise, annualRate, daysBetween, accruedInterestPaise, netPosition } from './core.js';

test('annualRate normalises basis', () => {
  assert.equal(annualRate(12, 'annual'), 12);
  assert.equal(annualRate(2, 'monthly'), 24);
  assert.equal(annualRate(0.05, 'daily'), 18.25);
});

test('daysBetween counts calendar days', () => {
  assert.equal(daysBetween('2026-03-29', '2026-06-27'), 90);
});

test('simple interest: 50000 @ 12% for 90 days = 1479.45', () => {
  const p = toPaise(50000);
  const i = accruedInterestPaise(p, 12, 'annual', '2026-03-29', '2026-06-27');
  // 50000 * 12 * (90/365) / 100 = 1479.4520...
  assert.equal(i, 147945); // paise, rounded
});

test('zero interest before start date / day zero', () => {
  assert.equal(accruedInterestPaise(toPaise(1000), 10, 'annual', '2026-06-27', '2026-06-27'), 0);
});

test('netPosition sign: profit', () => {
  const r = netPosition({
    totalIncome: toPaise(125000), totalExpenses: toPaise(80000),
    givenPrincipal: toPaise(50000), interestReceivable: 147945,
    takenPrincipal: toPaise(20000), interestPayable: 89589,
  });
  // 45000 + (50000+1479.45) - (20000+895.89) = 76583.56
  assert.equal(r.status, 'PROFIT');
  assert.equal(r.netPosition, toPaise(45000) + (toPaise(50000)+147945) - (toPaise(20000)+89589));
});

test('netPosition sign: loss', () => {
  const r = netPosition({
    totalIncome: toPaise(10000), totalExpenses: toPaise(30000),
    givenPrincipal: 0, interestReceivable: 0,
    takenPrincipal: toPaise(50000), interestPayable: toPaise(1000),
  });
  assert.equal(r.status, 'LOSS');
  assert.ok(r.netPosition < 0);
});
