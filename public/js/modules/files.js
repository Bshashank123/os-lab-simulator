import { h, clear, editableTable, field, textInput, select, chip, icon, pcolor, rnd, nextId, fmt, put } from '../ui.js';

const F = (name, size, start = '', blocks = '') => ({ name, size: String(size), start: String(start), blocks });
const base = (files, extra = {}) => ({ total_blocks: '20', block_size: '512', reserved: '', mode: 'auto', files, ...extra });
const SAMPLES = [
  { name: 'Mixed files (automatic)', make: () => base([F('A', 1500), F('B', 700), F('C', 2600), F('D', 300)]) },
  { name: 'Fragmented free space', make: () => base([F('A', 2560), F('B', 512)], { total_blocks: '16', reserved: '2, 5, 8, 11' }) },
  { name: 'Disk fills up', make: () => base([F('A', 3000), F('B', 1500)], { total_blocks: '8' }) },
  { name: 'Manual with a conflict', make: () => base([F('A', 1000, 2, '5, 9'), F('B', 1500, 10, '11, 12, 14'), F('C', 500, 3, '9')], { total_blocks: '16', mode: 'manual' }) },
];

export const files = {
  id: 'files', label: 'File Allocation',
  algorithms: { sequential: 'Sequential', indexed: 'Indexed', linked: 'Linked' },
  defaultInput: () => SAMPLES[0].make(),
  samples: SAMPLES,
  random: () => base(Array.from({ length: rnd(3, 5) }, (_, i) => F(String.fromCharCode(65 + i), rnd(1, 30) * 100)), { total_blocks: String(rnd(16, 28)), reserved: [rnd(1, 3), rnd(5, 8)].join(', ') }),

  renderInputs(el, input, algs, onChange, ctx = {}) {
    const manual = input.mode === 'manual' && !ctx.compare;
    const cols = [{ key: 'name', label: 'File', size: 5 }, { key: 'size', label: 'Bytes', numeric: true, size: 6 }];
    if (manual) {
      if (algs.includes('sequential')) cols.push({ key: 'start', label: 'Start block', numeric: true, size: 4 });
      if (algs.includes('indexed') && !algs.includes('sequential')) cols.push({ key: 'start', label: 'Index block', numeric: true, size: 4 });
      if (algs.includes('indexed') || algs.includes('linked')) cols.push({ key: 'blocks', label: algs.includes('linked') ? 'Data blocks (chain order)' : 'Data blocks', size: 10 });
    }
    el.append(editableTable({ label: 'Files', rows: input.files, onChange, columns: cols, newRow: (rows) => F(nextId(rows, 'name', 'F'), 1000) }));
    el.append(h('p', { class: 'hint', text: manual ? 'Manual mode: you choose the blocks. Conflicts with reserved or earlier files are refused and shown.' : 'Automatic policy: lowest-numbered free blocks (Sequential: first contiguous run that fits).' }));
  },
  renderSettings(el, input, algs, onChange, ctx = {}) {
    const num = (key, label, hint) => field(label, textInput(input[key], (v) => { input[key] = v; onChange(); }, { inputmode: 'numeric', class: 'num', size: 5 }), hint);
    el.append(h('div', { class: 'row-fields' }, num('total_blocks', 'Disk blocks', '4 to 128'), num('block_size', 'Block size (bytes)', '8 or more')),
      field('Reserved blocks (unavailable)', textInput(input.reserved, (v) => { input.reserved = v; onChange(); }, { placeholder: 'e.g. 3, 4, 9' }), 'Comma-separated block numbers, counting from 0.'));
    if (ctx.compare) { input.mode = 'auto'; el.append(h('p', { class: 'hint', text: 'Comparison always uses automatic allocation so every strategy follows the same fair policy.' })); }
    else el.append(field('Allocation mode', select([{ value: 'auto', label: 'Automatic (deterministic policy)' }, { value: 'manual', label: 'Manual (I choose the blocks)' }], input.mode, (v) => { input.mode = v; onChange(); ctx.rerenderInputs?.(); })));
    el.append(h('p', { class: 'hint', text: 'Assumptions: 4-byte pointers and index entries; one disk read per block touched; no caching or seek time. Costs are teaching estimates, not hardware measurements. Files must be at least 1 byte.' }));
  },

  metrics(r) {
    const m = r.metrics;
    return [
      { label: 'Files allocated / failed', value: `${m.files_allocated} / ${m.files_failed}` },
      { label: 'Data blocks', value: m.data_blocks }, { label: 'Index / metadata blocks', value: m.meta_blocks },
      { label: 'Total blocks consumed', value: m.total_consumed },
      { label: 'Allocation overhead', value: `${fmt(m.overhead_pct)}%`, tip: 'Metadata blocks / total blocks consumed' },
      { label: 'Internal waste (bytes)', value: m.internal_waste_bytes, tip: 'Allocated data capacity minus file size' },
      { label: 'Pointer bytes (linked)', value: m.pointer_bytes },
      { label: 'Free blocks left', value: `${m.free_blocks_after} (longest run ${m.largest_free_run_after})` },
      { label: 'Avg sequential read cost', value: `${fmt(m.avg_sequential_cost)} reads`, tip: 'Block reads to read a whole file, averaged' },
    ];
  },
  table: (r) => ({
    columns: ['File', 'Bytes', 'Result', 'Data blocks', 'Index blocks', 'Total', 'Overhead %', 'Waste (bytes)', 'Read all (reads)', 'Reach last block (reads)', 'Blocks'],
    rows: r.files.map((f) => [f.name, f.size, f.ok ? 'Allocated' : 'Failed', f.data_blocks, f.meta_blocks, f.ok ? f.total_blocks : '–', f.ok ? f.overhead_pct : '–',
      f.ok ? f.internal_waste : '–', f.seq_cost ?? '–', f.direct_cost_last ?? '–', f.ok ? (f.index_block !== null ? `index ${f.index_block}: ` : '') + f.blocks.join(', ') : f.reason]),
  }),
  logLine(r, i) { const s = r.steps[i]; return s.type === 'traverse' ? `${s.file}: read block ${s.block}${s.next === null ? ' (EOF)' : ` then ${s.next}`}` : `${s.file}: ${s.ok ? 'allocated' : 'FAILED'}`; },
  explain(r, i) { return h('p', { class: r.steps[i].ok === false ? 'text-bad' : '', text: r.steps[i].reason }); },

  viz(root, r) {
    const N = r.config.total_blocks;
    const fidx = Object.fromEntries(r.files.map((f, k) => [f.name, k]));
    let selected = null, cur = 0;
    const snapAt = (i) => { for (let k = i; k >= 0; k--) if (r.steps[k].type === 'allocate') return k; return 0; };
    const cells = Array.from({ length: N }, (_, b) => {
      const num = h('span', { class: 'bnum', text: b }), tag = h('span', { class: 'btag' }), ptr = h('span', { class: 'bptr' });
      const el = h('button', { type: 'button', class: 'bcell', 'aria-label': `Block ${b}`, onClick: () => { const d = r.steps[snapAt(cur)].disk[b]; selected = d.file && d.file !== selected ? d.file : null; paint(); } }, num, tag, ptr);
      return { el, tag, ptr };
    });
    const legend = h('div', { class: 'legend' }, [['free', 'Free'], ['data', 'File data'], ['index', 'Index block'], ['reserved', 'Reserved / unavailable'], ['invalid', 'Refused (conflict)']]
      .map(([c, l]) => h('span', { class: 'lg' }, h('i', { class: `sw sw-${c}` }), l)), h('span', { class: 'lg', text: 'Pointer: "to n" = next block, EOF = end of file. Click a block to highlight its file.' }));
    const fileChips = h('div', { class: 'qrow' });
    const detail = h('div', { class: 'detail' });
    const tbody = h('tbody');
    const fat = h('div', { class: 'table-wrap' }, h('table', { class: 'data', 'aria-label': 'File allocation table' },
      h('thead', {}, h('tr', {}, ['File', 'Bytes', 'Result', 'Start / index', 'Blocks', 'Data', 'Index', 'Total'].map((c) => h('th', { scope: 'col', text: c })))), tbody));
    root.append(h('div', { class: 'disk', style: { '--cols': Math.min(N, N <= 16 ? 8 : 10) } }, cells.map((c) => c.el)), legend, fileChips, detail, h('div', { class: 'matrix-title', text: 'File allocation table' }), fat);

    function paint() {
      const s = r.steps[cur], si = snapAt(cur), snap = r.steps[si].disk;
      const hlFile = selected || s.file;
      const chain = s.type === 'traverse' ? s.chain : [];
      const bad = s.type === 'allocate' ? s.invalid || [] : [];
      snap.forEach((d, b) => {
        const c = cells[b];
        const state = bad.includes(b) ? 'invalid' : d.state;
        c.el.className = `bcell st-${state}${d.file === hlFile && d.state !== 'free' && d.state !== 'reserved' ? ' hl' : ''}${hlFile && d.file && d.file !== hlFile ? ' dim' : ''}${chain.includes(b) ? ' trav' : ''}${s.type === 'traverse' && s.block === b ? ' trav-now' : ''}`;
        c.el.style.setProperty('--c', d.file ? pcolor(fidx[d.file]) : 'transparent');
        c.tag.textContent = state === 'invalid' ? '!' : state === 'index' ? `IDX ${d.file}` : state === 'data' ? `${d.file}${d.pos + 1}` : state === 'reserved' ? 'res' : 'free';
        c.ptr.textContent = d.state === 'data' && r.algorithm === 'linked' ? (d.next === null ? 'EOF' : `to ${d.next}`) : '';
      });
      put(clear(fileChips), h('span', { class: 'qlabel', text: 'Files' }), r.files.map((f, k) => {
        const done = r.steps.findIndex((x) => x.type === 'allocate' && x.file === f.name) <= cur;
        return h('button', { type: 'button', class: `chip chip-btn ${f.name === hlFile ? 'chip-run' : ''}`, style: { '--c': pcolor(k) }, 'aria-pressed': String(f.name === hlFile),
          onClick: () => { selected = selected === f.name ? null : f.name; paint(); } }, `${f.name}${done ? (f.ok ? ' allocated' : ' failed') : ' waiting'}`);
      }));
      const fr = r.files.find((f) => f.name === hlFile);
      clear(detail);
      if (fr && r.steps.findIndex((x) => x.type === 'allocate' && x.file === hlFile) <= cur) {
        if (!fr.ok) detail.append(h('div', { class: 'callout callout-bad' }, icon('warn'), h('span', { text: fr.reason })));
        else if (r.algorithm === 'indexed') detail.append(h('div', { class: 'callout' }, h('strong', { text: `Index block ${fr.index_block} (metadata)` }), h('div', { class: 'mapping' }, fr.blocks.map((b, k) => chip(`entry ${k} to block ${b}`)))));
        else if (r.algorithm === 'linked') detail.append(h('div', { class: 'callout' }, h('strong', { text: `Chain for ${fr.name}` }), h('div', { class: 'mapping' }, fr.blocks.map((b) => chip(String(b))).flatMap((c, k, a) => (k < a.length - 1 ? [c, h('span', { class: 'arrow', text: 'to' })] : [c, h('span', { class: 'arrow', text: 'to EOF' })])))));
        else detail.append(h('div', { class: 'callout' }, h('strong', { text: `Contiguous range ${fr.blocks[0]} to ${fr.blocks[fr.blocks.length - 1]}` }), ` (${fr.data_blocks} blocks, start block ${fr.blocks[0]})`));
      }
      clear(tbody);
      r.files.forEach((f, k) => {
        const idx = r.steps.findIndex((x) => x.type === 'allocate' && x.file === f.name);
        if (idx > cur) return;
        tbody.append(h('tr', { class: f.name === hlFile ? 'row-active' : '' },
          h('td', {}, h('span', { class: 'pdot', style: { '--c': pcolor(k) } }), f.name), h('td', { text: f.size }),
          h('td', {}, h('span', { class: `state state-${f.ok ? 'ok' : 'bad'}` }, icon(f.ok ? 'check' : 'x', 12), f.ok ? 'Allocated' : 'Failed')),
          h('td', { text: f.ok ? (r.algorithm === 'indexed' ? f.index_block : f.blocks[0]) : '–' }), h('td', { text: f.ok ? f.blocks.join(', ') : '–' }),
          h('td', { text: f.data_blocks }), h('td', { text: f.meta_blocks }), h('td', { text: f.ok ? f.total_blocks : '–' })));
      });
    }
    return { update(i) { cur = i; paint(); } };
  },

  compareMetrics: [
    { key: 'files_allocated', label: 'Files allocated', better: 'max', formula: 'Count of successful allocations' },
    { key: 'total_consumed', label: 'Total blocks consumed', better: 'min', formula: 'Data + index blocks of allocated files' },
    { key: 'meta_blocks', label: 'Index / metadata blocks', better: 'min', formula: 'One per indexed file' },
    { key: 'overhead_pct', label: 'Allocation overhead (%)', better: 'min', formula: 'Metadata / total consumed x 100' },
    { key: 'internal_waste_bytes', label: 'Internal waste (bytes)', better: null, formula: 'Allocated capacity - file size (pointer bytes excluded)' },
    { key: 'pointer_bytes', label: 'Pointer bytes', better: 'min', formula: '4 bytes per linked block' },
    { key: 'avg_sequential_cost', label: 'Avg reads to read a whole file (estimate)', better: 'min', formula: 'Block reads, no caching' },
    { key: 'avg_direct_last', label: 'Avg reads to reach the last block (estimate)', better: 'min', formula: 'Sequential 1, Indexed 2, Linked k',
      get: (res) => { const ok = res.files.filter((f) => f.ok); return ok.length ? +(ok.reduce((a, f) => a + f.direct_cost_last, 0) / ok.length).toFixed(2) : 0; } },
  ],
  insights(results) {
    const out = [];
    Object.values(results).forEach((v) => {
      const failed = v.files.filter((f) => !f.ok);
      if (failed.length) out.push(`${v.label} failed for ${failed.map((f) => f.name).join(', ')}: ${failed[0].reason}`);
    });
    out.push('Costs count disk-block reads under stated assumptions (4-byte pointers, no caching, no seek time). They are estimates for comparison, not hardware measurements.');
    out.push('Linked allocation trades direct access (reaching block k needs k reads) and pointer space for freedom from external fragmentation; indexed pays one index block per file for direct access; sequential is cheapest to access but needs contiguous free space.');
    return out;
  },
  tradeoffs: 'Sequential: fastest access, no metadata, but external fragmentation and hard to grow. Indexed: direct access without contiguity, at the price of an index block per file. Linked: no external fragmentation and easy growth, but slow direct access and pointer reliability risk.',
};
