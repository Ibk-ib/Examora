// Rendering helpers and reusable components.
// `html` is a tagged template that HTML-escapes every interpolated value unless it is already trusted
// markup (produced by `html`/`raw`). This is the app's main defence against XSS from API data.
import { fmtNum, fmtPct } from './utils.js';

export function esc(v) {
  return String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export class Safe { constructor(value) { this.value = value; } toString() { return this.value; } }
export const raw = (s) => new Safe(String(s));

function renderValue(v) {
  if (v instanceof Safe) return v.value;
  if (Array.isArray(v)) return v.map(renderValue).join('');
  if (v === null || v === undefined || v === false || v === true) return '';
  return esc(v);
}
export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => { out += renderValue(v) + strings[i + 1]; });
  return new Safe(out);
}
export function mount(el, content) { el.innerHTML = content instanceof Safe ? content.value : esc(content); }

export const icon = (name, cls = '') => raw(`<i data-lucide="${esc(name)}" class="icon ${esc(cls)}" aria-hidden="true"></i>`);

/** Delegated event helper: handler(event, matchedElement). */
export function on(root, type, selector, handler) {
  root.addEventListener(type, (e) => {
    const target = e.target instanceof Element ? e.target.closest(selector) : null;
    if (target && root.contains(target)) handler(e, target);
  });
}

export function go(path) {
  const target = `#${path}`;
  if (location.hash === target) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = target;
}

export const errorMessage = (e) => (e && e.message) || 'Something went wrong. Please try again.';

/* ---------- Toasts & dialogs ---------- */
export function toast(message, type = 'info', { timeout } = {}) {
  const host = document.getElementById('toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.innerHTML = '<span class="toast__msg"></span><button type="button" class="toast__close" aria-label="Dismiss notification">&times;</button>';
  el.querySelector('.toast__msg').textContent = message;
  el.querySelector('button').addEventListener('click', () => el.remove());
  host.appendChild(el);
  setTimeout(() => el.remove(), timeout ?? (type === 'error' ? 8000 : 4500));
}

/** Accessible confirmation dialog (native <dialog>: focus trap, Esc to cancel). Resolves true/false. */
export function confirmDialog({ title, message = '', confirmText = 'Confirm', cancelText = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'dialog';
    dlg.setAttribute('aria-labelledby', 'dlg-title');
    dlg.setAttribute('aria-describedby', 'dlg-msg');
    dlg.innerHTML = `<form method="dialog" class="dialog__body">
      <h2 id="dlg-title"></h2><div id="dlg-msg" class="dialog__msg"></div>
      <div class="dialog__actions">
        <button value="cancel" class="btn btn-secondary" autofocus></button>
        <button value="confirm" class="btn ${danger ? 'btn-danger' : 'btn-primary'}"></button>
      </div></form>`;
    dlg.querySelector('h2').textContent = title;
    const msg = dlg.querySelector('#dlg-msg');
    if (message instanceof Safe) msg.innerHTML = message.value; else msg.textContent = message;
    const [cancel, confirm] = dlg.querySelectorAll('button');
    cancel.textContent = cancelText;
    confirm.textContent = confirmText;
    dlg.addEventListener('close', () => { const ok = dlg.returnValue === 'confirm'; dlg.remove(); resolve(ok); });
    document.body.appendChild(dlg);
    dlg.showModal();
  });
}

export function setBusy(btn, busy, label = 'Saving…') {
  if (!btn) return;
  if (busy) {
    if (btn.dataset.label === undefined) btn.dataset.label = btn.innerHTML;
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    btn.innerHTML = `<span class="spinner spinner--sm" aria-hidden="true"></span>${label ? `<span>${esc(label)}</span>` : ''}`;
  } else {
    if (btn.dataset.label !== undefined) { btn.innerHTML = btn.dataset.label; delete btn.dataset.label; }
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
  }
}

