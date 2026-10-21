// Generic searchable / filterable / paginated list page used by most admin modules.
// The API only offers pageNumber/pageSize, so the full list is loaded once and filtered/paginated here.
import { CONFIG } from './config.js';
import { html, mount, icon, loadingState, errorState, emptyState, table, paginate, paginationControls, on, setBusy } from './ui.js';
import { debounce } from './utils.js';

function controlHtml(c, items, state) {
  if (c.type === 'search') {
    return html`<div class="search">${icon('search')}<input type="search" name="${c.name}" value="${state[c.name]}" placeholder="${c.placeholder || 'Search'}" aria-label="${c.label || 'Search'}" autocomplete="off"></div>`;
  }
  const opts = (typeof c.options === 'function' ? c.options(items) : c.options).map((o) => (typeof o === 'object' ? o : { value: o, label: c.format ? c.format(o) : o }));
  return html`<select name="${c.name}" aria-label="${c.label}"><option value="">${c.allLabel || `All`}</option>${opts.map((o) => html`<option value="${o.value}" ${String(o.value) === String(state[c.name]) ? 'selected' : ''}>${o.label}</option>`)}</select>`;
}

/**
 * ctx: router context. cfg:
 *  header      Safe markup (pageHeader)
 *  load()      -> Promise<items[]> (each item needs an `id`)
 *  controls    [{type:'search'|'select', name, label, placeholder, allLabel, options(items)}]
 *  filter(items, state), sort(a,b)
 *  columns     table columns
 *  actions     { actionName: async ({id,row,items,remove,redraw,button}) }
 *  empty       {icon,title,text,action} shown when there are no rows at all
 *  summary(items) optional Safe markup shown above the table
 */
export async function listPage(ctx, cfg) {
  const { view } = ctx;
  const pageSize = cfg.pageSize ?? CONFIG.DEFAULT_PAGE_SIZE;
  mount(view, html`${cfg.header}<section class="card"><div id="lp-toolbar"></div><div id="lp-body">${loadingState()}</div></section>`);
  const toolbar = view.querySelector('#lp-toolbar');
  const body = view.querySelector('#lp-body');

  let items;
  try { items = await cfg.load(); } catch (e) { mount(body, errorState(e)); return; }

  const state = { page: 1 };
  (cfg.controls ?? []).forEach((c) => { state[c.name] = c.default ?? ''; });

  if (items.length && (cfg.controls ?? []).length) {
    mount(toolbar, html`<form class="toolbar" role="search" data-lp-form novalidate>${cfg.controls.map((c) => controlHtml(c, items, state))}
      <button type="button" class="btn btn-ghost btn-sm" data-lp-clear>Clear</button></form>`);
  }

  function draw() {
    let rows = cfg.filter ? cfg.filter(items, state) : items;
    if (cfg.sort) rows = [...rows].sort(cfg.sort);
    const meta = paginate(rows, state.page, pageSize);
    state.page = meta.page;
    const summary = cfg.summary ? cfg.summary(rows, items) : '';
    if (!items.length) { mount(body, emptyState(cfg.empty ?? { title: 'Nothing here yet' })); return; }
    if (!rows.length) {
      mount(body, html`${summary}${emptyState({ icon: 'search-x', title: 'No matches', text: 'Try a different search or clear the filters.', action: html`<button type="button" class="btn btn-secondary" data-lp-clear>Clear filters</button>` })}`);
      return;
    }
    mount(body, html`${summary}${table({ columns: cfg.columns, rows: meta.items, caption: cfg.caption ?? 'Results' })}${paginationControls(meta)}`);
  }

  const onFilter = debounce((el) => { state[el.name] = el.value; state.page = 1; draw(); }, 150);
  toolbar.addEventListener('input', (e) => { if (e.target.name in state) onFilter(e.target); });
  toolbar.addEventListener('submit', (e) => e.preventDefault());
  const clear = () => {
    (cfg.controls ?? []).forEach((c) => { state[c.name] = ''; });
    state.page = 1;
    toolbar.querySelectorAll('input,select').forEach((el) => { el.value = ''; });
    draw();
  };
  on(view, 'click', '[data-lp-clear]', clear);
  on(body, 'click', '[data-page]', (e, el) => { state.page = Number(el.dataset.page); draw(); toolbar.scrollIntoView?.({ block: 'nearest' }); });
  on(body, 'click', '[data-action]', async (e, el) => {
    const handler = cfg.actions?.[el.dataset.action];
    if (!handler) return;
    const id = el.dataset.id;
    await handler({
      id, button: el, items, setBusy,
      row: items.find((r) => String(r.id) === String(id)),
      remove: (rid) => { items = items.filter((r) => String(r.id) !== String(rid)); draw(); },
      redraw: draw,
    });
  });
  draw();
}
