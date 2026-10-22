// The simulation workspace used by every week:
// selector, inputs, settings, visualization, playback, step log, metrics, learning panel.
import { h, clear, button, select, checkbox, table, icon, errorBox, toast, clone } from '../ui.js';
import * as api from '../api.js';
import { MODULES } from '../modules/index.js';
import { WEEKS, week as getWeek } from '../navigation.js';
import { Playback, playbackControls, bindKeys } from '../playback.js';
import { moduleInput, prefs, recent, saved, progress } from '../store.js';
import { exportCSV, exportJSON } from '../export.js';
import { learnPanel } from './learn.js';

export function mountWorkspace(root, weekN, algParam) {
  const wk = getWeek(weekN);
  const spec = MODULES[wk.module];
  const alg = wk.algs.includes(algParam) ? algParam : wk.algs[0];
  const ac = new AbortController();
  let input = moduleInput.get(spec.id, spec.defaultInput);
  let result = null, vizApi = null, lastRunInput = null;

  const el = {
    inputs: h('div'), settings: h('div'), errors: h('div'), stale: h('div'), viz: h('div', { class: 'viz-host' }),
    explain: h('div', { class: 'explain', 'aria-live': 'polite' }), log: h('ol', { class: 'step-log' }),
    metrics: h('div', { class: 'metric-grid' }), results: h('div'), notes: h('div'),
  };
  const pb = new Playback({ onChange: onPlayback });
  const controls = playbackControls(pb);
  bindKeys(pb, ac.signal);

  const ctx = { compare: false, rerenderInputs: () => drawInputs(), rerenderSettings: () => drawSettings() };
  function drawInputs() { clear(el.inputs); spec.renderInputs(el.inputs, input, [alg], invalidate, ctx); }
  function drawSettings() {
    clear(el.settings);
    spec.renderSettings(el.settings, input, [alg], invalidate, ctx);
    el.settings.append(checkbox('Auto-play after running', !!prefs.get().autoplay, (v) => prefs.set({ autoplay: v }), 'Off: step through manually with Next step.'));
  }

  function invalidate() {
    if (!result && !lastRunInput) return;
    result = null; vizApi = null;
    pb.disable();
    el.viz.classList.add('stale');
    clear(el.stale).append(h('div', { class: 'callout callout-warn', role: 'status' }, icon('warn'), h('span', { text: 'Inputs changed, so the old trace is no longer valid. Run the simulation to recalculate.' })));
    clear(el.log); clear(el.metrics); clear(el.results); clear(el.notes); clear(el.explain);
    updateButtons();
  }

  async function run() {
    clear(el.errors); clear(el.stale);
    runBtn.disabled = true;
    const payload = spec.toPayload ? spec.toPayload(input, alg) : input;
    const res = await api.simulate(spec.id, alg, payload);
    runBtn.disabled = false;
    if (!res.ok) {
      result = null; vizApi = null; pb.disable();
      clear(el.viz); clear(el.log); clear(el.metrics); clear(el.results); clear(el.notes); clear(el.explain);
      el.errors.append(errorBox(res.errors));
      updateButtons();
      el.errors.scrollIntoView({ block: 'nearest', behavior: prefs.get().motion ? 'smooth' : 'auto' });
      return;
    }
    result = res.result; lastRunInput = clone(input);
    el.viz.classList.remove('stale');
    clear(el.viz); vizApi = spec.viz(el.viz, result, clone(input));
    drawLog(); drawMetrics();
    recent.add({ week: wk.n, algorithm: alg, module: spec.id, label: `${spec.algorithms[alg] || alg}`, input: clone(input), summary: summarise(result.metrics) });
    progress.mark(wk.n, 'ran');
    pb.load(result.steps.length);
    updateButtons();
    if (prefs.get().autoplay) pb.play();
  }

  const summarise = (m) => Object.fromEntries(Object.entries(m).filter(([, v]) => ['number', 'string'].includes(typeof v)).slice(0, 4));

  function drawLog() {
    clear(el.log);
    result.steps.forEach((_, i) => el.log.append(h('li', {}, h('button', { type: 'button', class: 'log-item', 'data-i': i, onClick: () => { pb.pause(); pb.goto(i); } },
      h('span', { class: 'log-n', text: i + 1 }), h('span', { text: spec.logLine(result, i) })))));
  }
  function drawMetrics() {
    clear(el.metrics).append(...spec.metrics(result).map((m) => h('div', { class: `metric${m.tone ? ` metric-${m.tone}` : ''}`, title: m.tip || '' },
      h('span', { class: 'metric-label', text: m.label }), h('span', { class: 'metric-value', text: String(m.value) }))));
    const t = spec.table(result);
    clear(el.results).append(table(t.columns, t.rows, { caption: 'Per-item results' }));
    clear(el.notes).append(h('details', { class: 'notes' }, h('summary', { text: 'Assumptions and conventions used' }), h('ul', {}, (result.notes || []).map((n) => h('li', { text: n })))));
  }

  function onPlayback() {
    controls.sync();
    if (!result || !vizApi) return;
    vizApi.update(pb.index);
    clear(el.explain).append(h('h4', { text: `Why this step (${pb.index + 1} of ${pb.total})` }), spec.explain(result, pb.index));
    el.log.querySelectorAll('.log-item').forEach((b) => { const on = +b.dataset.i === pb.index; b.classList.toggle('active', on); b.setAttribute('aria-current', on ? 'step' : 'false'); if (on) { const box = el.log; box.scrollTop = b.offsetTop - box.clientHeight / 2 + b.clientHeight / 2; } });
    if (pb.index === pb.total - 1) progress.mark(wk.n, 'finished');
  }

  function experiment(name) {
    return { name, week: wk.n, topic: wk.topic, module: spec.id, algorithm: alg, input: clone(lastRunInput || input), settings: { speed: pb.speed, priority_rule: input.priority_rule, quantum: input.quantum },
      metrics: result.metrics, date: new Date().toISOString() };
  }
  function save() {
    if (!result) return;
    const name = window.prompt('Name this experiment', `${wk.topic}: ${spec.algorithms[alg] || alg} #${saved.all().length + 1}`);
    if (!name) return;
    const item = saved.add({ ...experiment(name.trim()), result });
    if (!item) { toast('Browser storage is full. Delete some saved experiments and try again.', 'error'); return; }
    progress.mark(wk.n, 'saved');
    toast(`Saved "${item.name}" in this browser.`);
  }

  const runBtn = button('Run simulation', { icon: 'play', kind: 'primary', onClick: run });
  const saveBtn = button('Save', { icon: 'save', onClick: save, title: 'Save this experiment in this browser' });
  const csvBtn = button('CSV', { icon: 'download', onClick: () => result && exportCSV(experiment(`${wk.topic} ${alg}`), spec.table(result)), title: 'Export results as CSV' });
  const jsonBtn = button('JSON', { icon: 'download', onClick: () => result && exportJSON({ ...experiment(`${wk.topic} ${alg}`), result }), title: 'Export input, results and execution trace as JSON' });
  function updateButtons() { [saveBtn, csvBtn, jsonBtn].forEach((b) => { b.disabled = !result; }); }

  const sampleSel = select([{ value: '', label: 'Choose a sample…' }, ...spec.samples.map((s, i) => ({ value: String(i), label: s.name }))], '', (v) => { if (v === '') return; setInput(spec.samples[+v].make(alg)); sampleSel.value = ''; }, { 'aria-label': 'Load a sample dataset' });
  function setInput(next) { input = next; moduleInput.set(spec.id, input); drawInputs(); drawSettings(); lastRunInput = lastRunInput || {}; run(); }

  // ---------- layout
  const tabs = h('div', { class: 'tabs algo-tabs', role: 'tablist', 'aria-label': `Algorithms in week ${wk.n}` }, wk.algs.map((a) => h('a', {
    role: 'tab', class: `tab${a === alg ? ' active' : ''}`, 'aria-selected': String(a === alg), href: `#/week/${wk.n}/${a}` }, spec.algorithms[a] || a)));
  const siblings = WEEKS.filter((w) => w.module === wk.module && w.n !== wk.n);
  const compareBar = h('div', { class: 'compare-bar' }, h('a', { class: 'btn btn-secondary', href: `#/compare/${spec.id}` }, icon('chart'), h('span', { text: `Compare all ${wk.topic} algorithms on this input` })),
    siblings.length ? h('span', { class: 'muted' }, 'Same topic in ', siblings.map((s) => h('a', { href: `#/week/${s.n}`, text: `Week ${s.n}` })).flatMap((a, i) => (i ? [', ', a] : [a]))) : null);
  const extra = spec.extras && alg === 'fifo' ? h('div', { class: 'extras' }, h('h4', { text: "Belady's anomaly demonstration" }), h('p', { class: 'muted', text: 'FIFO with more frames can fault more. Counts below come from the same Python FIFO code.' })) : null;
  if (extra) spec.extras(extra);

  root.append(
    h('header', { class: 'page-head' }, h('h1', { text: `Week ${wk.n}: ${wk.topic}` }), h('p', { class: 'lede', text: wk.blurb })),
    h('section', { class: 'panel selector', 'aria-label': 'Algorithm selector' }, h('h2', { class: 'sr-only', text: 'Algorithm' }), tabs, compareBar),
    h('div', { class: 'ws-grid' },
      h('section', { class: 'panel inputs', 'aria-labelledby': 'h-in' }, h('h2', { id: 'h-in', text: 'Custom inputs' }),
        h('div', { class: 'toolbar' }, sampleSel, button('Random', { icon: 'shuffle', small: true, onClick: () => setInput(spec.random()), title: 'Generate random input' }),
          button('Reset', { icon: 'reset', small: true, onClick: () => setInput(spec.defaultInput()), title: 'Restore the default example' })), el.inputs),
      h('section', { class: 'panel settings', 'aria-labelledby': 'h-set' }, h('h2', { id: 'h-set', text: 'Simulation settings' }), el.settings, h('div', { class: 'toolbar' }, runBtn)),
      h('section', { class: 'panel viz', 'aria-labelledby': 'h-viz' }, h('h2', { id: 'h-viz', text: `${spec.algorithms[alg] || alg} visualization` }), el.errors, el.stale, el.viz,
        h('div', { class: 'viz-controls' }, controls.el), el.explain),
      h('section', { class: 'panel log', 'aria-labelledby': 'h-log' }, h('h2', { id: 'h-log', text: 'Step-by-step execution log' }), h('p', { class: 'hint', text: 'Click any step to jump to it. Stepping back restores the exact earlier state.' }), el.log),
      h('section', { class: 'panel metrics', 'aria-labelledby': 'h-met' }, h('div', { class: 'panel-head' }, h('h2', { id: 'h-met', text: 'Performance metrics' }), h('div', { class: 'toolbar' }, saveBtn, csvBtn, jsonBtn)), el.metrics, el.results, el.notes)),
    h('section', { class: 'panel learn-panel', 'aria-label': 'Explanation and comparison' }, h('h2', { text: 'Comparison and explanation' }), h('p', { class: 'muted', text: spec.tradeoffs }), learnPanel(alg, spec.id, extra)));

  drawInputs(); drawSettings(); controls.sync(); updateButtons();
  lastRunInput = {};
  run();
  return () => { ac.abort(); pb.destroy(); };
}