/* ---------- Page chrome ---------- */
export function pageHeader({ title, description = '', crumbs = [], actions = '' }) {
  return html`<header class="page-header">
    ${crumbs.length ? html`<nav class="breadcrumbs" aria-label="Breadcrumb"><ol>${crumbs.map((c, i) =>
      (c.href && i < crumbs.length - 1) ? html`<li><a href="#${c.href}">${c.label}</a></li>` : html`<li aria-current="page">${c.label}</li>`)}</ol></nav>` : ''}
    <div class="page-header__row">
      <div><h1>${title}</h1>${description ? html`<p class="page-header__desc">${description}</p>` : ''}</div>
      ${actions ? html`<div class="page-header__actions">${actions}</div>` : ''}
    </div></header>`;
}

export const loadingState = (text = 'Loading…') => html`<div class="state state--loading" role="status"><span class="spinner" aria-hidden="true"></span><p>${text}</p></div>`;

export function emptyState({ icon: ic = 'inbox', title, text = '', action = '' }) {
  return html`<div class="state"><div class="state__icon">${icon(ic)}</div><h3>${title}</h3>${text ? html`<p>${text}</p>` : ''}${action ? html`<div class="state__actions">${action}</div>` : ''}</div>`;
}

export function errorState(err, { retry = true } = {}) {
  const status = err?.status;
  let title = 'Something went wrong';
  if (err?.network) title = 'Cannot reach the server';
  else if (status === 401) title = 'Please sign in again';
  else if (status === 403) title = 'Access denied';
  else if (status === 404) title = 'Not found';
  else if (status >= 500) title = 'Server error';
  return html`<div class="state state--error" role="alert"><div class="state__icon">${icon('triangle-alert')}</div>
    <h3>${title}</h3><p>${errorMessage(err)}</p>
    ${err?.traceId ? html`<p class="state__meta">Reference: ${err.traceId}</p>` : ''}
    ${retry && status !== 403 && status !== 404 ? html`<div class="state__actions"><button type="button" class="btn btn-secondary" data-action="retry">${icon('rotate-cw')} Try again</button></div>` : ''}
  </div>`;
}

export const alertBox = (type, content) => html`<div class="alert alert-${type}" role="${type === 'error' ? 'alert' : 'status'}">${icon(type === 'error' ? 'circle-alert' : type === 'success' ? 'circle-check' : type === 'warning' ? 'triangle-alert' : 'info')}<div>${content}</div></div>`;

export const badge = (text, tone = '') => html`<span class="badge ${tone ? `badge--${tone}` : ''}">${text}</span>`;
export function gradeBadge(grade) {
  if (!grade) return badge('—');
  const g = String(grade).trim().toUpperCase();
  const tone = g === 'A' || g === 'B' ? 'success' : g === 'C' || g === 'D' ? 'warning' : g === 'F' || g === 'E' ? 'error' : 'gold';
  return badge(g, tone);
}

/* ---------- Tables, pagination, details ---------- */
export function table({ columns, rows, caption }) {
  return html`<div class="table-wrap" role="region" aria-label="${caption}" tabindex="0"><table class="table"><caption class="sr-only">${caption}</caption>
    <thead><tr>${columns.map((c) => html`<th scope="col" class="${c.class || ''}">${c.label}</th>`)}</tr></thead>
    <tbody>${rows.map((r) => html`<tr>${columns.map((c) => html`<td class="${c.class || ''}">${c.render ? c.render(r) : (r[c.key] ?? '—')}</td>`)}</tr>`)}</tbody></table></div>`;
}

export function paginate(items, page, size) {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const p = Math.min(Math.max(1, page), pages);
  const start = (p - 1) * size;
  return { items: items.slice(start, start + size), page: p, pages, total, size, from: total ? start + 1 : 0, to: Math.min(total, start + size) };
}

