/** Application shell: auth layout, app layout (top bar + role-aware sidebar) and focus layout (exam). */
import { html, raw, esc } from './html.js';
import { icon, refreshIcons, confirmDialog } from './components.js';
import { isAdmin, logout } from './auth.js';
import { navigate } from './router.js';
import { initials } from './utils.js';
import { students } from './services.js';
import { fullName } from './utils.js';

export const NAV = {
  admin: [
    { href: '/admin', label: 'Overview', icon: 'layout-dashboard', exact: true },
    { href: '/admin/students', label: 'Students', icon: 'users' },
    { href: '/admin/courses', label: 'Courses', icon: 'book-open' },
    { href: '/admin/enrollments', label: 'Enrollments', icon: 'clipboard-list' },
    { href: '/admin/questions', label: 'Questions', icon: 'circle-help' },
    { href: '/admin/exams', label: 'Exams', icon: 'clipboard-check' },
    { href: '/admin/attempts', label: 'Exam Attempts', icon: 'timer' },
    { href: '/admin/results', label: 'Results', icon: 'award' },
  ],
  student: [
    { href: '/student', label: 'Overview', icon: 'layout-dashboard', exact: true },
    { href: '/student/courses', label: 'Enroll for Courses', icon: 'library' },
    { href: '/student/my-courses', label: 'My Enrolled Courses', icon: 'book-marked' },
    { href: '/student/exams', label: 'Available Exams', icon: 'pencil-line' },
    { href: '/student/history', label: 'Exam History', icon: 'history' },
    { href: '/student/results', label: 'My Results', icon: 'award' },
    { href: '/student/performance', label: 'Academic Performance', icon: 'trending-up' },
    { href: '/student/profile', label: 'My Profile', icon: 'user-round' },
  ],
};

const brand = (href = '#/') => html`<a class="brand" href="${href}" aria-label="Examora home"><span class="brand__mark">${icon('graduation-cap')}</span><span class="brand__name">Examora</span></a>`;

let mode = null;
let profileName = null;

function renderAuth(app) {
  app.innerHTML = '<main id="main" class="main main--auth" tabindex="-1"><div id="page-body"></div></main>';
}

function renderApp(app, session, focus) {
  const admin = isAdmin(session);
  const items = admin ? NAV.admin : NAV.student;
  const display = profileName || session.email || 'Signed in';
  app.innerHTML = String(html`
    <a class="skip-link" href="#main">Skip to content</a>
    <header class="topbar">
      ${!focus && html`<button type="button" class="icon-btn topbar__menu" data-action="toggle-nav" aria-label="Open navigation" aria-expanded="false" aria-controls="sidebar"><span class="menu-ico menu-ico--open">${icon('menu')}</span><span class="menu-ico menu-ico--close">${icon('x')}</span></button>`}
      ${brand(admin ? '#/admin' : '#/student')}
      ${focus && html`<span class="topbar__context" id="topbar-context"></span>`}
      <div class="topbar__spacer"></div>
      <div class="userchip">
        <span class="avatar" id="user-avatar" aria-hidden="true">${initials(display)}</span>
        <span class="userchip__text"><span class="userchip__name" id="user-name">${display}</span><span class="userchip__role">${admin ? 'Administrator' : 'Student'}</span></span>
      </div>
      ${!focus && html`<button type="button" class="btn btn--ghost-light btn--sm" data-action="logout">${icon('log-out')}<span>Log out</span></button>`}
    </header>
    ${!focus && html`
      <nav class="sidebar" id="sidebar" aria-label="Main navigation">
        <p class="sidebar__label">${admin ? 'Administration' : 'Student portal'}</p>
        <ul class="nav">${items.map((i) => html`<li><a class="nav__link" href="#${i.href}" data-nav="${i.href}" data-exact="${i.exact ? '1' : ''}">${icon(i.icon)}<span>${i.label}</span></a></li>`)}</ul>
        <p class="sidebar__foot">Examinations. Results. Progress.</p>
      </nav>
      <div class="scrim" data-action="close-nav"></div>`}
    <main id="main" class="main${focus ? ' main--focus' : ''}" tabindex="-1">
      <div class="page"><div id="page-header"></div><div id="page-body"></div></div>
    </main>`);
  refreshIcons();
  loadProfileName(session);
}

