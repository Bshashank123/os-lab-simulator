"""File allocation: Sequential (contiguous), Indexed and Linked.

Assumptions (stated in the UI, because they drive every number):
  * Automatic policy is deterministic: lowest-numbered free blocks; Sequential uses the
    first contiguous free run that is large enough (first fit).
  * Indexed: one index block (the lowest free block) plus data blocks (next lowest free).
    A single-level index holds block_size // 4 pointers (4-byte entries).
  * Linked: each block reserves 4 bytes for the next-block pointer, so it carries
    block_size - 4 bytes of file data.
  * A file must be at least 1 byte (and so occupies at least 1 data block).
  * Access cost = number of disk-block reads, with no caching and no seek model.
    These are teaching estimates, not hardware measurements.
"""
import re

from .common import ValidationError, to_int, int_list

POINTER = 4
LABELS = {"sequential": "Sequential (Contiguous)", "indexed": "Indexed", "linked": "Linked"}
MAX_BLOCKS = 128
MAX_FILES = 20


def _ceil(a, b):
    return -(-a // b)


def _needed(method, size, bs):
    if method == "linked":
        return _ceil(size, bs - POINTER), 0
    return _ceil(size, bs), (1 if method == "indexed" else 0)


def _largest_run(free):
    best = cur = 0
    prev = None
    for b in sorted(free):
        cur = cur + 1 if prev is not None and b == prev + 1 else 1
        best = max(best, cur)
        prev = b
    return best


def _validate(inp, method):
    errors = []
    total = to_int(inp.get("total_blocks"), "Total disk blocks", errors, 4, MAX_BLOCKS)
    bs = to_int(inp.get("block_size"), "Block size (bytes)", errors, 8, 65536)
    mode = inp.get("mode", "auto")
    if mode not in ("auto", "manual"):
        errors.append("Mode must be 'auto' or 'manual'.")
    reserved = int_list(inp.get("reserved"), "Reserved block", errors, 0, (total or MAX_BLOCKS) - 1)
    rows = inp.get("files")
    if not isinstance(rows, list) or not rows:
        errors.append("Add at least one file.")
        rows = []
    if len(rows) > MAX_FILES:
        errors.append(f"At most {MAX_FILES} files are supported.")
    files, seen = [], set()
    for i, r in enumerate(rows[:MAX_FILES]):
        tag = f"File row {i + 1}"
        name = str(r.get("name", "")).strip() if isinstance(r, dict) else ""
        if not name:
            errors.append(f"{tag}: file name is empty.")
        elif name in seen:
            errors.append(f"{tag}: duplicate file name '{name}'.")
        seen.add(name)
        size = to_int(r.get("size"), f"{tag} size (bytes)", errors, 1)
        f = {"name": name, "size": size, "start": None, "blocks": []}
        if mode == "manual" and total and bs and size:
            data_n, meta_n = _needed(method, size, bs)
            if method in ("sequential", "indexed"):
                f["start"] = to_int(r.get("start"), f"{tag} {'start' if method == 'sequential' else 'index'} block",
                                    errors, 0, total - 1)
            if method in ("indexed", "linked"):
                f["blocks"] = int_list(r.get("blocks"), f"{tag} data block", errors, 0, total - 1)
                if len(f["blocks"]) != data_n:
                    errors.append(f"{tag}: needs exactly {data_n} data block(s) for {size} bytes, got {len(f['blocks'])}.")
                if len(set(f["blocks"])) != len(f["blocks"]):
                    errors.append(f"{tag}: a block is listed more than once.")
                if f["start"] is not None and f["start"] in f["blocks"]:
                    errors.append(f"{tag}: the index block cannot also be a data block.")
            if method == "sequential" and f["start"] is not None and f["start"] + data_n > total:
                errors.append(f"{tag}: blocks {f['start']}..{f['start'] + data_n - 1} run past the end of the disk "
                              f"(last block is {total - 1}).")
        files.append(f)
    if errors:
        raise ValidationError(errors)
    return total, bs, mode, sorted(set(reserved)), files


def _auto(method, data_n, meta_n, used, total, bs):
    """Return (blocks dict, None) or (None, failure reason)."""
    free = [b for b in range(total) if b not in used]
    if method == "sequential":
        run = []
        for b in free:
            run = run + [b] if run and b == run[-1] + 1 else [b]
            if len(run) == data_n:
                return {"data": run, "index": None}, None
        largest = _largest_run(free)
        why = (f"Needs {data_n} contiguous free block(s) but the largest contiguous free run is {largest}.")
        if len(free) >= data_n:
            why += f" {len(free)} blocks are free in total, so this is external fragmentation: enough space, but not in one piece."
        return None, why
    if method == "indexed":
        cap = bs // POINTER
        if data_n > cap:
            return None, (f"The file needs {data_n} data pointers but a single index block of {bs} bytes holds only {cap} "
                          f"({POINTER}-byte entries). A multi-level index would be required.")
    need = data_n + meta_n
    if len(free) < need:
        return None, f"Disk full: needs {need} block(s) ({data_n} data + {meta_n} index) but only {len(free)} are free."
    if method == "indexed":
        return {"data": free[1:1 + data_n], "index": free[0]}, None
    return {"data": free[:data_n], "index": None}, None


def _manual(method, f, data_n, used):
    blocks = list(range(f["start"], f["start"] + data_n)) if method == "sequential" else f["blocks"]
    idx = f["start"] if method == "indexed" else None
    wanted = blocks + ([idx] if idx is not None else [])
    clash = sorted(b for b in wanted if b in used)
    if clash:
        return None, clash, f"Requested block(s) {', '.join(map(str, clash))} are reserved or already allocated, so this allocation was refused."
    return {"data": blocks, "index": idx}, [], None


def simulate(inp, method):
    if method not in LABELS:
        raise ValidationError(f"Unknown file allocation method '{method}'.")
    total, bs, mode, reserved, files = _validate(inp, method)
    disk = [{"state": "reserved" if b in reserved else "free", "file": None, "next": None, "pos": None} for b in range(total)]
    used = set(reserved)
    steps, rows = [], []
    for f in files:
        data_n, meta_n = _needed(method, f["size"], bs)
        invalid = []
        if mode == "auto":
            got, why = _auto(method, data_n, meta_n, used, total, bs)
        else:
            got, invalid, why = _manual(method, f, data_n, used)
        row = {"name": f["name"], "size": f["size"], "ok": got is not None, "data_blocks": data_n, "meta_blocks": meta_n,
               "blocks": [], "index_block": None, "total_blocks": 0, "overhead_pct": 0.0, "internal_waste": 0,
               "pointer_bytes": 0, "seq_cost": None, "direct_cost_last": None, "reason": why}
        details = {"needed_data": data_n, "needed_meta": meta_n}
        if got:
            for b in got["data"] + ([got["index"]] if got["index"] is not None else []):
                used.add(b)
            for k, b in enumerate(got["data"]):
                disk[b] = {"state": "data", "file": f["name"], "pos": k,
                           "next": got["data"][k + 1] if method == "linked" and k + 1 < data_n else None}
            if got["index"] is not None:
                disk[got["index"]] = {"state": "index", "file": f["name"], "next": None, "pos": None}
            capacity = data_n * (bs - POINTER if method == "linked" else bs)
            row.update(blocks=got["data"], index_block=got["index"], total_blocks=data_n + meta_n,
                       overhead_pct=round(meta_n / (data_n + meta_n) * 100, 2) if meta_n else 0.0,
                       internal_waste=capacity - f["size"],
                       pointer_bytes=data_n * POINTER if method == "linked" else 0)
            if method == "sequential":
                row.update(seq_cost=data_n, direct_cost_last=1)
                details["range"] = [got["data"][0], got["data"][-1]]
                why = f"Allocated contiguous blocks {got['data'][0]}..{got['data'][-1]} ({data_n} block(s))."
            elif method == "indexed":
                row.update(seq_cost=data_n + 1, direct_cost_last=2)
                details["mapping"] = [{"entry": k, "block": b} for k, b in enumerate(got["data"])]
                why = (f"Index block {got['index']} stores {data_n} pointer(s) to data blocks "
                       f"{', '.join(map(str, got['data']))}. The index block is metadata, not file data.")
            else:
                row.update(seq_cost=data_n, direct_cost_last=data_n)
                details["chain"] = got["data"]
                why = (f"Chained {data_n} block(s): {' -> '.join(map(str, got['data']))} -> EOF. "
                       f"Each block spends {POINTER} bytes on a pointer, leaving {bs - POINTER} data bytes.")
            row["reason"] = why
        else:
            why = f"Allocation of '{f['name']}' failed. {why}"
            row["reason"] = why
        details.update({"invalid": invalid})
        steps.append({"type": "allocate", "step": len(steps) + 1, "file": f["name"], "ok": got is not None,
                      "reason": why, "details": details, "invalid": invalid,
                      "disk": [dict(d) for d in disk]})
        if got and method == "linked":
            chain = got["data"]
            for k, b in enumerate(chain):
                nxt = chain[k + 1] if k + 1 < len(chain) else None
                steps.append({"type": "traverse", "step": len(steps) + 1, "file": f["name"], "position": k,
                              "block": b, "next": nxt, "chain": chain[:k + 1],
                              "reason": f"Traversal of '{f['name']}': read block {b} (#{k + 1} of {len(chain)}); "
                                        + (f"its pointer leads to block {nxt}." if nxt is not None else "its pointer is null: end of file.")})
        rows.append(row)

    ok_rows = [r for r in rows if r["ok"]]
    free_after = [b for b in range(total) if b not in used]
    data_sum = sum(r["data_blocks"] for r in ok_rows)
    meta_sum = sum(r["meta_blocks"] for r in ok_rows)
    consumed = data_sum + meta_sum
    metrics = {
        "files_allocated": len(ok_rows), "files_failed": len(rows) - len(ok_rows),
        "data_blocks": data_sum, "meta_blocks": meta_sum, "total_consumed": consumed,
        "overhead_pct": round(meta_sum / consumed * 100, 2) if consumed else 0.0,
        "internal_waste_bytes": sum(r["internal_waste"] for r in ok_rows),
        "pointer_bytes": sum(r["pointer_bytes"] for r in ok_rows),
        "free_blocks_after": len(free_after), "largest_free_run_after": _largest_run(free_after),
        "avg_sequential_cost": round(sum(r["seq_cost"] for r in ok_rows) / len(ok_rows), 2) if ok_rows else 0.0,
    }
    tradeoffs = {
        "sequential": "Fast sequential and direct access (1 read to reach any block) and no metadata, but needs one contiguous free run, suffers external fragmentation and makes growing a file hard.",
        "indexed": "Direct access in 2 reads (index + data) and no external fragmentation, but every file pays one index block and large files can exceed a single index block.",
        "linked": "No external fragmentation and files can grow easily, but reaching block k needs k pointer reads, each block loses pointer bytes, and one damaged pointer loses the rest of the chain.",
    }[method]
    return {"algorithm": method, "label": LABELS[method], "config": {"total_blocks": total, "block_size": bs, "mode": mode,
            "reserved": reserved, "pointer_bytes": POINTER}, "steps": steps, "files": rows, "metrics": metrics,
            "tradeoffs": tradeoffs,
            "notes": [f"Assumed pointer/index entry size: {POINTER} bytes. Cost = disk-block reads; no caching or seek time.",
                      "Automatic policy: lowest-numbered free blocks (Sequential: first sufficiently large contiguous run).",
                      "Estimates are for teaching and are not hardware measurements."]}
