/**
 * Authentication and session handling.
 *
 * Storage trade-off (the API only returns a JWT in the response body, so an
 * HttpOnly cookie is not possible without backend changes):
 *   - Default: sessionStorage, cleared when the tab closes.
 *   - "Remember me": localStorage, survives restarts.
 * Either way, any script running on this origin can read the token (XSS risk).
 * This is mitigated by escaping all API data in templates and loading no third-party
 * scripts beyond the pinned icon library, but it is not "secure storage".
 * Passwords are never stored. Role checks here only shape the UI; the API enforces access.
 */
import { api, configureApi } from './api.js';
import { CONFIG } from './config.js';
import { parseDate } from './utils.js';
import { invalidate } from './services.js';

const KEY = 'examora.session';

function read() {
  for (const store of [sessionStorage, localStorage]) {
    try {
      const v = store.getItem(KEY);
      if (v) return JSON.parse(v);
    } catch { /* storage unavailable */ }
  }
  return null;
}

export function clearSession() {
  invalidate(); // never carry one user's cached lists into another session
  for (const store of [sessionStorage, localStorage]) {
    try { store.removeItem(KEY); } catch { /* ignore */ }
  }
}

function save(session, remember) {
  clearSession();
  try { (remember ? localStorage : sessionStorage).setItem(KEY, JSON.stringify(session)); } catch { /* ignore */ }
}

export function getSession() {
  const s = read();
  if (!s?.accessToken) return null;
  const exp = parseDate(s.expiresAtUtc);
  if (exp && exp.getTime() <= Date.now()) { clearSession(); return null; }
  return s;
}

export const isAdmin = (s = getSession()) => String(s?.role || '').toLowerCase() === CONFIG.ADMIN_ROLE;
export const homePath = (s = getSession()) => (isAdmin(s) ? '/admin' : '/student');

function fromAuthData(data, matricNumber) {
  if (!data?.accessToken) throw new Error('The server did not return an access token.');
  return {
    accessToken: data.accessToken,
    expiresAtUtc: data.expiresAtUtc,
    studentId: data.studentId,
    email: data.email,
    role: data.role,
    matricNumber,
  };
}

export async function login({ matricNumber, password, remember }) {
  const env = await api.post('/api/Auth/login', { matricNumber, password }, { auth: false });
  const session = fromAuthData(env.data, matricNumber);
  save(session, remember);
  return session;
}

export async function register(dto) {
  await api.post('/api/Auth/register', dto, { auth: false });
}

export function logout() { clearSession(); }

/** Wire the API client to the session. `handler` runs on any authenticated 401. */
export function initAuth(onExpired) {
  configureApi({
    getToken: () => getSession()?.accessToken || null,
    onUnauthorized: () => {
      if (!read()) return;
      clearSession();
      onExpired();
    },
  });
}
