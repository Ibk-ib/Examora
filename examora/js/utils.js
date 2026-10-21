export function parseDate(v) {
  if (!v) return null;
  let s = String(v);
  // ASP.NET may omit the offset on UTC values; treat offset-less timestamps as UTC.
  if (!/[zZ]|[+-]\d\d:?\d\d$/.test(s)) s += 'Z';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const fmtDate = (v) => {
  const d = parseDate(v);
  return d ? d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
};

export const fmtDateTime = (v) => {
  const d = parseDate(v);
  return d ? d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
};

export const fmtNum = (n, dp = 1) =>
  n == null || Number.isNaN(Number(n)) ? '—' : Number(n).toLocaleString(undefined, { maximumFractionDigits: dp });

export const fullName = (p) => [p?.firstName, p?.lastName].filter(Boolean).join(' ') || '—';

export const initials = (name) =>
  String(name || '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0].toUpperCase()).join('') || '?';

export function debounce(fn, ms = 250) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/** Event delegation without inline handlers. */
export function delegate(root, type, selector, handler) {
  root.addEventListener(type, (e) => {
    const t = e.target.closest?.(selector);
    if (t && root.contains(t)) handler(e, t);
  });
}

export function groupBy(items, keyFn) {
  const m = new Map();
  for (const it of items) {
    const k = keyFn(it);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(it);
  }
  return m;
}

export const byId = (items) => new Map(items.map((i) => [i.id, i]));
export const uniqueSorted = (arr) => [...new Set(arr.filter((v) => v !== null && v !== undefined && v !== ''))].sort((a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b))));
export const includesText = (haystack, needle) => String(haystack ?? '').toLowerCase().includes(String(needle).trim().toLowerCase());