async function loadProfileName(session) {
  if (profileName || !session.matricNumber) return;
  try {
    const s = await students.getByMatric(session.matricNumber);
    const name = fullName(s);
    if (name && name !== '—') {
      profileName = name;
      const n = document.getElementById('user-name');
      const a = document.getElementById('user-avatar');
      if (n) n.textContent = name;
      if (a) a.textContent = initials(name);
    }
  } catch { /* profile endpoint may be restricted; the email is shown instead */ }
}

export function mount(newMode, session) {
  const app = document.getElementById('app');
  if (newMode === 'auth' || !session) {
    if (mode !== 'auth') { renderAuth(app); mode = 'auth'; }
    return;
  }
  if (mode !== newMode) {
    renderApp(app, session, newMode === 'focus');
    mode = newMode;
  }
  const page = document.getElementById('page-header');
  if (page) page.innerHTML = '';
}

export function resetLayout() { mode = null; profileName = null; }

export function setActive(path) {
  const links = [...document.querySelectorAll('.nav__link')];
  let best = null;
  for (const l of links) {
    const href = l.dataset.nav;
    const hit = l.dataset.exact ? path === href : path === href || path.startsWith(`${href}/`);
    if (hit && (!best || href.length > best.dataset.nav.length)) best = l;
  }
  links.forEach((l) => (l === best ? l.setAttribute('aria-current', 'page') : l.removeAttribute('aria-current')));
  closeNav();
}

export function setHeader({ title, description, crumbs = [], actions }) {
  const el = document.getElementById('page-header');
  if (!el) return;
  el.innerHTML = String(html`
    ${crumbs.length ? html`<nav class="breadcrumbs" aria-label="Breadcrumb"><ol>${crumbs.map((c, i) => (c.href && i < crumbs.length - 1 ? html`<li><a href="#${c.href}">${c.label}</a></li>` : html`<li aria-current="page">${c.label}</li>`))}</ol></nav>` : ''}
    <div class="page-header">
      <div class="page-header__text"><h1>${title}</h1>${description && html`<p class="page-header__desc">${description}</p>`}</div>
      ${actions && html`<div class="page-header__actions">${actions}</div>`}
    </div>`);
  refreshIcons();
}

export function setTopbarContext(text) {
  const el = document.getElementById('topbar-context');
  if (el) el.textContent = text;
}

function closeNav() {
  document.getElementById('sidebar')?.classList.remove('is-open');
  document.querySelector('.scrim')?.classList.remove('is-open');
  document.querySelector('[data-action="toggle-nav"]')?.setAttribute('aria-expanded', 'false');
}

/** Global shell interactions (delegated, no inline handlers). */
export function bindShell() {
    document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-action]');
    if (!t) return;
    const action = t.dataset.action;
    if (action === 'toggle-nav') {
      const sb = document.getElementById('sidebar');
      const open = sb.classList.toggle('is-open');
      document.querySelector('.scrim').classList.toggle('is-open', open);
      t.setAttribute('aria-expanded', String(open));
      t.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
      if (open) sb.querySelector('a')?.focus();
    } else if (action === 'close-nav') {
      closeNav();
    } else if (action === 'logout') {
      const ok = await confirmDialog({
        title: 'Log out?',
        message: 'You will need to sign in again to continue.',
        confirmText: 'Log out',
        tone: 'primary',
      });
      if (!ok) return;
      logout();
      resetLayout();
      navigate('/login');
    }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeNav(); });
}

export { esc, raw };
