import { h, clear, editableTable, field, textInput, select, checkbox, chip, icon, table, pcolor, rnd, nextId, fmt, clone, put } from '../ui.js';

const P = (id, a, b, p) => ({ id, arrival: String(a), burst: String(b), priority: String(p) });
const SAMPLES = [
  { name: 'Classic four processes', make: () => ({ processes: [P('P1', 0, 5, 2), P('P2', 1, 3, 1), P('P3', 2, 8, 4), P('P4', 3, 6, 3)], quantum: '2', priority_rule: 'lower', preemptive: false }) },
  { name: 'Convoy effect (long job first)', make: () => ({ processes: [P('P1', 0, 24, 3), P('P2', 1, 3, 1), P('P3', 2, 3, 2)], quantum: '4', priority_rule: 'lower', preemptive: false }) },
  { name: 'CPU idle gaps', make: () => ({ processes: [P('P1', 2, 3, 2), P('P2', 4, 2, 1), P('P3', 12, 4, 3)], quantum: '2', priority_rule: 'lower', preemptive: false }) },
  { name: 'Same arrival, equal bursts', make: () => ({ processes: [P('P1', 0, 4, 1), P('P2', 0, 4, 1), P('P3', 0, 4, 2)], quantum: '3', priority_rule: 'lower', preemptive: false }) },
];

