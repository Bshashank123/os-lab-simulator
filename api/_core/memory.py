"""Contiguous memory allocation: First Fit, Best Fit, Worst Fit.

Policy (documented in the UI): processes are placed in the order given; every block can
hold at most ONE process, so the unused part of an allocated block is internal
fragmentation. Ties for Best/Worst Fit go to the block that appears first.
"""
from .common import ValidationError, to_int

LABELS = {"first": "First Fit", "best": "Best Fit", "worst": "Worst Fit"}
MAX_ITEMS = 30
MAX_SIZE = 100000


def _table(rows, name, kind, errors):
    if not isinstance(rows, list) or not rows:
        errors.append(f"Add at least one {name}.")
        return []
    if len(rows) > MAX_ITEMS:
        errors.append(f"At most {MAX_ITEMS} {name}s are supported.")
        return []
    out, seen = [], set()
    for i, r in enumerate(rows):
        tag = f"{name.capitalize()} row {i + 1}"
        rid = str(r.get("id", "")).strip() if isinstance(r, dict) else ""
        if not rid:
            errors.append(f"{tag}: ID is empty.")
        elif rid in seen:
            errors.append(f"{tag}: duplicate ID '{rid}'.")
        seen.add(rid)
        size = to_int(r.get("size") if isinstance(r, dict) else None, f"{tag} {kind}", errors, 1, MAX_SIZE)
        out.append({"id": rid, "size": size})
    return out


def simulate(inp, algo):
    if algo not in LABELS:
        raise ValidationError(f"Unknown memory allocation algorithm '{algo}'.")
    errors = []
    blocks = _table(inp.get("blocks"), "memory block", "block size", errors)
    procs = _table(inp.get("processes"), "process", "memory request", errors)
    if errors:
        raise ValidationError(errors)

    biggest = max(b["size"] for b in blocks)
    owner, steps, alloc_rows = {}, [], []
    for n, p in enumerate(procs):
        fits = [b for b in blocks if b["id"] not in owner and b["size"] >= p["size"]]
        chosen = None
        if fits:
            if algo == "first":
                chosen = fits[0]
            elif algo == "best":
                chosen = min(fits, key=lambda b: b["size"])
            else:
                chosen = max(fits, key=lambda b: b["size"])
        examined, passed = [], False
        for b in blocks:
            if passed:
                status = "skipped"  # First Fit stops scanning once it finds a block
            elif b["id"] in owner:
                status = "occupied"
            elif b["size"] < p["size"]:
                status = "too_small"
            elif b is chosen:
                status = "selected"
            else:
                status = "candidate"
            if algo == "first" and b is chosen:
                passed = True
            examined.append({"block": b["id"], "size": b["size"], "status": status})

        if chosen:
            owner[chosen["id"]] = p
            waste = chosen["size"] - p["size"]
            cands = ", ".join(f"{b['id']}({b['size']})" for b in fits)
            if algo == "first":
                reason = (f"First Fit scans blocks in order and stops at the first free block with size >= {p['size']}: "
                          f"{chosen['id']} ({chosen['size']}). Internal fragmentation = {waste}.")
            elif algo == "best":
                reason = (f"Best Fit compares every free block that fits [{cands}] and picks the smallest, "
                          f"{chosen['id']} ({chosen['size']}), leaving {waste} unused.")
            else:
                reason = (f"Worst Fit compares every free block that fits [{cands}] and picks the largest, "
                          f"{chosen['id']} ({chosen['size']}), leaving {waste} unused.")
            alloc_rows.append({"process": p["id"], "size": p["size"], "block": chosen["id"],
                               "block_size": chosen["size"], "fragmentation": waste})
        else:
            if p["size"] > biggest:
                reason = (f"{p['id']} requests {p['size']}, which exceeds the largest block ({biggest}). "
                          f"No block could ever hold it, so it stays unallocated.")
            else:
                reason = (f"{p['id']} requests {p['size']}. Every block that is large enough is already assigned, "
                          f"and each block holds only one process, so it stays unallocated.")
            alloc_rows.append({"process": p["id"], "size": p["size"], "block": None, "block_size": None,
                               "fragmentation": None})
        snapshot = {b["id"]: ({"process": owner[b["id"]]["id"], "size": owner[b["id"]]["size"]} if b["id"] in owner else None)
                    for b in blocks}
        steps.append({"step": n + 1, "process": p["id"], "size": p["size"], "examined": examined,
                      "chosen": chosen["id"] if chosen else None, "reason": reason, "allocation": snapshot})

    allocated = [r for r in alloc_rows if r["block"] is not None]
    total_cap = sum(b["size"] for b in blocks)
    unused_free = sum(b["size"] for b in blocks if b["id"] not in owner)
    metrics = {
        "total_capacity": total_cap,
        "total_requested": sum(p["size"] for p in procs),
        "allocated": len(allocated),
        "unallocated": len(procs) - len(allocated),
        "success_rate": round(len(allocated) / len(procs) * 100, 2),
        "internal_fragmentation": sum(r["fragmentation"] for r in allocated),
        "unused_in_free_blocks": unused_free,
        "largest_free_block": max([b["size"] for b in blocks if b["id"] not in owner], default=0),
    }
    return {"algorithm": algo, "label": LABELS[algo], "blocks": blocks, "processes": procs, "steps": steps,
            "rows": alloc_rows, "metrics": metrics,
            "notes": ["Each block holds at most one process; the unused rest of an allocated block is internal fragmentation.",
                      "Free blocks that are too small for any waiting request are a form of external fragmentation; "
                      "'unused in free blocks' reports their total size but is not a complete efficiency score."]}
