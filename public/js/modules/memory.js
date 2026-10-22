import { h, clear, editableTable, chip, icon, pcolor, rnd, nextId, fmt } from '../ui.js';

const B = (id, s) => ({ id, size: String(s) });
const SAMPLES = [
  { name: 'Classic textbook set', make: () => ({ blocks: [100, 500, 200, 300, 600].map((s, i) => B(`B${i + 1}`, s)), processes: [212, 417, 112, 426].map((s, i) => B(`P${i + 1}`, s)) }) },
  { name: 'Exact-size fits', make: () => ({ blocks: [50, 120, 80].map((s, i) => B(`B${i + 1}`, s)), processes: [80, 50, 120].map((s, i) => B(`P${i + 1}`, s)) }) },
  { name: 'Request too large for any block', make: () => ({ blocks: [100, 200, 150].map((s, i) => B(`B${i + 1}`, s)), processes: [90, 400, 140].map((s, i) => B(`P${i + 1}`, s)) }) },
  { name: 'Algorithms disagree', make: () => ({ blocks: [300, 150, 600, 200].map((s, i) => B(`B${i + 1}`, s)), processes: [140, 190, 580, 250].map((s, i) => B(`P${i + 1}`, s)) }) },
];
const STATUS = {
  occupied: ['Already assigned', 'idle', 'x'], too_small: ['Too small', 'bad', 'x'], candidate: ['Fits (not chosen)', 'wait', 'info'],
  selected: ['Selected', 'ok', 'check'], skipped: ['Not examined (scan stopped)', 'idle', 'idle'],
};

