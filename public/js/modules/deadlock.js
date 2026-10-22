import { h, clear, matrixEditor, field, textInput, select, checkbox, chip, icon, fmt, clone, put } from '../ui.js';

const S = (m) => m.map((r) => r.map(String));
const sub = (a, b) => a.map((r, i) => r.map((v, j) => v - b[i][j]));
const add = (a, b) => a.map((r, i) => r.map((v, j) => v + b[i][j]));
const RES = (m) => Array.from({ length: m }, (_, j) => String.fromCharCode(65 + j));
const PROC = (n) => Array.from({ length: n }, (_, i) => `P${i}`);

const TEXTBOOK = { total: [10, 5, 7], alloc: [[0, 1, 0], [2, 0, 0], [3, 0, 2], [2, 1, 1], [0, 0, 2]], max: [[7, 5, 3], [3, 2, 2], [9, 0, 2], [2, 2, 2], [4, 3, 3]] };
const mk = (total, alloc, max, request, req = null) => ({
  total: total.map(String), allocation: S(alloc), maximum: S(max), request_matrix: S(request ?? sub(max, alloc)),
  request: { enabled: !!req, process: String(req?.p ?? 1), vector: (req?.v ?? new Array(total.length).fill(0)).map(String) },
});
const AFTER_P1 = TEXTBOOK.alloc.map((r, i) => (i === 1 ? [3, 0, 2] : r));
const DET = { total: [7, 2, 6], alloc: [[0, 1, 0], [2, 0, 0], [3, 0, 3], [2, 1, 1], [0, 0, 2]], req: [[0, 0, 0], [2, 0, 2], [0, 0, 0], [1, 0, 0], [0, 0, 2]] };
const DET_DEADLOCK = DET.req.map((r, i) => (i === 2 ? [0, 0, 1] : r));

const SAMPLES = [
  { name: 'Safe state (textbook, 5 processes)', make: () => mk(TEXTBOOK.total, TEXTBOOK.alloc, TEXTBOOK.max) },
  { name: 'Request accepted: P1 asks (1,0,2)', make: () => mk(TEXTBOOK.total, TEXTBOOK.alloc, TEXTBOOK.max, null, { p: 1, v: [1, 0, 2] }) },
  { name: 'Request rejected: P0 asks (0,2,0)', make: () => mk(TEXTBOOK.total, AFTER_P1, TEXTBOOK.max, null, { p: 0, v: [0, 2, 0] }) },
  { name: 'Unsafe state (and stuck)', make: () => mk([3], [[1], [1]], [[3], [3]]) },
  { name: 'Detection: no deadlock', make: () => mk(DET.total, DET.alloc, add(DET.alloc, DET.req), DET.req) },
  { name: 'Detection: processes left unfinished', make: () => mk(DET.total, DET.alloc, add(DET.alloc, DET_DEADLOCK), DET_DEADLOCK) },
];

function resize(input, n, m) {
  const fit = (mat) => Array.from({ length: n }, (_, i) => Array.from({ length: m }, (_, j) => mat[i]?.[j] ?? '0'));
  input.allocation = fit(input.allocation); input.maximum = fit(input.maximum); input.request_matrix = fit(input.request_matrix);
  input.total = Array.from({ length: m }, (_, j) => input.total[j] ?? '0');
  input.request.vector = Array.from({ length: m }, (_, j) => input.request.vector[j] ?? '0');
  if (+input.request.process >= n) input.request.process = '0';
}
const num = (v) => (/^\d+$/.test(String(v).trim()) ? +v : NaN);

