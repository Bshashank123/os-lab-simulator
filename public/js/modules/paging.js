import { h, clear, field, textInput, select, chip, icon, button, table, rnd, fmt, put } from '../ui.js';
import { columns } from '../charts.js';
import * as api from '../api.js';

const SAMPLES = [
  { name: 'Textbook string, 3 frames', make: () => ({ reference_string: '7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2, 1, 2, 0, 1, 7, 0, 1', frames: '3' }) },
  { name: "Belady's anomaly string, 3 frames", make: () => ({ reference_string: '1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5', frames: '3' }) },
  { name: 'Loop bigger than memory', make: () => ({ reference_string: '1 2 3 4 1 2 3 4 1 2 3 4', frames: '3' }) },
  { name: 'Strong locality', make: () => ({ reference_string: '1 1 2 1 2 3 1 2 3 1 2 1 4 1 2', frames: '3' }) },
  { name: 'Single frame', make: () => ({ reference_string: '1 2 1 3 1 2', frames: '1' }) },
];

export const paging = {
  id: 'paging', label: 'Page Replacement',
  algorithms: { fifo: 'FIFO', optimal: 'Optimal', lru: 'LRU' },
  defaultInput: () => SAMPLES[0].make(),
  samples: SAMPLES,
  random: () => ({ reference_string: Array.from({ length: rnd(14, 22) }, () => rnd(0, 7)).join(', '), frames: String(rnd(3, 4)) }),

  renderInputs(el, input, algs, onChange) {
    el.append(field('Reference string', h('textarea', { rows: 3, spellcheck: 'false', 'aria-describedby': 'refhint', onInput: (e) => { input.reference_string = e.target.value; onChange(); }, text: input.reference_string }),
      'Whole numbers (0 is allowed), separated by commas or spaces. Example: 7, 0, 1, 2, 0, 3'));
  },
  renderSettings(el, input, algs, onChange) {
    el.append(field('Number of frames', textInput(input.frames, (v) => { input.frames = v; onChange(); }, { inputmode: 'numeric', class: 'num', size: 4 }), '1 to 16'),
      h('p', { class: 'hint', text: 'Frames are fixed slots: a replaced page takes its victim\'s slot. Optimal ties (several pages never used again) evict the earliest loaded. Only Optimal reads future references.' }));
  },

  metrics(r) {
    const m = r.metrics;
    return [
      { label: 'Total references', value: m.total_references }, { label: 'Page faults', value: m.page_faults, tone: 'bad' }, { label: 'Page hits', value: m.page_hits, tone: 'ok' },
      { label: 'Page fault rate', value: `${fmt(m.fault_rate)}%`, tip: 'Faults / total references x 100' }, { label: 'Page hit rate', value: `${fmt(m.hit_rate)}%`, tip: 'Hits / total references x 100' },
      { label: 'Check', value: `${m.page_hits} + ${m.page_faults} = ${m.page_hits + m.page_faults}`, tip: 'Hits plus faults must equal total references' },
    ];
  },
  table: (r) => ({
    columns: ['Ref #', 'Page', 'Result', 'Frames after', 'Loaded', 'Evicted'],
    rows: r.steps.map((s) => [s.step, s.page, s.hit ? 'Hit' : 'Fault', s.frames.map((f) => f ?? '-').join(' | '), s.loaded ?? '–', s.evicted ?? '–']),
  }),
  logLine: (r, i) => { const s = r.steps[i]; return `#${s.step} page ${s.page}: ${s.hit ? 'hit' : 'FAULT'}${s.evicted !== null ? `, evicts ${s.evicted}` : ''}`; },
  explain(r, i) {
    const s = r.steps[i];
    const kids = [h('p', { text: s.explanation })];
    if (s.candidates.length) kids.push(h('div', { class: 'qrow' }, h('span', { class: 'qlabel', text: 'Victim comparison' }),
      s.candidates.map((c) => chip(`page ${c.page}: ${c.info}${c.page === s.victim ? ' (victim)' : ''}`, c.page === s.victim ? 'chip-bad' : ''))));
    return h('div', {}, kids);
  },

  viz(root, r) {
    const nf = r.frames, refs = r.references;
    const banner = h('div', { class: 'ref-banner', 'aria-live': 'polite' });
    const slots = Array.from({ length: nf }, (_, k) => { const tag = h('span', { class: 'slot-tag' }); const val = h('span', { class: 'slot-val' }); return { el: h('div', { class: 'slot' }, h('span', { class: 'slot-idx', text: `Frame ${k}` }), val, tag), val, tag }; });
    const head = h('tr', {}, h('th', { scope: 'row', text: 'Reference' }), refs.map((p, i) => h('th', { scope: 'col', 'data-i': i, text: p })));
    const frameRows = Array.from({ length: nf }, (_, k) => h('tr', {}, h('th', { scope: 'row', text: `Frame ${k}` }), refs.map((_, i) => h('td', { 'data-i': i }))));
    const resRow = h('tr', {}, h('th', { scope: 'row', text: 'Result' }), refs.map((_, i) => h('td', { 'data-i': i })));
    const wrap = h('div', { class: 'table-wrap timeline' }, h('table', { class: 'data tl', 'aria-label': 'Frame contents over time' }, h('thead', {}, head), h('tbody', {}, frameRows, resRow)));
    root.append(banner, h('div', { class: 'slots', role: 'group', 'aria-label': 'Memory frames' }, slots.map((s) => s.el)), wrap);
    const colEls = (i) => wrap.querySelectorAll(`[data-i="${i}"]`);
    return {
      update(i) {
        const s = r.steps[i], prev = refs[i - 1], next = refs[i + 1];
        put(clear(banner), h('span', { class: 'ref-now', text: `Reference ${s.page}` }),
          h('span', { class: `state state-${s.hit ? 'ok' : 'bad'}` }, icon(s.hit ? 'check' : 'x', 14), s.hit ? 'Page hit' : 'Page fault'),
          s.evicted !== null ? chip(`Evicted: page ${s.evicted}`, 'chip-bad') : null, s.loaded !== null ? chip(`Loaded: page ${s.loaded}`, 'chip-info') : null,
          h('span', { class: 'muted', text: `Step ${s.step} of ${refs.length}. Previous: ${prev ?? 'none'}. Next: ${next ?? 'none'}.` }));
        slots.forEach((sl, k) => {
          const isCur = k === s.slot;
          sl.el.className = 'slot'; void sl.el.offsetWidth;
          sl.el.className = `slot${s.frames[k] === null ? ' empty' : ''}${isCur ? (s.hit ? ' hit' : ' fault new') : ''}`;
          sl.val.textContent = s.frames[k] ?? '';
          sl.tag.textContent = isCur ? (s.hit ? 'hit' : s.evicted !== null ? `replaced ${s.evicted}` : 'loaded') : '';
        });
        refs.forEach((_, c) => {
          const cells = colEls(c);
          const shown = c <= i;
          cells.forEach((el) => { el.classList.toggle('future', !shown); el.classList.toggle('cur', c === i); });
          if (!shown) { for (let k = 0; k <= nf; k++) cells[k + 1].textContent = ''; return; }
          const st = r.steps[c];
          for (let k = 0; k < nf; k++) { const td = cells[k + 1]; td.textContent = st.frames[k] ?? ''; td.className = `${c === i ? 'cur' : ''}${st.slot === k && !st.hit ? ' loaded' : ''}${st.slot === k && st.hit ? ' hitcell' : ''}`; }
          const res = cells[nf + 1]; res.textContent = st.hit ? 'hit' : 'fault'; res.className = `${st.hit ? 'is-hit' : 'is-fault'}${c === i ? ' cur' : ''}`;
        });
        const cur = wrap.querySelector(`th[data-i="${i}"]`);
        if (cur && wrap.scrollWidth > wrap.clientWidth) wrap.scrollLeft = cur.offsetLeft - wrap.clientWidth / 2;
      },
    };
  },

  compareMetrics: [
    { key: 'page_faults', label: 'Page faults', better: 'min', formula: 'Count of references not found in frames' },
    { key: 'page_hits', label: 'Page hits', better: 'max', formula: 'Total references - faults' },
    { key: 'fault_rate', label: 'Page fault rate (%)', better: 'min', formula: 'Faults / references x 100' },
    { key: 'hit_rate', label: 'Page hit rate (%)', better: 'max', formula: 'Hits / references x 100' },
  ],
  insights(results) {
    const out = [], ents = Object.entries(results), f = (k) => results[k]?.metrics.page_faults;
    out.push(`Faults: ${ents.map(([, v]) => `${v.label} ${v.metrics.page_faults}`).join(', ')}.`);
    if (f('fifo') !== undefined && f('lru') !== undefined) out.push(f('lru') < f('fifo') ? 'On this string LRU had fewer faults than FIFO because recently used pages were reused.' : f('lru') > f('fifo') ? 'On this string FIFO had fewer faults than LRU; recency did not predict reuse here.' : 'FIFO and LRU tied on this string; that happens when their victims coincide or reuse is sparse.');
    if (f('optimal') !== undefined && f('lru') !== undefined && f('optimal') === f('lru')) out.push('Optimal matched LRU here: Optimal is never worse, but it is not always strictly better.');
    const len = Math.min(...ents.map(([, v]) => v.steps.length)); const diffs = [];
    for (let i = 0; i < len && diffs.length < 4; i++) {
      const ev = ents.map(([, v]) => v.steps[i]);
      if (ev.every((s) => !s.hit && s.evicted !== null) && new Set(ev.map((s) => s.evicted)).size > 1) diffs.push(`At reference #${i + 1} (page ${ev[0].page}): ${ents.map(([, v]) => `${v.label} evicts ${v.steps[i].evicted}`).join(', ')}.`);
    }
    if (diffs.length) out.push('Victim choices differ: ' + diffs.join(' ')); else out.push('All algorithms chose the same victim whenever an eviction was needed (or evictions were not needed).');
    return out;
  },
  tradeoffs: 'FIFO is cheap but ignores usage and can suffer Belady\'s anomaly. LRU uses recent history and fits locality, at the cost of tracking recency. Optimal needs the future, so it is a benchmark rather than a real policy.',

  /** Belady's anomaly demo panel (Week 7 and Compare). */
  extras(container) {
    const state = { refs: '1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5', max: '7' };
    const out = h('div', { class: 'belady-out' });
    const run = async () => {
      clear(out);
      const res = await api.simulate('paging', 'belady', { reference_string: state.refs, max_frames: state.max });
      if (!res.ok) { out.append(h('div', { class: 'error-box', role: 'alert' }, h('ul', {}, res.errors.map((e) => h('li', { text: e }))))); return; }
      const b = res.result, hot = b.anomalies.map((a) => b.rows.findIndex((x) => x.frames === a.to_frames));
      out.append(columns({ title: 'FIFO page faults by number of frames', labels: b.rows.map((x) => `${x.frames}`), values: b.rows.map((x) => x.fifo), highlight: hot, xLabel: 'frames' }),
        table(['Frames', 'FIFO faults', 'LRU faults', 'Optimal faults'], b.rows.map((x) => [x.frames, x.fifo, x.lru, x.optimal]), { caption: 'Faults by frame count' }),
        b.anomalies.length ? h('div', { class: 'callout callout-bad' }, icon('warn'), h('span', { text: `Belady's anomaly: ${b.anomalies.map((a) => `FIFO faults rise from ${a.faults_from} (${a.from_frames} frames) to ${a.faults_to} (${a.to_frames} frames)`).join('; ')}. More memory made FIFO worse on this string. LRU and Optimal never show this.` }))
          : h('div', { class: 'callout' }, icon('info'), h('span', { text: 'No anomaly on this string: FIFO faults never increased as frames were added. The famous example is 1 2 3 4 1 2 5 1 2 3 4 5.' })));
    };
    container.append(h('div', { class: 'row-fields' }, field('Reference string', textInput(state.refs, (v) => { state.refs = v; })), field('Max frames', textInput(state.max, (v) => { state.max = v; }, { class: 'num', size: 3 }))),
      button('Run Belady demo', { icon: 'play', kind: 'primary', onClick: run }), out);
    run();
  },
};
