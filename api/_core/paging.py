"""Page replacement: FIFO, Optimal, LRU, plus a Belady's anomaly sweep.

Frames are fixed slots (a replaced page takes the victim's slot) so the animation is stable.
Optimal tie-break: if several resident pages are never used again, the one loaded earliest is evicted.
Only Optimal looks at future references.
"""
import re

from .common import ValidationError, to_int

LABELS = {"fifo": "FIFO", "optimal": "Optimal", "lru": "LRU"}
MAX_REFS, MAX_FRAMES = 500, 16
INF = 10 ** 9
BELADY_DEFAULT = "1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5"


def parse_refs(raw, errors):
    if raw is None or (isinstance(raw, (str, list)) and len(raw) == 0) or (isinstance(raw, str) and not raw.strip()):
        errors.append("The reference string is empty. Enter page numbers such as 7, 0, 1, 2, 0, 3.")
        return []
    tokens = [t for t in re.split(r"[,\s]+", raw.strip()) if t] if isinstance(raw, str) else list(raw)
    refs = []
    for t in tokens:
        v = to_int(t, f"Reference '{t}'", errors, 0)
        if v is not None:
            refs.append(v)
    if len(refs) > MAX_REFS:
        errors.append(f"At most {MAX_REFS} references are supported.")
    return refs


def _validate(inp):
    errors = []
    refs = parse_refs(inp.get("reference_string", inp.get("refs")), errors)
    frames = to_int(inp.get("frames"), "Number of frames", errors, 1, MAX_FRAMES)
    if errors:
        raise ValidationError(errors)
    return refs, frames


def _run(refs, nf, algo):
    slots = [None] * nf
    loaded_at, last_used, steps = {}, {}, []
    faults = 0
    for i, p in enumerate(refs):
        hit = p in slots
        info = {"candidates": [], "victim": None}
        evicted = loaded = None
        if hit:
            slot = slots.index(p)
            note = {"fifo": "FIFO order is unchanged: a hit does not renew the page's arrival time.",
                    "lru": "LRU records this access, making it the most recently used page.",
                    "optimal": "Optimal needs no replacement on a hit."}[algo]
            expl = f"Page {p} is already in frame {slot}: page hit. {note}"
        else:
            faults += 1
            loaded = p
            if None in slots:
                slot = slots.index(None)
                expl = f"Page {p} is not in memory (page fault). Frame {slot} is empty, so it is loaded without evicting anything."
            else:
                resident = list(slots)
                if algo == "fifo":
                    cands = [{"page": q, "value": loaded_at[q] + 1, "info": f"loaded at reference #{loaded_at[q] + 1}"} for q in resident]
                    victim = min(resident, key=lambda q: loaded_at[q])
                    why = (f"FIFO replaces the page that has been resident the longest: page {victim} "
                           f"(loaded at reference #{loaded_at[victim] + 1}).")
                elif algo == "lru":
                    cands = [{"page": q, "value": last_used[q] + 1, "info": f"last used at reference #{last_used[q] + 1}"} for q in resident]
                    victim = min(resident, key=lambda q: last_used[q])
                    why = (f"LRU replaces the page not used for the longest time: page {victim} "
                           f"(last used at reference #{last_used[victim] + 1}).")
                else:
                    def nxt(q):
                        for j in range(i + 1, len(refs)):
                            if refs[j] == q:
                                return j
                        return None
                    cands = [{"page": q, "value": nxt(q), "info": ("never used again" if nxt(q) is None else f"next used at reference #{nxt(q) + 1}")}
                             for q in resident]
                    victim = max(resident, key=lambda q: ((nxt(q) if nxt(q) is not None else INF), -loaded_at[q]))
                    vn = nxt(victim)
                    why = (f"Optimal looks ahead and replaces the page whose next use is farthest away: page {victim} "
                           + ("is never used again." if vn is None else f"is next used at reference #{vn + 1}."))
                    if sum(1 for c in cands if c["value"] is None) > 1:
                        why += " Several pages are never used again; the one loaded earliest is chosen."
                slot = slots.index(victim)
                evicted = victim
                info = {"candidates": cands, "victim": victim}
                expl = (f"Page {p} is not in memory (page fault) and all {nf} frame(s) are occupied. {why} "
                        f"Page {victim} leaves frame {slot}.")
            slots[slot] = p
            loaded_at[p] = i
        last_used[p] = i
        steps.append({"step": i + 1, "index": i, "page": p, "hit": hit, "frames": list(slots), "slot": slot,
                      "loaded": loaded, "evicted": evicted, "faults": faults, "hits": i + 1 - faults,
                      "candidates": info["candidates"], "victim": info["victim"], "explanation": expl})
    return steps


def _metrics(steps):
    total = len(steps)
    faults = sum(1 for s in steps if not s["hit"])
    hits = total - faults
    return {"total_references": total, "page_faults": faults, "page_hits": hits,
            "fault_rate": round(faults / total * 100, 2), "hit_rate": round(hits / total * 100, 2)}


def belady(inp):
    errors = []
    refs = parse_refs(inp.get("reference_string") or BELADY_DEFAULT, errors)
    top = to_int(inp.get("max_frames", 7), "Maximum frames", errors, 2, MAX_FRAMES)
    if errors:
        raise ValidationError(errors)
    rows = []
    for f in range(1, top + 1):
        rows.append({"frames": f, **{a: sum(1 for s in _run(refs, f, a) if not s["hit"]) for a in LABELS}})
    anomalies = [{"from_frames": rows[k]["frames"], "to_frames": rows[k + 1]["frames"],
                  "faults_from": rows[k]["fifo"], "faults_to": rows[k + 1]["fifo"]}
                 for k in range(len(rows) - 1) if rows[k + 1]["fifo"] > rows[k]["fifo"]]
    return {"algorithm": "belady", "label": "Belady's anomaly (FIFO)", "references": refs, "rows": rows,
            "anomalies": anomalies}


def simulate(inp, algo):
    if algo == "belady":
        return belady(inp)
    if algo not in LABELS:
        raise ValidationError(f"Unknown page replacement algorithm '{algo}'.")
    refs, frames = _validate(inp)
    steps = _run(refs, frames, algo)
    return {"algorithm": algo, "label": LABELS[algo], "references": refs, "frames": frames, "steps": steps,
            "metrics": _metrics(steps),
            "notes": ["Page Fault Rate = Faults / Total references x 100%; Hit Rate = Hits / Total references x 100%.",
                      "Optimal is a benchmark: it needs future knowledge and cannot be implemented in a real OS."]}
