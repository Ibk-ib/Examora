/** Reusable UI building blocks. All return SafeHtml unless noted. */
import { html, raw, esc } from './html.js';
import { fmtNum } from './utils.js';

export const icon = (name, cls = '') => raw(`<i data-lucide="${esc(name)}" class="icon ${esc(cls)}" aria-hidden="true"></i>`);

export function refreshIcons() {
  try { window.lucide?.createIcons(); } catch { /* icon library unavailable */ }
}

export const badge = (text, tone = 'neutral', plain = false) =>
  html`<span class="badge badge--${tone}${plain ? ' badge--plain' : ''}">${text}</span>`;

export const loading = (text = 'Loading…') =>
  html`<div class="state" role="status"><span class="spinner" aria-hidden="true"></span><p>${text}</p></div>`;

export function emptyState({ icon: ic = 'inbox', title, text = '', action } = {}) {
  const act = action
    ? action.href
      ? html`<a class="btn btn--primary" href="${action.href}">${action.label}</a>`
      : html`<button type="button" class="btn btn--secondary" data-action="${action.action}">${action.label}</button>`
    : '';
  return html`<div class="state"><div class="state__icon">${icon(ic)}</div><h3>${title}</h3>${text && html`<p>${text}</p>`}${act && html`<div class="state__actions">${act}</div>`}</div>`;
}

export function errorState(err, { retry = true } = {}) {
  const status = err?.status;
  const title = err?.network ? 'Can’t reach the server'
    : status === 401 ? 'Please sign in again'
    : status === 403 ? 'Access denied'
    : status === 404 ? 'Not found'
    : status >= 500 ? 'Server error'
    : 'Something went wrong';
  const details = (err?.errors || []).filter((e) => e.message && e.message !== err.message);
  return html`<div class="state state--error" role="alert">
    <div class="state__icon">${icon(status === 403 ? 'lock' : 'triangle-alert')}</div>
    <h3>${title}</h3>
    <p>${err?.message || 'An unexpected error occurred.'}</p>
    ${details.length ? html`<p class="small">${details.map((e) => e.message).join(' · ')}</p>` : ''}
    ${err?.traceId ? html`<p class="small">Reference: ${err.traceId}</p>` : ''}
    ${retry ? html`<div class="state__actions"><button type="button" class="btn btn--secondary" data-action="retry">${icon('refresh-cw')} Try again</button></div>` : ''}
  </div>`;
}

export function alertBox(type, content, { title } = {}) {
  const ic = { info: 'info', success: 'circle-check', error: 'circle-alert', warning: 'triangle-alert', gold: 'info' }[type] || 'info';
  return html`<div class="alert alert--${type}" ${raw(type === 'error' ? 'role="alert"' : 'role="status"')}>${icon(ic)}<div class="alert__body">${title && html`<strong>${title}</strong> `}${content}</div></div>`;
}

export function table(columns, rows, { caption = '' } = {}) {
  return html`<div class="table-wrap"><table class="table table--stack">
    <caption class="sr-only">${caption}</caption>
    <thead><tr>${columns.map((c) => html`<th scope="col" class="${c.className || ''}">${c.label}</th>`)}</tr></thead>
    <tbody>${rows.map((r) => html`<tr>${columns.map((c) => html`<td data-label="${c.label}" class="${c.className || ''}">${c.render ? c.render(r) : r[c.key]}</td>`)}</tr>`)}</tbody>
  </table></div>`;
}

export function pager(meta) {
  const { pageNumber: p, totalPages: tp, totalCount: tc, pageSize: ps } = meta;
  if (!tc) return html``;
  const from = (p - 1) * ps + 1;
  const to = Math.min(p * ps, tc);
  const pages = [];
  const add = (n) => pages.push(n);
  for (let n = 1; n <= tp; n++) if (n === 1 || n === tp || Math.abs(n - p) <= 1) add(n);
  const withGaps = [];
  pages.forEach((n, i) => { if (i && n - pages[i - 1] > 1) withGaps.push('gap'); withGaps.push(n); });
  return html`<nav class="pager" aria-label="Pagination">
    <p class="pager__info">Showing ${fmtNum(from, 0)}–${fmtNum(to, 0)} of ${fmtNum(tc, 0)}</p>
    ${tp > 1 ? html`<div class="pager__pages">
      <button type="button" class="pager__btn" data-page="${p - 1}" ${raw(p <= 1 ? 'disabled' : '')} aria-label="Previous page">${icon('chevron-left')}</button>
      ${withGaps.map((n) => (n === 'gap' ? html`<span class="pager__gap" aria-hidden="true">…</span>` : html`<button type="button" class="pager__btn" data-page="${n}" ${raw(n === p ? 'aria-current="page"' : '')} aria-label="Page ${n}">${n}</button>`))}
      <button type="button" class="pager__btn" data-page="${p + 1}" ${raw(p >= tp ? 'disabled' : '')} aria-label="Next page">${icon('chevron-right')}</button>
    </div>` : ''}
  </nav>`;
}

