import { h, clear, button, table, toast, icon } from '../ui.js';
import { saved, openEntry } from '../store.js';
import { MODULES } from '../modules/index.js';
import { exportCSV, exportJSON, exportAllJSON } from '../export.js';
import * as api from '../api.js';

const fmtDate = (iso) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function mountSaved(root) {
  const list = h('div', { class: 'saved-list' });
  async function tableFor(e) {
    const spec = MODULES[e.module];
    let result = e.result;
    if (!result) { const res = await api.simulate(e.module, e.algorithm, spec.toPayload ? spec.toPayload(e.input, e.algorithm) : e.input); if (res.ok) result = res.result; }
    return { spec, result };
  }
  function draw() {
    const all = saved.all();
    clear(list);
    if (!all.length) { list.append(h('p', { class: 'empty', text: 'No saved experiments yet. Run a simulation in any week and press Save to keep it here. Everything is stored only in this browser.' })); return; }
    all.forEach((e) => {
      const spec = MODULES[e.module];
      list.append(h('article', { class: 'panel saved-item' },
        h('div', { class: 'panel-head' }, h('div', {}, h('h3', { text: e.name }), h('p', { class: 'muted', text: `Week ${e.week}: ${e.topic}, ${spec?.algorithms[e.algorithm] || e.algorithm}. Saved ${fmtDate(e.date)}` }))),
        h('div', { class: 'metric-grid compact' }, Object.entries(e.metrics || {}).filter(([, v]) => ['number', 'string'].includes(typeof v)).slice(0, 6).map(([k, v]) => h('div', { class: 'metric' }, h('span', { class: 'metric-label', text: k.replace(/_/g, ' ') }), h('span', { class: 'metric-value', text: String(v) })))),
        h('div', { class: 'toolbar' },
          button('Reopen', { icon: 'play', kind: 'primary', small: true, onClick: () => openEntry(e) }),
          button('Duplicate', { icon: 'copy', small: true, onClick: () => { const { id, date, ...rest } = e; saved.add({ ...rest, name: `${e.name} (copy)` }); draw(); toast('Duplicated.'); } }),
          button('Rename', { icon: 'edit', small: true, onClick: () => { const n = window.prompt('New name', e.name); if (n && n.trim()) { saved.update(e.id, { name: n.trim() }); draw(); } } }),
          button('CSV', { icon: 'download', small: true, onClick: async () => { const { spec: s, result } = await tableFor(e); exportCSV(e, result ? s.table(result) : null); } }),
          button('JSON', { icon: 'download', small: true, onClick: async () => { const { result } = await tableFor(e); exportJSON({ ...e, result }); } }),
          button('Delete', { icon: 'trash', small: true, kind: 'danger', onClick: () => { if (window.confirm(`Delete "${e.name}"?`)) { saved.remove(e.id); draw(); } } }))));
    });
  }
  root.append(h('header', { class: 'page-head' }, h('h1', { text: 'Saved experiments' }), h('p', { class: 'lede', text: 'Saved in this browser only (localStorage). Nothing is uploaded to a server. Clearing your browser data removes them, so export anything you want to keep.' })),
    h('div', { class: 'toolbar' }, button('Export all as JSON', { icon: 'download', onClick: () => { const a = saved.all(); if (a.length) exportAllJSON(a); else toast('Nothing to export yet.', 'error'); } }),
      button('Reset history', { icon: 'trash', kind: 'danger', onClick: () => { if (saved.all().length && window.confirm('Delete ALL saved experiments? This cannot be undone.')) { saved.clear(); draw(); toast('History cleared.'); } } })), list);
  draw();
  return () => {};
}
