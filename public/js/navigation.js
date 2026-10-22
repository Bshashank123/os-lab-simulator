// Syllabus mapping: which weeks exist, which module each uses, and which algorithms belong to each week.
export const WEEKS = [
  { n: 1, nav: 'Week 1 — FCFS Scheduling', topic: 'CPU Scheduling', module: 'cpu', algs: ['fcfs'], covers: 'FCFS', blurb: 'Run processes in arrival order and see how one long job delays everything behind it (the convoy effect).' },
  { n: 2, nav: 'Week 2 — CPU Scheduling', topic: 'CPU Scheduling', module: 'cpu', algs: ['sjf', 'priority', 'rr'], covers: 'SJF, Priority, Round Robin', blurb: 'Compare shortest-job, priority and time-sliced scheduling on the same processes.' },
  { n: 3, nav: 'Week 3 — Memory Allocation', topic: 'Memory Allocation', module: 'memory', algs: ['first', 'best', 'worst'], covers: 'First Fit, Best Fit, Worst Fit', blurb: 'Place processes into memory blocks and watch fragmentation appear.' },
  { n: 4, nav: 'Week 4 — File Allocation', topic: 'File Allocation', module: 'files', algs: ['sequential', 'indexed'], covers: 'Sequential, Indexed', blurb: 'Store files in contiguous runs or behind an index block on a numbered disk.' },
  { n: 5, nav: 'Week 5 — File Allocation', topic: 'File Allocation', module: 'files', algs: ['linked'], covers: 'Linked', blurb: 'Chain blocks together with pointers and follow the chain from the first block.' },
  { n: 6, nav: 'Week 6 — Deadlocks', topic: 'Deadlocks', module: 'deadlock', algs: ['banker', 'detection'], covers: "Avoidance (Banker's), Detection", blurb: 'Test whether a state is safe, decide on resource requests, and find processes that cannot finish.' },
  { n: 7, nav: 'Week 7 — Page Replacement', topic: 'Page Replacement', module: 'paging', algs: ['fifo'], covers: 'FIFO', blurb: "Step through FIFO frame by frame and reproduce Belady's anomaly." },
  { n: 8, nav: 'Week 8 — Page Replacement', topic: 'Page Replacement', module: 'paging', algs: ['optimal', 'lru'], covers: 'Optimal, LRU', blurb: 'See how looking ahead (Optimal) and looking back (LRU) choose different victims.' },
];
export const week = (n) => WEEKS.find((w) => w.n === Number(n));
