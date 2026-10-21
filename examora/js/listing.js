/**
 * Generic searchable, filterable, paginated list.
 *
 * - No active filter: server pagination, using the API's pagination metadata.
 * - Active filter (or clientSide: true): loads all pages (bounded by CONFIG) and
 *   filters/paginates in the browser, because the API has no search parameters.
 */
import { api, fetchAllPages } from './api.js';
import { CONFIG } from './config.js';
import { paginate } from './pagination.js';
import { html, raw } from './html.js';
import { loading, emptyState, errorState, pager, refreshIcons } from './components.js';
import { debounce, delegate } from './utils.js';

async function loadPage({ path, page, pageSize, clientSide, predicate, transform, boxes }) {
  if (!clientSide) {
    const env = await api.get(path, { pageNumber: page, pageSize });
    const d = env.data || {};
    const items = transform ? transform(d.items || []) : d.items || [];
    return {
      items,
      meta: {
        pageNumber: d.pageNumber ?? page,
        pageSize: d.pageSize ?? pageSize,
        totalCount: d.totalCount ?? items.length,
        totalPages: d.totalPages ?? 1,
        hasNextPage: Boolean(d.hasNextPage),
        hasPreviousPage: Boolean(d.hasPreviousPage),
      },
      truncated: false,
    };
  }
  boxes[path] ??= await fetchAllPages(path);
  const all = boxes[path];
  let items = predicate ? all.items.filter(predicate) : all.items;
  if (transform) items = transform(items);
  return { ...paginate(items, page, pageSize), truncated: all.truncated, loadedCount: all.items.length, totalOnServer: all.totalCount };
}

/**
 * cfg: {
 *   path(state) -> string, pageSize, state, prepare() -> lookups,
 *   toolbar(state, lookups) -> html, filtering(state) -> bool, clientSide,
 *   predicate(state, lookups) -> (row)=>bool, transform(items, lookups),
 *   renderItems(items, state, lookups) -> html, empty: {icon,title,text,filteredText,action}, wrapperClass
 * }
 */
export async function mountList(ctx, cfg) {
  const state = { page: 1, ...cfg.state };
  let lookups = {};
  if (cfg.prepare) { try { lookups = await cfg.prepare(); } catch { lookups = {}; } }
  if (!ctx.alive()) return null;

  ctx.html(html`<div class="card ${cfg.wrapperClass || ''}">
    <form class="toolbar" role="search" data-toolbar>${cfg.toolbar(state, lookups)}</form>
    <div data-results aria-live="polite"></div>
    <div data-note></div>
    <div data-pager></div>
  </div>`);

  const root = ctx.root;
  const results = root.querySelector('[data-results]');
  const pagerEl = root.querySelector('[data-pager]');
  const noteEl = root.querySelector('[data-note]');
  let boxes = {};
  let seq = 0;

  const isFiltering = () => Boolean(cfg.filtering?.(state));

  async function load() {
    const mine = ++seq;
    results.innerHTML = String(loading());
    pagerEl.innerHTML = '';
    noteEl.innerHTML = '';
    try {
      const page = await loadPage({
        path: cfg.path(state),
        page: state.page,
        pageSize: cfg.pageSize || CONFIG.PAGE_SIZE,
        clientSide: Boolean(cfg.clientSide) || isFiltering(),
        predicate: cfg.predicate?.(state, lookups),
        transform: cfg.transform ? (items) => cfg.transform(items, lookups) : undefined,
        boxes,
      });
      if (mine !== seq || !ctx.alive()) return;
      if (!page.items.length) {
        const e = cfg.empty || {};
        results.innerHTML = String(emptyState({
          icon: e.icon || 'inbox',
          title: isFiltering() ? 'No matching results' : e.title || 'Nothing here yet',
          text: isFiltering() ? e.filteredText || 'Try changing or clearing your search and filters.' : e.text || '',
          action: isFiltering() ? { label: 'Clear filters', action: 'reset-filters' } : e.action,
        }));
      } else {
        results.innerHTML = String(cfg.renderItems(page.items, state, lookups));
        pagerEl.innerHTML = String(pager(page.meta));
      }
      if (page.truncated) {
        noteEl.innerHTML = String(html`<p class="list-note">Showing results from the first ${page.loadedCount} of ${page.totalOnServer} records; search and filters only cover loaded records.</p>`);
      }
      refreshIcons();
    } catch (err) {
      if (mine !== seq || !ctx.alive()) return;
      results.innerHTML = String(errorState(err));
      refreshIcons();
    }
  }

  const form = root.querySelector('[data-toolbar]');
  form.addEventListener('submit', (e) => e.preventDefault());
  const onFilter = (e) => {
    const el = e.target.closest('[data-filter]');
    if (!el) return;
    state[el.dataset.filter] = el.value;
    state.page = 1;
    load();
  };
  form.addEventListener('input', debounce((e) => { if (e.target.matches('input[data-filter]')) onFilter(e); }, 250));
  form.addEventListener('change', (e) => { if (e.target.matches('select[data-filter]')) onFilter(e); });

  delegate(root, 'click', '[data-page]', (_e, el) => {
    const n = Number(el.dataset.page);
    if (!n || el.disabled) return;
    state.page = n;
    load().then(() => root.querySelector('.card')?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  });
  delegate(root, 'click', '[data-action="retry"]', () => load());
  delegate(root, 'click', '[data-action="reset-filters"]', () => {
    form.querySelectorAll('[data-filter]').forEach((el) => { el.value = ''; state[el.dataset.filter] = ''; });
    state.page = 1;
    load();
  });

  await load();
  return {
    state,
    reload({ fresh = true } = {}) { if (fresh) boxes = {}; return load(); },
  };
}

/** Standard search input for toolbars. */
export const searchField = (state, placeholder = 'Search…', label = 'Search') => html`<div class="field field--search"><label for="flt-search">${label}</label><input class="input" id="flt-search" type="search" data-filter="search" value="${state.search || ''}" placeholder="${placeholder}" autocomplete="off"></div>`;

export const filterSelect = (key, label, options, state, allLabel = 'All') => html`<div class="field"><label for="flt-${key}">${label}</label><select class="select" id="flt-${key}" data-filter="${key}"><option value="">${allLabel}</option>${options.map((o) => html`<option value="${o.value}"${String(o.value) === String(state[key] ?? '') ? raw(' selected') : ''}>${o.label}</option>`)}</select></div>`;