export function statCard({ icon: ic, label, value, hint, href }) {
  const inner = html`<div class="stat"><div class="stat__icon">${icon(ic)}</div><div><div class="stat__label">${label}</div><div class="stat__value">${value}</div>${hint && html`<div class="stat__hint">${hint}</div>`}</div></div>`;
  return html`<div class="card">${href ? html`<a href="${href}" style="display:block;text-decoration:none;color:inherit;border-radius:inherit">${inner}</a>` : inner}</div>`;
}

export const progressBar = (value, max, label) => {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return html`<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${value}" aria-label="${label}"><div class="progress__bar" style="width:${pct}%"></div></div>`;
};

export function dl(pairs) {
  return html`<dl class="dl">${pairs.map(([k, v]) => html`<dt>${k}</dt><dd>${v === null || v === undefined || v === '' ? '—' : v}</dd>`)}</dl>`;
}

/** Horizontal bar list. items: [{label, value, display?}] */
export function barList(items, { max } = {}) {
  const top = max ?? Math.max(1, ...items.map((i) => i.value));
  return html`<div class="bars">${items.map((i) => html`<div class="bars__row"><span class="bars__label" title="${i.label}">${i.label}</span><div class="bars__track" role="img" aria-label="${i.label}: ${i.display ?? i.value}"><div class="bars__fill" style="width:${Math.max(2, (i.value / top) * 100)}%"></div></div><span class="bars__value">${i.display ?? i.value}</span></div>`)}</div>`;
}

/** SVG line chart for 0–100 values. points: [{label, value}] */
export function lineChart(points) {
  const W = 640, H = 240, L = 40, R = 16, T = 12, B = 44;
  const pw = W - L - R, ph = H - T - B;
  const x = (i) => (points.length === 1 ? L + pw / 2 : L + (pw * i) / (points.length - 1));
  const y = (v) => T + ph - (Math.max(0, Math.min(100, v)) / 100) * ph;
  const grid = [0, 25, 50, 75, 100].map((g) => `<line x1="${L}" x2="${W - R}" y1="${y(g)}" y2="${y(g)}" stroke="#EADFD0"/><text x="${L - 8}" y="${y(g) + 4}" text-anchor="end">${g}</text>`).join('');
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const dots = points.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="5" fill="#F5A12D" stroke="#1A1A1A" stroke-width="2"><title>${esc(p.label)}: ${esc(fmtNum(p.value))}%</title></circle>`).join('');
  const labels = points.map((p, i) => `<text x="${x(i).toFixed(1)}" y="${H - 18}" text-anchor="middle">${esc(String(p.label).slice(0, 10))}</text>`).join('');
  return raw(`<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Score percentage per examination over time">${grid}<path d="${path}" fill="none" stroke="#1A1A1A" stroke-width="2.5"/>${dots}${labels}</svg></div>`);
}

/* ---------- Toasts ---------- */
export function toast(message, { type = 'info', timeout = 5500 } = {}) {
  const box = document.getElementById('toasts');
  if (!box) return;
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  const ic = { success: 'circle-check', error: 'circle-alert', info: 'info' }[type] || 'info';
  el.innerHTML = `<i data-lucide="${ic}" class="icon" aria-hidden="true"></i><p>${esc(message)}</p><button type="button" class="icon-btn" aria-label="Dismiss notification"><i data-lucide="x" class="icon" aria-hidden="true"></i></button>`;
  const close = () => el.remove();
  el.querySelector('button').addEventListener('click', close);
  box.append(el);
  refreshIcons();
  if (timeout) setTimeout(close, timeout);
}

/** Toast describing an ApiError, including a first field detail when informative. */
export function toastError(err, fallback = 'Something went wrong.') {
  const extra = (err?.errors || []).find((e) => e.message && e.message !== err.message);
  toast(`${err?.message || fallback}${extra ? ` ${extra.message}` : ''}`, { type: 'error', timeout: 8000 });
}

/* ---------- Dialogs (native <dialog>: focus trap, Esc to close) ---------- */
export function openDialog({ title, body, size = 'md' }) {
  const d = document.createElement('dialog');
  d.className = `dialog dialog--${size}`;
  d.setAttribute('aria-labelledby', 'dialog-title');
  d.innerHTML = `<div class="dialog__panel"><header class="dialog__header"><h2 id="dialog-title">${esc(title)}</h2><button type="button" class="icon-btn" data-dialog-close aria-label="Close dialog"><i data-lucide="x" class="icon" aria-hidden="true"></i></button></header><div class="dialog__body">${body}</div></div>`;
  document.body.append(d);
  d.addEventListener('click', (e) => {
    if (e.target === d || e.target.closest('[data-dialog-close]')) d.close();
  });
  d.addEventListener('close', () => d.remove());
  d.showModal();
  refreshIcons();
  return d;
}

export function confirmDialog({ title, message, confirmText = 'Confirm', cancelText = 'Cancel', tone = 'danger' }) {
  return new Promise((resolve) => {
    let result = false;
    const d = openDialog({
      title,
      size: 'sm',
      body: html`<p>${message}</p><div class="dialog__actions"><button type="button" class="btn btn--secondary" data-dialog-close autofocus>${cancelText}</button><button type="button" class="btn btn--${tone}" data-confirm>${confirmText}</button></div>`,
    });
    d.addEventListener('click', (e) => {
      if (e.target.closest('[data-confirm]')) { result = true; d.close(); }
    });
    d.addEventListener('close', () => resolve(result));
  });
}
