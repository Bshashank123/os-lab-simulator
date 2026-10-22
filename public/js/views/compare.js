// Compare Algorithms: same workload, every selected algorithm, results computed by the Python core.
import { h, clear, button, select, icon, table, errorBox, clone } from '../ui.js';
import * as api from '../api.js';
import { MODULES, MODULE_ORDER } from '../modules/index.js';
import { Playback, playbackControls, bindKeys } from '../playback.js';
import { moduleInput } from '../store.js';
import { barRows } from '../charts.js';
import { CONTENT, FORMULAS } from '../content.js';

const TOPIC = { cpu: 'CPU Scheduling', memory: 'Memory Allocation', files: 'File Allocation', deadlock: 'Deadlocks', paging: 'Page Replacement' };

export function bestOf(def, vals) {
  if (!def.better) return null;
  const nums = vals.map((v) => v.value);
  if (nums.every((n) => n === nums[0])) return { tie: true, ids: [] };
  const target = def.better === 'min' ? Math.min(...nums) : Math.max(...nums);
  return { tie: false, ids: vals.filter((v) => v.value === target).map((v) => v.id), value: target };
}
const valueOf = (def, res) => (def.get ? def.get(res) : res.metrics[def.key]);

export function mountCompare(root, moduleParam) {
  const mid = MODULES[moduleParam] ? moduleParam : 'cpu';
  const spec = MODULES[mid];
  const ids = Object.keys(spec.algorithms);
  const selected = new Set(ids);
  const ac = new AbortController();
  let input = moduleInput.get(mid, spec.defaultInput);
  let vizApis = [], results = null;

  const box = { inputs: h('div'), settings: h('div'), algs: h('div', { class: 'alg-pick' }), out: h('div'), errors: h('div') };
  const pb = new Playback({ onChange: sync });
  const controls = playbackControls(pb);
  bindKeys(pb, ac.signal);
  const ctx = { compare: true, rerenderInputs: () => drawInputs(), rerenderSettings: () => drawSettings() };
  const algsList = () => ids.filter((a) => selected.has(a));
  function drawInputs() { clear(box.inputs); spec.renderInputs(box.inputs, input, algsList(), invalidate, ctx); }
  function drawSettings() { clear(box.settings); spec.renderSettings(box.settings, input, algsList(), invalidate, ctx); }
  function drawAlgs() {
    clear(box.algs);
    ids.forEach((a) => {
      const id = `ca-${a}`;
      box.algs.append(h('div', { class: 'check' }, h('input', { type: 'checkbox', id, checked: selected.has(a), disabled: mid === 'deadlock',
        onChange: (e) => { e.target.checked ? selected.add(a) : selected.delete(a); drawInputs(); drawSettings(); invalidate(); } }), h('label', { for: id, text: spec.algorithms[a] })));
    });
  }
  function invalidate() {
    if (!results) return;
    results = null; vizApis = []; pb.disable();
    clear(box.out).append(h('div', { class: 'callout callout-warn', role: 'status' }, icon('warn'), h('span', { text: 'Inputs changed. Run the comparison again to refresh the results.' })));
  }
  function setInput(next) { input = next; moduleInput.set(mid, input); drawInputs(); drawSettings(); run(); }

  async function run() {
    clear(box.errors);
    const algs = algsList();
    if (mid !== 'deadlock' && algs.length < 2) { box.errors.append(errorBox(['Select at least two algorithms to compare.'])); return; }
    const res = await api.compare(mid, algs, spec.toPayload ? spec.toPayload(input, algs[0]) : input);
    if (!res.ok) { results = null; pb.disable(); clear(box.out); box.errors.append(errorBox(res.errors)); return; }
    results = res.results;
    render(algs);
  }

  function render(algs) {
    clear(box.out);
    const snapshot = clone(input);
    const list = algs.map((a) => ({ id: a, label: spec.algorithms[a], res: results[a] }));
    const defs = spec.compareMetrics;
    const lines = [];
    const winners = [];
    defs.forEach((d) => {
      const vals = list.map((x) => ({ id: x.id, label: x.label, value: valueOf(d, x.res) }));
      const b = bestOf(d, vals);
      if (!b) return;
      if (b.tie) lines.push(`${d.label}: identical for every selected algorithm (${vals[0].value}).`);
      else { const names = vals.filter((v) => b.ids.includes(v.id)).map((v) => v.label).join(' and '); lines.push(`${names} ${b.ids.length > 1 ? 'have' : 'has'} ${d.better === 'min' ? 'the lowest' : 'the highest'} ${d.label.toLowerCase()} (${b.value}).`); winners.push(b.ids.join('+')); }
    });
    if (new Set(winners).size > 1) lines.push('No single algorithm wins every metric on this workload: each one optimises a different objective.');
    lines.push(...(spec.insights ? spec.insights(results) : []));
    lines.push('These results depend on this workload and these settings. They are not a universal ranking.');

    box.out.append(h('section', { class: 'panel', 'aria-labelledby': 'h-plain' }, h('h2', { id: 'h-plain', text: 'Results in plain language' }), h('ul', { class: 'plain' }, lines.map((l) => h('li', { text: l })))));

    if (defs.length) {
      const rows = defs.map((d) => {
        const vals = list.map((x) => ({ id: x.id, label: x.label, value: valueOf(d, x.res) }));
        const b = bestOf(d, vals);
        return [d.label, ...vals.map((v) => (b && !b.tie && b.ids.includes(v.id) ? h('span', { class: 'best-cell' }, icon('check', 12), `${v.value} best`) : String(v.value))),
          b ? (b.tie ? 'Tie (no difference)' : list.filter((x) => b.ids.includes(x.id)).map((x) => x.label).join(', ')) : 'Not ranked', h('code', { text: d.formula })];
      });
      box.out.append(h('section', { class: 'panel', 'aria-labelledby': 'h-sum' }, h('h2', { id: 'h-sum', text: 'Summary table' }), table(['Metric', ...list.map((x) => x.label), 'Best', 'Formula'], rows, { caption: 'Comparison of metrics' }),
        h('p', { class: 'hint', text: 'Metrics marked "Not ranked" are shown for information: a lower number there is not automatically better.' }),
        h('div', { class: 'charts' }, defs.map((d) => { const vals = list.map((x) => ({ id: x.id, label: x.label, value: valueOf(d, x.res) })); const b = bestOf(d, vals);
          return barRows({ title: d.label, items: vals.map((v) => ({ label: v.label, value: v.value, best: !!b && !b.tie && b.ids.includes(v.id) })), formula: d.better ? '' : '(not ranked)' }); }))));
    }
    if (spec.outcomes) box.out.append(h('section', { class: 'panel', 'aria-labelledby': 'h-out' }, h('h2', { id: 'h-out', text: 'Outcomes (labelled, not ranked)' }),
      table(['Algorithm', 'Outcome', 'Detail', 'Question it answers'], spec.outcomes(results).map((r) => r.map((c) => (typeof c === 'string' && c === r[1] ? h('strong', { text: c }) : c)))), h('p', { class: 'hint', text: 'These algorithms use different inputs and answer different questions, so there is no winner.' })));

    // side by side with shared playback
    const cards = list.map((x) => {
      const vizEl = h('div', { class: 'viz-host' }), why = h('div', { class: 'explain' });
      const card = h('article', { class: 'cmp-card' }, h('h3', { text: x.res.label }), vizEl, why);
      const api2 = spec.viz(vizEl, x.res, snapshot);
      return { card, api: api2, why, res: x.res };
    });
    vizApis = cards;
    box.out.append(h('section', { class: 'panel', 'aria-labelledby': 'h-side' }, h('h2', { id: 'h-side', text: 'Side-by-side visualization' }), h('div', { class: 'viz-controls' }, controls.el),
      h('div', { class: `cmp-grid n${list.length}` }, cards.map((c) => c.card))));

    box.out.append(h('section', { class: 'panel', 'aria-labelledby': 'h-pc' }, h('h2', { id: 'h-pc', text: 'Advantages and limitations' }), h('div', { class: `cmp-grid n${list.length}` }, list.map((x) => {
      const c = CONTENT[x.id]; if (!c) return null;
      return h('article', { class: 'cmp-card' }, h('h3', { text: c.name }), h('h4', { text: 'Advantages' }), h('ul', {}, c.pros.map((p) => h('li', { text: p }))), h('h4', { text: 'Limitations' }), h('ul', {}, c.cons.map((p) => h('li', { text: p }))));
    })), h('p', { class: 'muted', text: spec.tradeoffs }),
    h('h4', { text: 'Formulas used' }), h('ul', {}, (FORMULAS[mid] || []).map((f) => h('li', {}, h('code', { text: f }))))));

    if (spec.extras) { const ex = h('section', { class: 'panel' }, h('h2', { text: "Belady's anomaly demonstration" }), h('p', { class: 'muted', text: 'Runs FIFO, LRU and Optimal for 1 to N frames on one string. Only FIFO can get worse when memory grows.' })); spec.extras(ex); box.out.append(ex); }

    const total = Math.max(...list.map((x) => x.res.steps?.length || 1));
    pb.load(total); pb.goto(total - 1);
  }

  function sync() {
    controls.sync();
    if (!results) return;
    vizApis.forEach((c) => {
      const n = (c.res.steps || []).length, i = Math.min(pb.index, n - 1);
      c.api.update(i);
      clear(c.why).append(h('h4', { text: `Decision at step ${i + 1} of ${n}` }), spec.explain(c.res, i));
    });
  }

  const tabs = h('nav', { class: 'tabs', 'aria-label': 'Comparison topic' }, MODULE_ORDER.map((m) => h('a', { class: `tab${m === mid ? ' active' : ''}`, 'aria-current': m === mid ? 'page' : 'false', href: `#/compare/${m}`, text: TOPIC[m] })));
  const sampleSel = select([{ value: '', label: 'Choose a sample…' }, ...spec.samples.map((s, i) => ({ value: String(i), label: s.name }))], '', (v) => { if (v === '') return; setInput(spec.samples[+v].make(algsList()[0])); sampleSel.value = ''; }, { 'aria-label': 'Load a sample dataset' });

  root.append(h('header', { class: 'page-head' }, h('h1', { text: 'Compare algorithms' }), h('p', { class: 'lede', text: 'Run every selected algorithm on the same workload. All numbers come from the Python core, nothing is hardcoded.' })), tabs,
    h('div', { class: 'panel' }, h('h2', { text: 'Algorithms to compare' }), box.algs, mid === 'deadlock' ? h('p', { class: 'hint', text: 'Avoidance and detection answer different questions, so both always run and their outcomes are labelled rather than ranked.' }) : null),
    h('div', { class: 'cmp-inputs' }, h('section', { class: 'panel' }, h('h2', { text: 'Shared inputs' }), h('div', { class: 'toolbar' }, sampleSel,
      button('Random', { icon: 'shuffle', small: true, onClick: () => setInput(spec.random()) }), button('Reset', { icon: 'reset', small: true, onClick: () => setInput(spec.defaultInput()) })), box.inputs),
      h('section', { class: 'panel' }, h('h2', { text: 'Common settings' }), box.settings, h('div', { class: 'toolbar' }, button('Run comparison', { icon: 'play', kind: 'primary', onClick: run })))),
    box.errors, box.out);
  drawAlgs(); drawInputs(); drawSettings(); controls.sync();
  run();
  return () => { ac.abort(); pb.destroy(); };
}
