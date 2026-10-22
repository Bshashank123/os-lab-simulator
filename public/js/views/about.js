import { h } from '../ui.js';

export function mountAbout(root) {
  const sec = (title, ...kids) => h('section', { class: 'panel prose' }, h('h2', { text: title }), ...kids);
  root.append(h('header', { class: 'page-head' }, h('h1', { text: 'About the project' }), h('p', { class: 'lede', text: 'OS Lab Simulator is a teaching tool for an eight-week Operating Systems lab: it runs real algorithm implementations on your inputs and lets you step through every decision.' })),
    sec('How it works', h('p', { text: 'The algorithms live in plain Python (api/_core), independent of any web code. A single serverless endpoint, /api/simulate, validates your input, runs the algorithm and returns a complete execution trace. The browser (HTML, CSS and JavaScript only) renders that trace one step at a time.' }),
      h('p', { text: 'Because the whole trace is computed first, Previous step restores the exact earlier state, changing the speed never changes results, and editing an input invalidates the old trace until you run again.' })),
    sec('Conventions chosen where several are valid',
      h('ul', {}, ['CPU: the clock starts at 0, so idle time before the first arrival counts. Total simulated time is the last completion time.',
        'CPU tie-breaking: SJF uses burst, then arrival, then process ID. Priority uses arrival, then ID. FCFS uses input order.',
        'Round Robin: processes arriving at or before the instant a quantum ends enter the queue before the pre-empted process.',
        'Memory: each block holds at most one process; leftover space is internal fragmentation. Best/Worst Fit ties go to the first listed block.',
        'Files: automatic allocation uses the lowest-numbered free blocks (Sequential: first contiguous run). Pointers and index entries are 4 bytes; a single-level index holds block size / 4 entries; files are at least 1 byte.',
        'Access cost counts disk-block reads with no caching or seek model: a teaching estimate, not a hardware measurement.',
        "Deadlocks: Banker's picks the first eligible process by index at each step, so other valid safe sequences may exist. Detection marks processes that hold nothing as finished.",
        'Page replacement: frames are fixed slots; Optimal evicts the earliest-loaded page when several are never used again.'].map((t) => h('li', { text: t })))),
    sec('Keyboard shortcuts', h('ul', {}, [['Space', 'Play or pause the current simulation'], ['Right arrow', 'Next step'], ['Left arrow', 'Previous step']].map(([k, d]) => h('li', {}, h('kbd', { text: k }), ` ${d}`))),
      h('p', { class: 'muted', text: 'Shortcuts are ignored while you type in a field.' })),
    sec('Privacy and storage', h('p', { text: 'Preferences, recent runs, progress and saved experiments are kept in your browser (localStorage). Inputs are sent only to this site\'s own /api/simulate endpoint to be calculated; nothing is stored on the server.' })),
    sec('Limits', h('p', { text: 'To keep traces responsive: up to 30 processes (500 total burst units), 30 memory blocks and processes, 128 disk blocks and 20 files, 10 processes and 6 resource types, 500 page references and 16 frames. Optimal page replacement is a benchmark that needs future knowledge and cannot be implemented in a real OS.' })));
  return () => {};
}