export const cpu = {
  id: 'cpu', label: 'CPU Scheduling',
  algorithms: { fcfs: 'FCFS', sjf: 'SJF', priority: 'Priority', rr: 'Round Robin' },
  defaultInput: () => SAMPLES[0].make(),
  samples: SAMPLES,
  random() {
    const n = rnd(4, 6);
    return { processes: Array.from({ length: n }, (_, i) => P(`P${i + 1}`, rnd(0, 8), rnd(1, 9), rnd(1, 5))), quantum: String(rnd(2, 4)), priority_rule: 'lower', preemptive: false };
  },

  renderInputs(el, input, algs, onChange) {
    el.append(editableTable({
      label: 'Process table', rows: input.processes, onChange,
      columns: [{ key: 'id', label: 'Process', size: 5 }, { key: 'arrival', label: 'Arrival', numeric: true, size: 4 }, { key: 'burst', label: 'Burst', numeric: true, size: 4 },
        { key: 'priority', label: 'Priority', numeric: true, size: 4 }],
      newRow: (rows) => P(nextId(rows, 'id', 'P'), 0, 1, 1),
    }));
    el.append(h('p', { class: 'hint', text: 'Arrival and priority are whole numbers 0 or more (priority may be any integer); burst must be 1 or more.' }));
  },
  renderSettings(el, input, algs, onChange) {
    if (algs.includes('rr')) el.append(field('Round Robin time quantum', textInput(input.quantum, (v) => { input.quantum = v; onChange(); }, { inputmode: 'numeric', class: 'num', size: 4 }), 'A positive whole number.'));
    if (algs.includes('priority')) {
      el.append(field('Priority convention', select([{ value: 'lower', label: 'Lower number = higher priority' }, { value: 'higher', label: 'Higher number = higher priority' }], input.priority_rule, (v) => { input.priority_rule = v; onChange(); })));
    }
    if (algs.includes('sjf') || algs.includes('priority')) {
      el.append(checkbox('Preemptive variant (extension)', !!input.preemptive, (v) => { input.preemptive = v; onChange(); }, 'SJF becomes Shortest Remaining Time First; Priority becomes preemptive. Off = the required non-preemptive versions.'));
    }
    el.append(h('p', { class: 'hint', text: 'Clock starts at t=0. Ties: SJF by burst, then arrival, then ID. Priority by arrival, then ID. Round Robin queues arrivals before the pre-empted process.' }));
  },

  metrics(r) {
    const m = r.metrics;
    return [
      { label: 'Avg waiting time', value: fmt(m.avg_waiting), tip: 'Waiting = Turnaround - Burst' },
      { label: 'Avg turnaround time', value: fmt(m.avg_turnaround), tip: 'Turnaround = Completion - Arrival' },
      { label: 'Avg response time', value: fmt(m.avg_response), tip: 'Response = First start - Arrival' },
      { label: 'CPU utilization', value: `${fmt(m.cpu_utilization)}%`, tip: 'Busy time / Total simulated time' },
      { label: 'Throughput', value: `${fmt(m.throughput)} /unit`, tip: 'Completed processes / Total simulated time' },
      { label: 'Context switches', value: m.context_switches, tip: 'Changes of running process (not charged any time in this model)' },
    ];
  },
  table: (r) => ({
    columns: ['Process', 'Arrival', 'Burst', 'Priority', 'First start', 'Completion', 'Turnaround', 'Waiting', 'Response'],
    rows: r.processes.map((p) => [p.id, p.arrival, p.burst, p.priority, p.first_start, p.completion, p.turnaround, p.waiting, p.response]),
  }),
  logLine(r, i) {
    const s = r.steps[i];
    return s.pid ? `t=${s.start}-${s.end}: ${s.pid} runs. ${s.event === 'completed' ? 'Completes.' : s.event === 'preempted' ? 'Pre-empted.' : ''}` : `t=${s.start}-${s.end}: CPU idle.`;
  },
  explain(r, i) {
    const s = r.steps[i];
    return h('div', {}, h('p', { text: s.reason }), h('p', { class: 'outcome', text: s.outcome }));
  },

  viz(root, r, input) {
    const total = r.metrics.total_time || 1;
    const idx = Object.fromEntries(r.processes.map((p, k) => [p.id, k]));
    const track = h('div', { class: 'gantt-track', role: 'img', 'aria-label': 'Gantt chart of CPU execution' });
    const blocks = r.steps.map((s) => {
      const b = h('div', { class: `gblock ${s.pid ? '' : 'idle'}`, style: { left: `${(s.start / total) * 100}%`, width: `${((s.end - s.start) / total) * 100}%`, '--c': s.pid ? pcolor(idx[s.pid]) : 'transparent' }, title: s.pid ? `${s.pid}: t=${s.start}-${s.end}` : `Idle: t=${s.start}-${s.end}` },
        h('span', { class: 'fill' }), h('span', { class: 'glabel', text: s.pid || 'idle' }));
      track.append(b);
      return b;
    });
    const cursor = h('div', { class: 'cursor', 'aria-hidden': 'true' });
    track.append(cursor);
    const axis = h('div', { class: 'gantt-axis' });
    const ticks = [...new Set([0, ...r.steps.map((s) => s.end)])];
    let lastPct = -10;
    ticks.forEach((t) => { const pct = (t / total) * 100; if (pct - lastPct >= 3.2 || t === total) { axis.append(h('span', { style: { left: `${pct}%` }, text: t })); lastPct = pct; } });
    const meta = h('div', { class: 'viz-meta' });
    const queues = h('div', { class: 'queues' });
    const tbody = h('tbody');
    const stateTable = h('div', { class: 'table-wrap' }, h('table', { class: 'data', 'aria-label': 'Process states' },
      h('thead', {}, h('tr', {}, ['Process', 'Priority', 'Left', 'Progress', 'State'].map((c) => h('th', { scope: 'col', text: c })))), tbody));
    const conv = r.algorithm === 'priority'
      ? chip(`Priority convention: ${r.config.rule === 'lower' ? 'lower number = higher priority' : 'higher number = higher priority'}`, 'chip-info') : null;
    put(root, h('div', { class: 'gantt' }, track, axis), meta, conv, queues, stateTable);

    const stateOf = (p, s) => {
      if (s.done.includes(p.id) && s.pid !== p.id) return ['Completed', 'ok', 'check'];
      if (s.pid === p.id) return [s.event === 'completed' ? 'Running, completes' : s.event === 'preempted' ? 'Running, then pre-empted' : 'Running', 'run', 'play'];
      if (p.arrival <= s.end) return ['Ready (waiting)', 'wait', 'clock'];
      return ['Not arrived', 'idle', 'idle'];
    };
    return {
      update(i) {
        const s = r.steps[i];
        blocks.forEach((b, k) => { b.classList.toggle('done', k < i); b.classList.toggle('running', k === i); b.classList.toggle('future', k > i); });
        cursor.style.left = `${(s.end / total) * 100}%`;
        clear(meta).append(chip(`Simulated time t = ${s.end}`, 'chip-time'), s.pid ? chip(`Running: ${s.pid} (t=${s.start} to ${s.end})`, 'chip-run') : chip(`CPU idle (t=${s.start} to ${s.end})`, 'chip-idle'));
        clear(queues);
        const row = (label, items) => h('div', { class: 'qrow' }, h('span', { class: 'qlabel', text: label }),
          items.length ? items.map((q, n) => chip(`${q.id}${q.remaining !== undefined ? ` (${q.remaining})` : ''}`, n === 0 && s.pid ? 'chip-run' : '', { '--c': pcolor(idx[q.id]) })) : h('span', { class: 'muted', text: 'empty' }));
        queues.append(row(r.algorithm === 'rr' ? 'Ready queue at decision (head first)' : 'Ready at decision (next to run first)', s.ready));
        if (r.algorithm === 'rr') queues.append(row('Queue after this slice', (s.queue_after || []).map((id) => ({ id, remaining: s.remaining[id] }))));
        clear(tbody);
        r.processes.forEach((p) => {
          const [label, tone, ic] = stateOf(p, s);
          const left = s.remaining[p.id];
          tbody.append(h('tr', { class: s.pid === p.id ? 'row-active' : '' },
            h('td', {}, h('span', { class: 'pdot', style: { '--c': pcolor(idx[p.id]) } }), p.id),
            h('td', { text: p.priority }), h('td', { text: left }),
            h('td', {}, h('div', { class: 'mini-bar' }, h('span', { style: { width: `${((p.burst - left) / p.burst) * 100}%`, '--c': pcolor(idx[p.id]) } }))),
            h('td', {}, h('span', { class: `state state-${tone}` }, icon(ic, 12), label))));
        });
      },
    };
  },

  compareMetrics: [
    { key: 'avg_waiting', label: 'Average waiting time', better: 'min', formula: 'Waiting = Turnaround - Burst' },
    { key: 'avg_turnaround', label: 'Average turnaround time', better: 'min', formula: 'Turnaround = Completion - Arrival' },
    { key: 'avg_response', label: 'Average response time', better: 'min', formula: 'Response = First start - Arrival' },
    { key: 'cpu_utilization', label: 'CPU utilization (%)', better: 'max', formula: 'Busy time / Total time x 100' },
    { key: 'throughput', label: 'Throughput (jobs/unit)', better: 'max', formula: 'Completed / Total time' },
    { key: 'context_switches', label: 'Context switches', better: 'min', formula: 'Changes of running process' },
  ],
  insights(results) {
    const out = [];
    const rr = results.rr, others = Object.entries(results).filter(([k]) => k !== 'rr');
    if (rr && others.length) out.push(`Round Robin made ${rr.metrics.context_switches} context switch(es) versus ${others.map(([k, v]) => `${v.metrics.context_switches} for ${k.toUpperCase()}`).join(', ')}. It tends to improve responsiveness at the cost of more switching; this simulator does not charge any time for a switch.`);
    const bursts = Object.values(results)[0]?.processes.map((p) => p.burst) || [];
    if (Math.max(...bursts) >= 3 * Math.min(...bursts)) out.push('This workload mixes short and long jobs, so ordering matters: algorithms that run short jobs early usually lower the average waiting time.');
    const utils = Object.values(results).map((v) => v.metrics.cpu_utilization);
    out.push(utils.every((u) => u === utils[0])
      ? `CPU utilization is the same for every algorithm (${utils[0]}%): total work is identical and idle time is forced by the arrival times, not by the scheduler.`
      : 'CPU utilization differs because the preemptive variants can fill gaps differently; idle time only occurs when no process has arrived.');
    return out;
  },
  tradeoffs: 'FCFS is simple but suffers from the convoy effect. SJF minimises average waiting but can starve long jobs and needs burst estimates. Priority reflects importance but can starve low-priority jobs. Round Robin is fair and responsive but may raise turnaround time and context switching.',
};
