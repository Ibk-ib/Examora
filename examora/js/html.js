/**
 * Tiny escaping template helper. Interpolated values are HTML-escaped unless
 * they are SafeHtml (produced by html`` / raw()). API data is therefore safe by default.
 */
export class SafeHtml {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}

export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const raw = (s) => new SafeHtml(String(s ?? ''));

function str(v) {
  if (v == null || v === false) return '';
  if (v instanceof SafeHtml) return v.s;
  if (Array.isArray(v)) return v.map(str).join('');
  return esc(v);
}

export function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += str(vals[i]) + strings[i + 1];
  return new SafeHtml(out);
}

/** Optional attribute: attr('min', 0) -> ` min="0"`; attr('required', true) -> ` required`. */
export function attr(name, value) {
  if (value == null || value === false) return raw('');
  if (value === true) return raw(` ${name}`);
  return raw(` ${name}="${esc(value)}"`);
}
