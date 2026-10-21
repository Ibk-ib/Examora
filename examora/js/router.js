/** Minimal hash router. Each route renders into the shared page container. */
import { getSession, homePath } from './auth.js';
import { checkAccess } from './guards.js';
import { html } from './html.js';
import { errorState, refreshIcons } from './components.js';

const routes = [];
let hooks = { mount() {}, setActive() {}, setHeader() {} };
let current = { token: 0, cleanup: null };

export function register(list) {
  for (const r of list) {
    const keys = [];
    const src = '^' + r.path.replace(/:([A-Za-z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$';
    routes.push({ ...r, re: new RegExp(src), keys });
  }
}

export function setHooks(h) { hooks = { ...hooks, ...h }; }

function parse() {
  const raw = location.hash.slice(1) || '/';
  const [path, qs] = raw.split('?');
  return { path: path || '/', query: Object.fromEntries(new URLSearchParams(qs || '')), full: raw };
}

function match(path) {
  for (const r of routes) {
    const m = r.re.exec(path);
    if (m) return { route: r, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}

export function navigate(path, { replace = false } = {}) {
  const target = `#${path}`;
  if (replace) { history.replaceState(null, '', target); resolve(); return; }
  if (location.hash === target) { resolve(); return; }
  location.hash = path;
}

export async function resolve() {
  const { path, query, full } = parse();
  const session = getSession();
  const token = ++current.token;
  try { current.cleanup?.(); } catch { /* ignore */ }
  current.cleanup = null;

  const found = match(path);
  if (!found && path === '/') {
    navigate(session ? homePath(session) : '/login', { replace: true });
    return;
  }

  const route = found?.route || { path: '*', layout: session ? 'app' : 'auth', title: 'Not found' };
  const redirect = found ? checkAccess(route, session, full) : null;
  if (redirect) { navigate(redirect, { replace: true }); return; }

  hooks.mount(route.layout || 'app', session, route);
  hooks.setActive(path);

  // A fresh container per navigation: event listeners bound by the previous page die with the old node.
  const oldBody = document.getElementById('page-body');
  const body = document.createElement('div');
  body.id = 'page-body';
  oldBody.replaceWith(body);
  const alive = () => token === current.token;
  const ctx = {
    params: found?.params || {},
    query,
    path,
    session,
    root: body,
    alive,
    html(content) {
      if (!alive()) return;
      body.innerHTML = String(content);
      refreshIcons();
    },
    header(opts) { if (alive()) hooks.setHeader(opts); },
  };

  document.title = `${route.title ? route.title + ' · ' : ''}Examora`;
  window.scrollTo(0, 0);
  document.getElementById('main')?.focus({ preventScroll: true });

  if (!found) {
    ctx.header({ title: 'Page not found' });
    ctx.html(errorState({ status: 404, message: 'That page does not exist.' }, { retry: false }));
    return;
  }

  try {
    const cleanup = await route.render(ctx);
    if (alive()) current.cleanup = typeof cleanup === 'function' ? cleanup : null;
    else if (typeof cleanup === 'function') cleanup();
  } catch (err) {
    if (!alive()) return;
    console.error(err);
    ctx.html(html`<div class="card">${errorState(err)}</div>`);
  }
}

export function startRouter() {
  window.addEventListener('hashchange', resolve);
  resolve();
}
