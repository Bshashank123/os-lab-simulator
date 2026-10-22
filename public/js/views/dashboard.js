import { h, icon, chip } from '../ui.js';
import { WEEKS } from '../navigation.js';
import { MODULES } from '../modules/index.js';
import { progress, recent, saved, openEntry } from '../store.js';

const fmtDate = (iso) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function mountDashboard(root) {
  const prog = progress.all();
  const hero = h('section', { class: 'hero' },
    h('div', { class: 'hero-ruler', 'aria-hidden': 'true' }, Array.from({ length: 41 }, (_, i) => h('i', { class: i % 5 === 0 ? 'major' : '' }))),
    h('h1', {}, h('span', { class: 'l1', text: 'Understand.' }), h('span', { class: 'l2', text: 'Simulate.' }), h('span', { class: 'l3', text: 'Compare.' })),
    h('p', { class: 'lede', text: 'Welcome to the OS Lab Simulator. Pick a week, edit the inputs, then step through each algorithm one decision at a time. Every number on screen is computed by the Python core from the inputs you gave it.' }),
    h('div', { class: 'toolbar' }, h('a', { class: 'btn btn-primary', href: '#/week/1' }, icon('play'), h('span', { text: 'Start with Week 1' })), h('a', { class: 'btn btn-secondary', href: '#/compare/cpu' }, icon('chart'), h('span', { text: 'Compare algorithms' }))));

  const cards = h('div', { class: 'week-grid' }, WEEKS.map((w) => {
    const pct = progress.pct(w.n), p = prog[w.n] || {};
    return h('article', { class: `week-card mod-${w.module}` },
      h('div', { class: 'wc-top' }, h('span', { class: 'wc-num', text: `Week ${w.n}` }), h('span', { class: 'wc-topic', text: w.topic })),
      h('h3', { text: w.covers }), h('p', { text: w.blurb }),
      h('div', { class: 'wc-progress' }, h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pct, 'aria-label': `Week ${w.n} progress` }, h('div', { class: 'progress-fill', style: { width: `${pct}%` } })),
        h('small', { class: 'muted', text: `${pct}% done: ${[p.ran ? 'ran' : null, p.finished ? 'watched to the end' : null, p.saved ? 'saved' : null].filter(Boolean).join(', ') || 'not started'}` })),
      h('a', { class: 'btn btn-secondary', href: `#/week/${w.n}`, 'aria-label': `Open Week ${w.n} simulator: ${w.covers}` }, h('span', { text: 'Open simulator' })));
  }));

  const rec = recent.all(), sv = saved.all().slice(0, 3);
  const recentList = rec.length ? h('ul', { class: 'entry-list' }, rec.slice(0, 5).map((e) => h('li', {},
    h('div', {}, h('strong', { text: `Week ${e.week}: ${e.label}` }), h('div', { class: 'muted', text: fmtDate(e.date) }), h('div', { class: 'qrow' }, Object.entries(e.summary || {}).map(([k, v]) => chip(`${k.replace(/_/g, ' ')}: ${v}`)))),
    h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onClick: () => openEntry(e) }, 'Reopen')))) : h('p', { class: 'empty', text: 'No simulations yet. Open a week and press Run simulation: your latest runs will appear here.' });
  const savedList = sv.length ? h('ul', { class: 'entry-list' }, sv.map((e) => h('li', {}, h('div', {}, h('strong', { text: e.name }), h('div', { class: 'muted', text: `Week ${e.week}, ${MODULES[e.module]?.algorithms[e.algorithm] || e.algorithm}, ${fmtDate(e.date)}` })),
    h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onClick: () => openEntry(e) }, 'Open')))) : h('p', { class: 'empty', text: 'Nothing saved yet. Use Save on any simulation to keep an experiment in this browser.' });

  root.append(hero, h('section', { 'aria-labelledby': 'h-weeks' }, h('h2', { id: 'h-weeks', text: 'Eight lab weeks' }), cards),
    h('div', { class: 'two-col dash-lists' }, h('section', { class: 'panel' }, h('h2', { text: 'Recent simulations' }), recentList),
      h('section', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h2', { text: 'Saved experiments' }), h('a', { class: 'btn btn-ghost btn-sm', href: '#/saved' }, 'View all')), savedList)));
  return () => {};
}