export const memory = {
  id: 'memory', label: 'Memory Allocation',
  algorithms: { first: 'First Fit', best: 'Best Fit', worst: 'Worst Fit' },
  defaultInput: () => SAMPLES[0].make(),
  samples: SAMPLES,
  random: () => ({ blocks: Array.from({ length: rnd(4, 6) }, (_, i) => B(`B${i + 1}`, rnd(5, 60) * 10)), processes: Array.from({ length: rnd(3, 5) }, (_, i) => B(`P${i + 1}`, rnd(3, 50) * 10)) }),

  renderInputs(el, input, algs, onChange) {
    el.append(h('div', { class: 'matrix-title', text: 'Memory blocks (scan order = row order)' }),
      editableTable({ label: 'Memory blocks', rows: input.blocks, onChange, reorder: true, columns: [{ key: 'id', label: 'Block', size: 5 }, { key: 'size', label: 'Size', numeric: true, size: 6 }], newRow: (rows) => B(nextId(rows, 'id', 'B'), 100) }),
      h('div', { class: 'matrix-title', text: 'Processes (allocated in row order)' }),
      editableTable({ label: 'Processes', rows: input.processes, onChange, reorder: true, columns: [{ key: 'id', label: 'Process', size: 5 }, { key: 'size', label: 'Request', numeric: true, size: 6 }], newRow: (rows) => B(nextId(rows, 'id', 'P'), 100) }));
  },
  renderSettings(el) {
    el.append(h('p', { class: 'hint', text: 'Policy: each block holds at most one process, so the unused part of an allocated block is internal fragmentation. Best/Worst Fit ties go to the block listed first.' }));
  },

  metrics(r) {
    const m = r.metrics;
    return [
      { label: 'Total memory', value: m.total_capacity }, { label: 'Total requested', value: m.total_requested },
      { label: 'Allocated processes', value: m.allocated }, { label: 'Unallocated processes', value: m.unallocated },
      { label: 'Allocation success', value: `${fmt(m.success_rate)}%`, tip: 'Allocated / total processes' },
      { label: 'Internal fragmentation', value: m.internal_fragmentation, tip: 'Sum of (block size - request) over allocated blocks' },
      { label: 'Unused in free blocks', value: m.unused_in_free_blocks, tip: 'Total size of blocks that received no process' },
    ];
  },
  table: (r) => ({
    columns: ['Process', 'Request', 'Block', 'Block size', 'Internal fragmentation'],
    rows: r.rows.map((x) => [x.process, x.size, x.block ?? 'Unallocated', x.block_size ?? '–', x.fragmentation ?? '–']),
  }),
  logLine: (r, i) => `${r.steps[i].process} (${r.steps[i].size}) ${r.steps[i].chosen ? `goes to ${r.steps[i].chosen}` : 'cannot be allocated'}`,
  explain: (r, i) => h('p', { text: r.steps[i].reason }),

  viz(root, r) {
    const max = Math.max(...r.blocks.map((b) => b.size));
    const pidx = Object.fromEntries(r.processes.map((p, k) => [p.id, k]));
    const queue = h('div', { class: 'queues' });
    const rows = r.blocks.map((b) => {
      const fill = h('span', { class: 'fill' });
      const fillLabel = h('span', { class: 'mlabel' });
      const unused = h('span', { class: 'unused-label' });
      const status = h('span', { class: 'mstatus' });
      const bar = h('div', { class: 'mbar', style: { width: `${Math.max(18, (b.size / max) * 100)}%` } }, fill, fillLabel, unused);
      const el = h('div', { class: 'mrow' }, h('div', { class: 'mhead' }, h('strong', { text: b.id }), h('span', { class: 'muted', text: `size ${b.size}` }), status), bar);
      return { b, fill, fillLabel, unused, status, el };
    });
    root.append(queue, h('div', { class: 'memory' }, rows.map((x) => x.el)));
    return {
      update(i) {
        const s = r.steps[i];
        const ex = Object.fromEntries(s.examined.map((e) => [e.block, e.status]));
        rows.forEach((x) => {
          const a = s.allocation[x.b.id];
          x.fill.style.width = a ? `${(a.size / x.b.size) * 100}%` : '0%';
          x.fill.style.setProperty('--c', a ? pcolor(pidx[a.process]) : 'transparent');
          x.fillLabel.textContent = a ? `${a.process} (${a.size})` : '';
          x.unused.textContent = a ? `unused ${x.b.size - a.size}` : 'free';
          const [label, tone, ic] = STATUS[ex[x.b.id]] || STATUS.skipped;
          clear(x.status).append(h('span', { class: `state state-${tone}` }, icon(ic, 12), label));
          x.el.className = `mrow ${ex[x.b.id] || ''}`;
        });
        clear(queue).append(h('div', { class: 'qrow' }, h('span', { class: 'qlabel', text: 'Processes' }),
          r.steps.map((st, k) => {
            const ok = st.chosen !== null;
            const cls = k === i ? 'chip-run' : k < i ? (ok ? 'chip-ok' : 'chip-bad') : '';
            const tag = k === i ? ' (now)' : k < i ? (ok ? ` in ${st.chosen}` : ' failed') : ' waiting';
            return chip(`${st.process} ${st.size}${tag}`, cls);
          })));
      },
    };
  },

  compareMetrics: [
    { key: 'success_rate', label: 'Allocation success (%)', better: 'max', formula: 'Allocated / total processes x 100' },
    { key: 'allocated', label: 'Processes allocated', better: 'max', formula: 'Count' },
    { key: 'internal_fragmentation', label: 'Internal fragmentation', better: null, formula: 'Sum of (block - request) for allocated blocks' },
    { key: 'unused_in_free_blocks', label: 'Unused memory in free blocks', better: null, formula: 'Sum of sizes of unassigned blocks' },
  ],
  insights(results) {
    const out = [];
    const ents = Object.entries(results);
    const fr = ents.map(([k, v]) => `${v.label}: ${v.metrics.internal_fragmentation}`).join('; ');
    out.push(`Internal fragmentation by algorithm: ${fr}. It is not ranked because an algorithm that places fewer processes can show less fragmentation simply by allocating less.`);
    ents.forEach(([, v]) => { const un = v.rows.filter((x) => !x.block).map((x) => x.process); if (un.length) out.push(`${v.label} could not allocate ${un.join(', ')}.`); });
    out.push('Internal fragmentation (wasted space inside an allocated block) is different from external fragmentation (free space split into pieces too small to use); no single number captures overall efficiency.');
    return out;
  },
  tradeoffs: 'First Fit is fastest because it stops scanning early. Best Fit minimises leftover per request. Worst Fit keeps the biggest remainder but spends large blocks early. Which wins depends on the block order and request sizes.',
};
