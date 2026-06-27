// Pure money + simple-interest helpers. All money is integer PAISE.
export const toPaise = (rupees) => Math.round(Number(rupees) * 100);
export const toRupees = (paise) => Number(paise) / 100;

const MS_PER_DAY = 86400000;

export function annualRate(rate, basis) {
  const r = Number(rate);
  if (basis === 'monthly') return r * 12;
  if (basis === 'daily') return r * 365;
  return r;
}
export function daysBetween(startDate, asOf) {
  const a = new Date(startDate + 'T00:00:00Z').getTime();
  const b = new Date(asOf + 'T00:00:00Z').getTime();
  return Math.max(0, Math.round((b - a) / MS_PER_DAY));
}
// Simple interest: SI = P * R * T / 100, T in years (days/365). Returns paise.
export function accruedInterestPaise(principalPaise, rate, basis, startDate, asOf) {
  const today = asOf || new Date().toISOString().slice(0, 10);
  const R = annualRate(rate, basis);
  const T = daysBetween(startDate, today) / 365;
  return Math.round(Number(principalPaise) * R * T / 100);
}
export function netPosition({ totalIncome, totalExpenses, givenPrincipal, interestReceivable, takenPrincipal, interestPayable }) {
  const operatingBalance = totalIncome - totalExpenses;
  const net = operatingBalance + (givenPrincipal + interestReceivable) - (takenPrincipal + interestPayable);
  return {
    totalIncome, totalExpenses, operatingBalance,
    loansGiven: { principalOutstanding: givenPrincipal, interestReceivable },
    loansTaken: { principalOutstanding: takenPrincipal, interestPayable },
    netPosition: net,
    status: net >= 0 ? 'PROFIT' : 'LOSS',
  };
}