export const deadlock = {
  id: 'deadlock', label: 'Deadlocks',
  algorithms: { banker: "Avoidance (Banker's)", detection: 'Detection' },
  defaultInput: () => SAMPLES[0].make(),
  samples: SAMPLES,
  random() {
    const n = 4, m = 3, total = [8, 6, 7].map(String);
    const alloc = Array.from({ length: n }, () => Array.from({ length: m }, () => Math.floor(Math.random() * 3)));
    const t = total.map(Number).map((tot, j) => Math.max(tot, alloc.reduce((a, r) => a + r[j], 0)));
    const max = alloc.map((r) => r.map((v, j) => Math.min(t[j], v + Math.floor(Math.random() * 4))));
    const req = alloc.map(() => Array.from({ length: m }, () => Math.floor(Math.random() * 3)));
    return mk(t, alloc, max, req);
  },
  toPayload(input, alg) {
    const p = clone(input);
    p.request = alg === 'banker' && input.request.enabled ? { process: input.request.process, vector: input.request.vector } : null;
    return p;
  },

  renderInputs(el, input, algs, onChange, ctx = {}) {
    const n = input.allocation.length, m = input.total.length, pn = PROC(n), rn = RES(m);
    const banker = algs.includes('banker'), det = algs.includes('detection');
    el.append(h('div', { class: 'row-fields' },
      field('Processes', textInput(String(n), (v) => { const k = num(v); if (k >= 1 && k <= 10) { resize(input, k, m); onChange(); ctx.rerenderInputs?.(); } }, { inputmode: 'numeric', class: 'num', size: 3 }), '1 to 10'),
      field('Resource types', textInput(String(m), (v) => { const k = num(v); if (k >= 1 && k <= 6) { resize(input, n, k); onChange(); ctx.rerenderInputs?.(); } }, { inputmode: 'numeric', class: 'num', size: 3 }), '1 to 6')));
    const totalRow = [input.total];
    el.append(matrixEditor({ title: 'Total instances', data: totalRow, rowNames: ['Total'], colNames: rn, onChange: () => { input.total = totalRow[0]; onChange(); } }));
    el.append(matrixEditor({ title: 'Allocation (currently held)', data: input.allocation, rowNames: pn, colNames: rn, onChange }));
    if (banker) el.append(matrixEditor({ title: 'Maximum (claimed demand)', data: input.maximum, rowNames: pn, colNames: rn, onChange }));
    if (det) el.append(matrixEditor({ title: 'Request (currently waiting for)', data: input.request_matrix, rowNames: pn, colNames: rn, onChange }));
    const A = input.allocation.map((r) => r.map(num)), T = input.total.map(num);
    const avail = T.map((t, j) => t - A.reduce((a, r) => a + r[j], 0));
    const calc = (title, rows, names, cols) => h('div', { class: 'matrix calc' }, h('div', { class: 'matrix-title' }, title, ' ', chip('calculated', 'chip-info')),
      h('div', { class: 'table-wrap' }, h('table', { class: 'data matrix-table', 'aria-label': title }, h('thead', {}, h('tr', {}, h('th'), cols.map((c) => h('th', { scope: 'col', text: c })))),
        h('tbody', {}, rows.map((r, i) => h('tr', {}, h('th', { scope: 'row', text: names[i] }), r.map((v) => h('td', { text: Number.isNaN(v) ? '?' : v }))))))));
    if (banker) { const M = input.maximum.map((r) => r.map(num)); el.append(calc('Need = Maximum - Allocation', sub(M, A), pn, rn)); }
    el.append(calc('Available = Total - sum(Allocation)', [avail], ['Available'], rn));
  },
  renderSettings(el, input, algs, onChange, ctx = {}) {
    if (algs.includes('banker')) {
      const n = input.allocation.length, rn = RES(input.total.length);
      el.append(checkbox('Evaluate an additional resource request', input.request.enabled, (v) => { input.request.enabled = v; onChange(); ctx.rerenderSettings?.(); }, "The Banker's Algorithm tentatively applies it and approves only if the state stays safe."));
      if (input.request.enabled) {
        el.append(field('Requesting process', select(PROC(n).map((p, i) => ({ value: String(i), label: p })), String(input.request.process), (v) => { input.request.process = v; onChange(); })),
          h('div', { class: 'row-fields' }, rn.map((r, j) => field(`Request ${r}`, textInput(input.request.vector[j] ?? '0', (v) => { input.request.vector[j] = v; onChange(); }, { inputmode: 'numeric', class: 'num', size: 3 })))));
      }
    }
    el.append(h('p', { class: 'hint', text: 'Avoidance asks whether granting a request keeps the system safe. Detection analyses an existing allocation to find processes that cannot finish. An unsafe state is not necessarily a deadlock.' }));
  },

  metrics(r) {
    const m = r.metrics, out = [
      { label: 'Processes', value: m.processes }, { label: 'Resource types', value: m.resource_types }, { label: 'Total instances', value: m.total_instances },
      { label: 'Available', value: `[${m.available.join(', ')}]` },
      { label: 'Overall utilization', value: `${fmt(m.overall_utilization)}%`, tip: 'Allocated instances / total instances' },
      { label: r.algorithm === 'banker' ? 'State' : 'Result', value: m.state, tone: /Safe|No deadlock/.test(m.state) ? 'ok' : 'bad' },
    ];
    if (r.algorithm === 'banker') {
      out.push({ label: 'Safe sequence', value: m.safe_sequence.length ? m.safe_sequence.join(' > ') : 'none' });
      if (r.request) out.push({ label: 'Request decision', value: r.request.approved ? 'Approved' : r.request.stage === 'exceeds_available' ? 'Must wait' : 'Rejected', tone: r.request.approved ? 'ok' : 'bad' });
    } else {
      out.push({ label: 'Unfinished (deadlocked set)', value: m.unfinished.length ? m.unfinished.join(', ') : 'none' }, { label: 'Completion order', value: m.completion_order.join(' > ') || 'none' });
    }
    return out;
  },
  table(r) {
    const fin = r.steps[r.steps.length - 1].finish;
    return {
      columns: ['Process', 'Allocation', r.algorithm === 'banker' ? 'Maximum' : 'Request', r.algorithm === 'banker' ? 'Need' : '', 'Finish'].filter(Boolean),
      rows: r.processes.map((p, i) => [p, `[${r.allocation[i].join(', ')}]`, r.algorithm === 'banker' ? `[${r.maximum[i].join(', ')}]` : `[${r.demand[i].join(', ')}]`,
        r.algorithm === 'banker' ? `[${r.need[i].join(', ')}]` : null, fin[i] ? 'Can finish' : 'Unfinished'].filter((x) => x !== null)),
    };
  },
  logLine(r, i) {
    const s = r.steps[i];
    if (s.type === 'select') return `${r.processes[s.selected]} can finish; Work = [${s.work_after.join(', ')}]`;
    return { init: 'Initialise Work and Finish', safe: 'Safe: all processes can finish', unsafe: 'Unsafe: no process can proceed', deadlock: 'Unfinished processes found',
      no_deadlock: 'No deadlock detected', request: 'Evaluate the resource request', decision: 'Request decision' }[s.type];
  },
  explain(r, i) {
    const s = r.steps[i];
    const kids = [h('p', { text: s.reason })];
    if (s.type === 'select') {
      kids.push(h('p', { class: 'outcome', text: `Eligible now: ${s.candidates.map((c) => r.processes[c]).join(', ')}. Selected: ${r.processes[s.selected]}.` }));
      if (s.blocked.length) kids.push(h('p', { class: 'muted', text: `Not eligible yet: ${s.blocked.map((b) => `${r.processes[b.process]} lacks ${b.lacking.map((j) => r.resources[j]).join(', ')}`).join('; ')}.` }));
    }
    return h('div', {}, kids);
  },

  viz(root, r) {
    const n = r.processes.length, m = r.resources.length, W = 620, H = Math.max(230, Math.max(n, m) * 54 + 30);
    const PX = 110, RX = 510;
    const py = (i) => (n === 1 ? H / 2 : 36 + (i * (H - 72)) / (n - 1)), ry = (j) => (m === 1 ? H / 2 : 36 + (j * (H - 72)) / (m - 1));
    const svg = h('svg', { viewBox: `0 0 ${W} ${H}`, class: 'dgraph', role: 'img', 'aria-label': 'Resource allocation graph. Solid arrows: resource to process (allocated). Dashed arrows: process to resource (' + (r.algorithm === 'banker' ? 'may still need' : 'requested') + ').' });
    svg.append(h('defs', {}, ...['alloc', 'demand'].map((k) => h('marker', { id: `mk-${k}`, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, h('path', { d: 'M0 0L10 5L0 10z', class: `mk mk-${k}` })))));
    const edges = h('g', { class: 'edges' });
    const pNodes = r.processes.map((p, i) => {
      const t = h('text', { x: PX, y: py(i) + 4, 'text-anchor': 'middle', class: 'ntext', text: p });
      const c = h('circle', { cx: PX, cy: py(i), r: 20, class: 'pnode' });
      const badge = h('text', { x: PX + 22, y: py(i) - 14, class: 'nbadge' });
      return { g: h('g', { class: 'node' }, c, t, badge), badge };
    });
    const rNodes = r.resources.map((res, j) => h('g', { class: 'node' },
      h('rect', { x: RX - 30, y: ry(j) - 17, width: 60, height: 34, rx: 4, class: 'rnode' }),
      h('text', { x: RX, y: ry(j) + 4, 'text-anchor': 'middle', class: 'ntext', text: `${res} x${r.total[j]}` })));
    svg.append(edges, ...pNodes.map((x) => x.g), ...rNodes);
    const legend = h('div', { class: 'legend' }, h('span', { class: 'lg' }, h('i', { class: 'sw sw-edge-alloc' }), 'Allocated (resource to process)'),
      h('span', { class: 'lg' }, h('i', { class: 'sw sw-edge-demand' }), r.algorithm === 'banker' ? 'Maximum still needed (process to resource)' : 'Requested (process to resource)'));
    const status = h('div', { class: 'queues' });
    const mats = h('div', { class: 'matrix-grid' });
    root.append(svg, legend, status, mats);

    const curve = (x1, y1, x2, y2, off) => {
      const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
      const sx = x1 + ux * 22, sy = y1 + uy * 22, ex = x2 - ux * 24, ey = y2 - uy * 24;
      const cx = (sx + ex) / 2 - uy * off, cy = (sy + ey) / 2 + ux * off;
      return { d: `M${sx} ${sy} Q${cx} ${cy} ${ex} ${ey}`, lx: 0.25 * sx + 0.5 * cx + 0.25 * ex, ly: 0.25 * sy + 0.5 * cy + 0.25 * ey };
    };
    const matTable = (title, names, cols, rows, hl = -1, flags = null) => h('div', { class: 'matrix' }, h('div', { class: 'matrix-title', text: title }),
      h('div', { class: 'table-wrap' }, h('table', { class: 'data matrix-table', 'aria-label': title },
        h('thead', {}, h('tr', {}, h('th'), cols.map((c) => h('th', { scope: 'col', text: c })), flags ? h('th', { scope: 'col', text: 'Finish' }) : null)),
        h('tbody', {}, rows.map((row, i) => h('tr', { class: i === hl ? 'row-active' : '' }, h('th', { scope: 'row', text: names[i] }), row.map((v) => h('td', { text: v })),
          flags ? h('td', {}, h('span', { class: `state state-${flags[i] ? 'ok' : 'idle'}` }, icon(flags[i] ? 'check' : 'idle', 12), flags[i] ? 'true' : 'false')) : null))))));

    return {
      update(i) {
        const s = r.steps[i], st = s.state || { allocation: r.allocation, need: r.demand, available: r.available };
        const A = st.allocation, D = st.need || st.request || r.demand;
        const fin = s.finish, final = ['safe', 'unsafe', 'deadlock', 'no_deadlock', 'decision'].includes(s.type);
        const bad = (s.type === 'unsafe' || s.type === 'deadlock') ? fin.map((f) => !f) : fin.map(() => false);
        clear(edges);
        for (let p = 0; p < n; p++) for (let q = 0; q < m; q++) {
          if (A[p][q] > 0) { const c = curve(RX, ry(q), PX, py(p), 14); edges.append(h('path', { d: c.d, class: `edge e-alloc${fin[p] ? ' released' : ''}`, 'marker-end': 'url(#mk-alloc)' }), h('text', { x: c.lx, y: c.ly, class: 'elabel', text: A[p][q] })); }
          if (D[p][q] > 0 && !fin[p]) { const c = curve(PX, py(p), RX, ry(q), -14); edges.append(h('path', { d: c.d, class: 'edge e-demand', 'marker-end': 'url(#mk-demand)' }), h('text', { x: c.lx, y: c.ly, class: 'elabel', text: D[p][q] })); }
        }
        const reqP = r.request && (s.type === 'request' || s.phase === 'request') ? r.request.process : -1;
        pNodes.forEach((x, p) => {
          const cls = ['pnode'];
          if (fin[p]) cls.push('fin'); if (bad[p]) cls.push('bad'); if (s.selected === p) cls.push('sel'); if (s.candidates?.includes(p)) cls.push('cand'); if (reqP === p) cls.push('req');
          x.g.firstChild.setAttribute('class', cls.join(' '));
          x.badge.textContent = bad[p] ? 'stuck' : fin[p] ? 'done' : s.selected === p ? 'runs' : '';
        });
        const word = (x) => `[${x.join(', ')}]`;
        put(clear(status), 
          chip(s.work ? `Work = ${word(s.work)}` : `Available = ${word(st.available)}`, 'chip-time'),
          s.sequence?.length ? chip(`${r.algorithm === 'banker' ? 'Safe sequence so far' : 'Completion order so far'}: ${s.sequence.map((k) => r.processes[k]).join(' > ')}`, 'chip-run') : null,
          final ? chip({ safe: 'SAFE', unsafe: 'UNSAFE (not necessarily a deadlock)', deadlock: 'Deadlock candidates found', no_deadlock: 'No deadlock', decision: r.request?.approved ? 'Request approved' : 'Request rejected' }[s.type], (s.type === 'safe' || s.type === 'no_deadlock' || (s.type === 'decision' && r.request?.approved)) ? 'chip-ok' : 'chip-bad') : null,
          s.phase === 'request' ? chip('Tentative state after granting the request', 'chip-info') : null);
        put(clear(mats), 
          matTable('Allocation', r.processes, r.resources, A, s.selected ?? -1),
          matTable(r.algorithm === 'banker' ? 'Need (Maximum - Allocation)' : 'Request', r.processes, r.resources, D, s.selected ?? -1, fin),
          r.algorithm === 'banker' ? matTable('Maximum', r.processes, r.resources, r.maximum, s.selected ?? -1) : null,
          matTable('Available / Work', ['Available', 'Work'], r.resources, [st.available, s.work || st.available]));
      },
    };
  },

  compareMetrics: [],
  outcomes(results) {
    const rows = [];
    if (results.banker) rows.push(['Avoidance (Banker\'s)', results.banker.metrics.state, results.banker.metrics.safe_sequence.length ? `Safe sequence: ${results.banker.metrics.safe_sequence.join(' > ')}` : 'No safe sequence exists: granting resources could lead to deadlock.', 'Answers: is this state safe, and may a request be granted?']);
    if (results.detection) rows.push(['Detection', results.detection.metrics.state, results.detection.metrics.unfinished.length ? `Unfinished: ${results.detection.metrics.unfinished.join(', ')}` : `Completion order: ${results.detection.metrics.completion_order.join(' > ')}`, 'Answers: which processes cannot finish in the current state?']);
    return rows;
  },
  insights(results) {
    const out = ['These two algorithms answer different questions, so their results are labelled side by side, not ranked.',
      'Avoidance uses Maximum demand (Need) to look ahead; detection uses the current Request matrix. In this comparison detection reads the request matrix you entered.'];
    if (results.banker && results.detection) {
      const unsafe = !results.banker.safe, dead = results.detection.deadlocked.length > 0;
      if (unsafe && !dead) out.push('Here the state is unsafe yet no deadlock is detected: unsafe means a deadlock is possible, not that one exists.');
      else if (unsafe && dead) out.push('Here the state is unsafe and detection also finds unfinished processes, so a deadlock exists under the stated requests.');
      else if (!unsafe && dead) out.push('Here the state is safe by the Maximum claims, yet the entered requests leave processes unfinished: the request matrix goes beyond what the claims allow.');
      else out.push('Both views agree: the state is safe and nothing is deadlocked.');
    }
    return out;
  },
  tradeoffs: 'Avoidance never enters an unsafe state but needs maximum demands in advance and can delay safe requests. Detection needs no advance knowledge and allows every request, but deadlock can occur first and recovery is costly.',
};
