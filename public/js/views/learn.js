// Educational panel: overview, complexity, trade-offs, viva questions and formulas.
import { h, clear, put } from '../ui.js';
import { CONTENT, FORMULAS } from '../content.js';

export function learnPanel(algId, moduleId, extra) {
  const c = CONTENT[algId];
  const root = h('div', { class: 'learn' });
  if (!c) return root;
  const body = h('div', { class: 'tabpanel', role: 'tabpanel' });
  const dl = (pairs) => h('dl', { class: 'terms' }, pairs.map(([t, d]) => [h('dt', { text: t }), h('dd', { text: d })]));
  const tabs = {
    Overview: () => [h('p', {}, h('strong', { text: `${c.full}. ` }), c.purpose), h('p', {}, h('strong', { text: 'Core idea. ' }), c.idea),
      h('h4', { text: 'Working steps' }), h('ol', {}, c.steps.map((s) => h('li', { text: s }))), h('h4', { text: 'Important terminology' }), dl(c.terms),
      h('p', { class: 'muted', text: 'Manual walkthrough: pause the simulation and press Next step to read the reasoning behind every decision.' })],
    Complexity: () => [dl([['Time', c.time], ['Space', c.space]]), h('p', { class: 'muted', text: `Assumptions and limits: ${c.note}` })],
    'Pros and cons': () => [h('div', { class: 'two-col' }, h('div', {}, h('h4', { text: 'Advantages' }), h('ul', {}, c.pros.map((p) => h('li', { text: p })))), h('div', {}, h('h4', { text: 'Disadvantages' }), h('ul', {}, c.cons.map((p) => h('li', { text: p })))))],
    'Viva questions': () => c.viva.map(([q, a]) => h('details', { class: 'viva' }, h('summary', { text: q }), h('p', { text: a }))),
    Formulas: () => [h('ul', {}, (FORMULAS[moduleId] || []).map((f) => h('li', {}, h('code', { text: f }))))],
  };
  const names = Object.keys(tabs);
  const tablist = h('div', { class: 'tabs', role: 'tablist', 'aria-label': `About ${c.name}` });
  let active = names[0];
  const draw = () => {
    clear(tablist).append(...names.map((n) => h('button', { type: 'button', role: 'tab', class: `tab${n === active ? ' active' : ''}`, 'aria-selected': String(n === active), tabindex: n === active ? 0 : -1,
      onClick: () => { active = n; draw(); },
      onKeydown: (e) => { const k = names.indexOf(active); if (e.key === 'ArrowRight') { active = names[(k + 1) % names.length]; draw(); tablist.querySelector('.active').focus(); } else if (e.key === 'ArrowLeft') { active = names[(k + names.length - 1) % names.length]; draw(); tablist.querySelector('.active').focus(); } } }, n)));
    clear(body).append(...[].concat(tabs[active]()));
  };
  draw();
  put(root, h('h3', { text: c.name }), tablist, body, extra);
  return root;
}