export function paginationControls(meta) {
  if (meta.total === 0) return '';
  const nums = [];
  const lo = Math.max(1, meta.page - 2);
  const hi = Math.min(meta.pages, meta.page + 2);
  for (let i = lo; i <= hi; i++) nums.push(i);
  return html`<nav class="pagination" aria-label="Pagination">
    <p class="pagination__info" role="status">Showing ${meta.from}–${meta.to} of ${meta.total}</p>
    ${meta.pages > 1 ? html`<div class="pagination__pages">
      <button type="button" class="page-btn" data-page="${meta.page - 1}" ${meta.page <= 1 ? raw('disabled') : ''} aria-label="Previous page">${icon('chevron-left')}</button>
      ${lo > 1 ? html`<button type="button" class="page-btn" data-page="1">1</button>${lo > 2 ? html`<span class="muted" aria-hidden="true">…</span>` : ''}` : ''}
      ${nums.map((n) => html`<button type="button" class="page-btn" data-page="${n}" ${n === meta.page ? raw('aria-current="page"') : ''} aria-label="Page ${n}">${n}</button>`)}
      ${hi < meta.pages ? html`${hi < meta.pages - 1 ? html`<span class="muted" aria-hidden="true">…</span>` : ''}<button type="button" class="page-btn" data-page="${meta.pages}">${meta.pages}</button>` : ''}
      <button type="button" class="page-btn" data-page="${meta.page + 1}" ${meta.page >= meta.pages ? raw('disabled') : ''} aria-label="Next page">${icon('chevron-right')}</button>
    </div>` : ''}</nav>`;
}

/** actions: [{ href | action, label, icon, id, danger }] */
export function rowActions(actions) {
  return html`<div class="row-actions">${actions.filter(Boolean).map((a) => a.href
    ? html`<a class="btn btn-ghost btn-sm btn-icon" href="#${a.href}" aria-label="${a.label}" title="${a.label}">${icon(a.icon)}</a>`
    : html`<button type="button" class="btn btn-ghost btn-sm btn-icon ${a.danger ? 'btn-danger-ghost' : ''}" data-action="${a.action}" data-id="${a.id}" aria-label="${a.label}" title="${a.label}">${icon(a.icon)}</button>`)}</div>`;
}

export function descList(pairs) {
  return html`<dl class="detail-list">${pairs.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v === null || v === undefined || v === '' ? '—' : v}</dd></div>`)}</dl>`;
}

/* ---------- Dashboard widgets ---------- */
export function statCard({ label, value, icon: ic, hint = '' }) {
  const na = value === null || value === undefined;
  return html`<div class="stat-card"><div class="stat-card__icon">${icon(ic)}</div><div>
    <p class="stat-card__label">${label}</p>
    <p class="stat-card__value ${na ? 'stat-card__value--na' : ''}">${na ? 'Unavailable' : value}</p>
    ${hint ? html`<p class="stat-card__hint">${hint}</p>` : ''}</div></div>`;
}

/** items: [{label, value, display?}]; max defaults to the largest value. */
export function barChart(items, { max, unit = '' } = {}) {
  if (!items.length) return '';
  const top = max ?? Math.max(...items.map((i) => i.value), 1);
  return html`<ul class="bars">${items.map((i) => html`<li class="bar-row">
    <span class="bar-row__label" title="${i.label}">${i.label}</span>
    <span class="bar-row__track" role="img" aria-label="${i.label}: ${i.display ?? i.value}${unit}"><span class="bar-row__fill" style="display:block;width:${Math.max(0, Math.min(100, (i.value / top) * 100))}%"></span></span>
    <span class="bar-row__value">${i.display ?? i.value}</span></li>`)}</ul>`;
}

/** points: [{label, value}] with values 0-100. Needs 2+ points. */
export function lineChart(points, { title = 'Trend' } = {}) {
  const W = 600, H = 220, pad = { l: 36, r: 16, t: 14, b: 34 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const x = (i) => pad.l + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (v) => pad.t + ih - (Math.max(0, Math.min(100, v)) / 100) * ih;
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const grid = [0, 25, 50, 75, 100].map((v) => `<line class="chart-axis" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/><text class="chart-label" x="${pad.l - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join('');
  const dots = points.map((p, i) => `<circle class="chart-dot" cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="4.5"><title>${esc(p.label)}: ${esc(fmtPct(p.value))}</title></circle><text class="chart-label" x="${x(i).toFixed(1)}" y="${H - 12}" text-anchor="middle">${esc(p.short ?? '')}</text>`).join('');
  return raw(`<div class="chart-wrap"><svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}: ${esc(points.map((p) => `${p.label} ${fmtNum(p.value)}%`).join(', '))}">${grid}<path class="chart-line" d="${path}"/>${dots}</svg></div>`);
}
