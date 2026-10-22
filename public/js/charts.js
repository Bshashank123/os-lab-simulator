// Dependency-free bar charts. Values are always printed as text, so colour is never the only signal.
import { h, icon } from './ui.js';

/** Horizontal bars, one per item. items: [{label, value, best}] */
export function barRows({ title, items, unit = '', formula }) {
  const max = Math.max(...items.map((i) => i.value), 0) || 1;
  return h('figure', { class: 'chart' }, h('figcaption', {}, h('strong', { text: title }), formula ? h('small', { class: 'muted', text: ` ${formula}` }) : null),
    h('div', { class: 'bars', role: 'list' }, items.map((it) => h('div', { class: `bar-row${it.best ? ' best' : ''}`, role: 'listitem' },
      h('span', { class: 'bar-label', text: it.label }),
      h('span', { class: 'bar-track' }, h('span', { class: 'bar-fill', style: { width: `${Math.max(2, (it.value / max) * 100)}%` } })),
      h('span', { class: 'bar-value' }, `${it.value}${unit}`, it.best ? h('span', { class: 'best-tag' }, icon('check', 12), ' best') : null)))));
}

/** Vertical columns. labels: x categories; values: numbers; highlight: indices to emphasise. */
export function columns({ title, labels, values, highlight = [], xLabel = '', yLabel = '' }) {
  const max = Math.max(...values, 1);
  return h('figure', { class: 'chart' }, h('figcaption', {}, h('strong', { text: title })),
    h('div', { class: 'cols', role: 'list', 'aria-label': title }, values.map((v, i) => h('div', { class: `col${highlight.includes(i) ? ' hot' : ''}`, role: 'listitem' },
      h('span', { class: 'col-value', text: v }), h('span', { class: 'col-bar', style: { height: `${(v / max) * 100}%` } }), h('span', { class: 'col-label', text: labels[i] })))),
    h('div', { class: 'axis-note muted', text: `${xLabel}${xLabel && yLabel ? ' / ' : ''}${yLabel}` }));
}
