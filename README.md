# OS Lab Simulator

**Understand. Simulate. Compare.** An interactive simulator for an 8-week Operating Systems lab:
CPU scheduling, memory allocation, file allocation, deadlocks and page replacement.

- **Core:** pure Python (standard library only) in `api/_core/`, exposed by one serverless function.
- **Frontend:** plain HTML, CSS and JavaScript (ES modules) in `public/`. No build step.
- **Hosting:** Vercel (static `public/` + Python function `api/simulate.py`).

## Run locally

```bash
python dev_server.py          # http://localhost:8000  (python dev_server.py 3000 for another port)
```
Requires Python 3.9+. No `pip install` is needed to run the app. (`vercel dev` also works.)

## Deploy to Vercel

1. Push this folder to a Git repository (or run `vercel` in it with the Vercel CLI).
2. Import the project in Vercel. Framework preset: **Other**. No build command, no output directory needed
   (Vercel serves `public/` and detects `api/simulate.py` as a Python function).
3. Deploy. `vercel.json` already bundles `api/_core/**` with the function.

## Tests and build

```bash
pip install pytest
npm test                      # = python -m pytest tests -q  &&  node --test tests/js/*.test.mjs
```
- `tests/test_*.py`: 99 tests for every algorithm, edge cases and input validation (CPU, memory, files, deadlocks, paging).
- `tests/js/app.test.mjs`: playback controller, saved experiments/progress, CSV/JSON export, compare ranking logic.
- There is no build step and no TypeScript, so there is nothing to compile.

## How it works

The browser POSTs `{module, algorithm, input}` to `/api/simulate`. Python validates the input (nothing is silently
corrected), runs the algorithm and returns a **complete execution trace** plus metrics. The UI renders one trace step at a
time, so Previous step restores the exact earlier state, speed changes never alter results, and editing an input
invalidates the old trace until you run again. Compare runs every selected algorithm on the same input; best-per-metric
and the plain-language summary are computed from the real results.

## Modules

| Week | Module | Algorithms |
|---|---|---|
| 1, 2 | `cpu` | FCFS, SJF (+ SRTF option), Priority (+ preemptive option), Round Robin |
| 3 | `memory` | First Fit, Best Fit, Worst Fit |
| 4, 5 | `files` | Sequential, Indexed, Linked |
| 6 | `deadlock` | Banker's (avoidance + request check), Detection |
| 7, 8 | `paging` | FIFO, Optimal, LRU, Belady's anomaly demo |

## Algorithm assumptions (also shown in the app)

- **CPU:** clock starts at 0 (early idle counts); total time = last completion. Ties: FCFS input order; SJF burst then arrival then ID; Priority arrival then ID. Round Robin queues arrivals at or before a quantum's end before the pre-empted process. Context switches are counted but cost no time.
- **Memory:** one process per block; leftover = internal fragmentation; Best/Worst ties go to the first block.
- **Files:** automatic policy uses lowest-numbered free blocks (Sequential: first contiguous run). 4-byte pointers/index entries; single-level index holds `block_size/4` entries; files are at least 1 byte. Costs are block reads with no caching or seek model (teaching estimates).
- **Deadlocks:** Banker's picks the first eligible process by index (other safe sequences may exist). Detection marks processes holding nothing as finished.
- **Paging:** fixed frame slots; Optimal evicts the earliest-loaded page among those never used again.

## Limits

30 processes (500 total burst), 30 memory blocks/processes, 128 disk blocks, 20 files, 10 processes x 6 resource types,
500 page references, 16 frames.

## Deviations from the original spec

Built with Python + HTML/CSS/JS as requested instead of React/TypeScript/Vite/Recharts/Framer Motion/Lucide/Vitest:
charts are dependency-free HTML/SVG, icons are inline Lucide-style SVG, animation is CSS, tests use pytest and `node:test`.
The spec's "no backend" became a stateless serverless function (no database, nothing stored server-side).
