/** Form field builders, inline validation, and server-error mapping. */
import { html, raw, esc, attr } from './html.js';
import { icon } from './components.js';

const reqMark = raw('<span class="req" aria-hidden="true"> *</span>');
const describedBy = (name, hint) => attr('aria-describedby', hint ? `hint-${name}` : null);

export function field({ name, label, type = 'text', value = '', required = false, hint = '', placeholder = '', autocomplete, min, max, step, readonly = false, full = false, inputmode }) {
  const id = `f-${name}`;
  return html`<div class="field${full ? ' field--full' : ''}" data-field="${name}">
    <label for="${id}">${label}${required && reqMark}</label>
    <input class="input" id="${id}" name="${name}" type="${type}" value="${value ?? ''}"${attr('placeholder', placeholder)}${attr('autocomplete', autocomplete)}${attr('min', min)}${attr('max', max)}${attr('step', step)}${attr('inputmode', inputmode)}${attr('readonly', readonly)}${attr('aria-required', required ? 'true' : null)}${describedBy(name, hint)}>
    ${hint && html`<p class="field__hint" id="hint-${name}">${hint}</p>`}
    <p class="field__error" id="err-${name}" hidden></p>
  </div>`;
}

export function passwordField({ name = 'password', label = 'Password', autocomplete = 'current-password', required = true }) {
  const id = `f-${name}`;
  return html`<div class="field" data-field="${name}">
    <label for="${id}">${label}${required && reqMark}</label>
    <div class="input-group">
      <input class="input" id="${id}" name="${name}" type="password" autocomplete="${autocomplete}" aria-required="${required}">
      <button type="button" class="input-group__btn" data-toggle-password="${id}" aria-label="Show password" aria-pressed="false">${icon('eye')}</button>
    </div>
    <p class="field__error" id="err-${name}" hidden></p>
  </div>`;
}

export function selectField({ name, label, options, value = '', required = false, placeholder = 'Select…', full = false, hint = '' }) {
  const id = `f-${name}`;
  return html`<div class="field${full ? ' field--full' : ''}" data-field="${name}">
    <label for="${id}">${label}${required && reqMark}</label>
    <select class="select" id="${id}" name="${name}"${attr('aria-required', required ? 'true' : null)}${describedBy(name, hint)}>
      ${placeholder !== null && html`<option value="">${placeholder}</option>`}
      ${options.map((o) => html`<option value="${o.value}"${attr('selected', String(o.value) === String(value))}>${o.label}</option>`)}
    </select>
    ${hint && html`<p class="field__hint" id="hint-${name}">${hint}</p>`}
    <p class="field__error" id="err-${name}" hidden></p>
  </div>`;
}

export function textareaField({ name, label, value = '', required = false, rows = 4, full = true, hint = '' }) {
  const id = `f-${name}`;
  return html`<div class="field${full ? ' field--full' : ''}" data-field="${name}">
    <label for="${id}">${label}${required && reqMark}</label>
    <textarea class="textarea" id="${id}" name="${name}" rows="${rows}"${attr('aria-required', required ? 'true' : null)}${describedBy(name, hint)}>${value ?? ''}</textarea>
    ${hint && html`<p class="field__hint" id="hint-${name}">${hint}</p>`}
    <p class="field__error" id="err-${name}" hidden></p>
  </div>`;
}

/* ---------- Rules ---------- */
export const rules = {
  required: (label) => (v) => (String(v ?? '').trim() ? null : `${label} is required.`),
  email: (v) => (!v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim()) ? null : 'Enter a valid email address.'),
  integer: (label, { min, max } = {}) => (v) => {
    if (v === '' || v == null) return null;
    const n = Number(v);
    if (!Number.isInteger(n)) return `${label} must be a whole number.`;
    if (min != null && n < min) return `${label} must be at least ${min}.`;
    if (max != null && n > max) return `${label} must be at most ${max}.`;
    return null;
  },
  positive: (label) => (v) => {
    if (v === '' || v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? null : `${label} must be greater than 0.`;
  },
  matches: (other, msg) => (v, vals) => (v === vals[other] ? null : msg),
};

