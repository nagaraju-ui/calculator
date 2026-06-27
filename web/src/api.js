// Tiny API client. Token kept in memory + localStorage.
const KEY = 'ffm_token';
export const getToken = () => localStorage.getItem(KEY) || '';
export const setToken = (t) => t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY);

async function req(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.status === 204 ? null : res.json();
}

export const api = {
  login: (email, password) => req('POST', '/auth/login', { email, password }),
  register: (name, email, password) => req('POST', '/auth/register', { name, email, password }),
  summary: (q = '') => req('GET', `/summary${q}`),
  transactions: (q = '') => req('GET', `/transactions${q}`),
  addTransaction: (t) => req('POST', '/transactions', t),
  delTransaction: (id) => req('DELETE', `/transactions/${id}`),
  categories: () => req('GET', '/categories'),
  loans: (q = '') => req('GET', `/loans${q}`),
  addLoan: (l) => req('POST', '/loans', l),
  closeLoan: (id) => req('PUT', `/loans/${id}/close`),
};

export const fmt = (paise) =>
  '₹' + (Number(paise) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const toPaise = (rupees) => Math.round(Number(rupees) * 100);