export const formValues = (form) => Object.fromEntries(new FormData(form).entries());

function wrapperFor(form, name) {
  return [...form.querySelectorAll('[data-field]')].find((f) => f.dataset.field.toLowerCase() === String(name).toLowerCase());
}

export function setFieldError(form, name, message) {
  const wrap = wrapperFor(form, name);
  if (!wrap) return false;
  const err = wrap.querySelector('.field__error');
  const input = wrap.querySelector('input, select, textarea');
  wrap.dataset.invalid = 'true';
  if (err) { err.textContent = message; err.hidden = false; }
  if (input) {
    input.setAttribute('aria-invalid', 'true');
    const ids = new Set((input.getAttribute('aria-describedby') || '').split(' ').filter(Boolean));
    if (err) ids.add(err.id);
    input.setAttribute('aria-describedby', [...ids].join(' '));
  }
  return true;
}

export function clearErrors(form) {
  form.querySelectorAll('[data-field]').forEach((w) => {
    delete w.dataset.invalid;
    const err = w.querySelector('.field__error');
    if (err) { err.hidden = true; err.textContent = ''; }
    w.querySelectorAll('[aria-invalid]').forEach((i) => i.removeAttribute('aria-invalid'));
  });
  const box = form.querySelector('[data-form-error]');
  if (box) { box.hidden = true; box.innerHTML = ''; }
}

export function validate(form, schema) {
  clearErrors(form);
  const vals = formValues(form);
  let first = null;
  for (const [name, fns] of Object.entries(schema)) {
    for (const fn of fns) {
      const msg = fn(vals[name], vals);
      if (msg) { setFieldError(form, name, msg); first ??= name; break; }
    }
  }
  if (first) wrapperFor(form, first)?.querySelector('input, select, textarea')?.focus();
  return !first;
}

/** Show an ApiError on a form: field errors inline, the rest in the form-level alert. */
export function showFormError(form, err) {
  clearErrors(form);
  const unmapped = [];
  for (const [field, msg] of Object.entries(err.fieldErrors || {})) {
    if (!setFieldError(form, field, msg)) unmapped.push(msg);
  }
  const box = form.querySelector('[data-form-error]');
  if (box) {
    const extra = unmapped.filter((m) => m !== err.message);
    box.innerHTML = `<div class="alert alert--error" role="alert"><i data-lucide="circle-alert" class="icon" aria-hidden="true"></i><div class="alert__body">${esc(err.message || 'Something went wrong.')}${extra.length ? `<ul>${extra.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}</div></div>`;
    box.hidden = false;
    try { window.lucide?.createIcons(); } catch { /* ignore */ }
    box.scrollIntoView({ block: 'nearest' });
  }
}

export const formErrorSlot = () => html`<div class="form-error" data-form-error hidden></div>`;

export function setBusy(btn, busy, busyLabel) {
  if (!btn) return;
  if (busy) {
    btn.dataset.label = btn.innerHTML;
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    btn.innerHTML = `<span class="spinner" aria-hidden="true"></span> ${esc(busyLabel || 'Saving…')}`;
  } else {
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
    if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
    try { window.lucide?.createIcons(); } catch { /* ignore */ }
  }
}

export function bindPasswordToggles(root) {
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-toggle-password]');
    if (!b) return;
    const input = root.querySelector(`#${b.dataset.togglePassword}`);
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    b.setAttribute('aria-pressed', String(show));
    b.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    b.innerHTML = `<i data-lucide="${show ? 'eye-off' : 'eye'}" class="icon" aria-hidden="true"></i>`;
    try { window.lucide?.createIcons(); } catch { /* ignore */ }
  });
}
