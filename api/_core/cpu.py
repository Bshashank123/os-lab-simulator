"""CPU scheduling: FCFS, SJF, Priority (non-preemptive; SRTF / preemptive priority as
extensions) and Round Robin.

Conventions (also shown in the UI and README):
  * The simulation clock starts at t = 0. Idle time before the first arrival counts as idle.
  * Total simulated time = completion time of the last process.
  * FCFS ties (same arrival): input order. SJF ties: burst, then arrival, then process ID.
    Priority ties: arrival, then process ID.
  * Round Robin: processes that arrive at or before the instant a quantum expires are
    queued BEFORE the pre-empted process is re-queued.
"""
from collections import deque

from .common import ValidationError, to_int, nat, r2

LABELS = {
    "fcfs": "First Come, First Served",
    "sjf": "Shortest Job First",
    "priority": "Priority Scheduling",
    "rr": "Round Robin",
}
MAX_PROCS = 30
MAX_TIME = 1000
MAX_TOTAL_BURST = 500


def _validate(inp, algo):
    if algo not in LABELS:
        raise ValidationError(f"Unknown CPU scheduling algorithm '{algo}'.")
    rows = inp.get("processes")
    if not isinstance(rows, list) or not rows:
        raise ValidationError("Add at least one process before running the simulation.")
    if len(rows) > MAX_PROCS:
        raise ValidationError(f"At most {MAX_PROCS} processes are supported.")
    errors, procs, seen = [], [], set()
    for i, r in enumerate(rows):
        tag = f"Row {i + 1}"
        if not isinstance(r, dict):
            errors.append(f"{tag}: incomplete row.")
            continue
        pid = str(r.get("id", "")).strip()
        if not pid:
            errors.append(f"{tag}: Process ID is empty.")
        elif pid in seen:
            errors.append(f"{tag}: duplicate Process ID '{pid}'.")
        seen.add(pid)
        a = to_int(r.get("arrival"), f"{tag} arrival time", errors, 0, MAX_TIME)
        b = to_int(r.get("burst"), f"{tag} burst time", errors, 1, MAX_TIME)
        if algo == "priority":
            p = to_int(r.get("priority"), f"{tag} priority", errors)
        else:  # priority column is informational for the other algorithms
            p = to_int(r.get("priority", 0), "", [])
            p = 0 if p is None else p
        procs.append({"id": pid, "arrival": a, "burst": b, "priority": p, "idx": i})
    quantum = None
    if algo == "rr":
        quantum = to_int(inp.get("quantum"), "Time quantum", errors, 1, MAX_TIME)
    rule = inp.get("priority_rule", "lower")
    if rule not in ("lower", "higher"):
        errors.append("Priority convention must be 'lower' or 'higher'.")
    if errors:
        raise ValidationError(errors)
    if sum(p["burst"] for p in procs) > MAX_TOTAL_BURST:
        raise ValidationError(f"Total burst time is limited to {MAX_TOTAL_BURST} units in this simulator.")
    preemptive = bool(inp.get("preemptive")) and algo in ("sjf", "priority")
    return procs, {"quantum": quantum, "rule": rule, "preemptive": preemptive}


# ---------------------------------------------------------------- selection keys
def _key(algo, rule, rem):
    if algo == "fcfs":
        return lambda p: (p["arrival"], p["idx"])
    if algo == "sjf":
        return lambda p: (rem[p["id"]], p["arrival"], nat(p["id"]))
    sign = 1 if rule == "lower" else -1
    return lambda p: (sign * p["priority"], p["arrival"], nat(p["id"]))


def _primary(algo, rem, preemptive):
    if algo == "fcfs":
        return (lambda p: p["arrival"]), "earliest arrival time"
    if algo == "sjf":
        return (lambda p: rem[p["id"]]), ("shortest remaining time" if preemptive else "shortest burst time")
    return (lambda p: p["priority"]), "highest priority"


_TIE = {"fcfs": "input order", "sjf": "earlier arrival, then process ID", "priority": "earlier arrival, then process ID"}


def _reason(algo, rule, c, ready, rem, preemptive):
    prim, label = _primary(algo, rem, preemptive)
    if algo == "priority":
        label += f" ({'lower' if rule == 'lower' else 'higher'} number = higher priority)"
    pv = prim(c)
    others = ", ".join(f"{p['id']}({prim(p)})" for p in ready)
    text = f"{c['id']} has the {label}: {pv}, among ready processes [{others}]."
    tied = [p["id"] for p in ready if p is not c and prim(p) == pv]
    if tied:
        text += f" Tie with {', '.join(tied)} broken by {_TIE[algo]}."
    return text


def _ready_view(ready, rem):
    return [{"id": p["id"], "remaining": rem[p["id"]], "priority": p["priority"], "arrival": p["arrival"]} for p in ready]


# ---------------------------------------------------------------- generators
def _non_preemptive(procs, algo, rule):
    rem = {p["id"]: p["burst"] for p in procs}
    keyf = _key(algo, rule, rem)
    t, done, steps = 0, set(), []
    while len(done) < len(procs):
        ready = sorted([p for p in procs if p["id"] not in done and p["arrival"] <= t], key=keyf)
        if not ready:
            nxt = min(p["arrival"] for p in procs if p["id"] not in done)
            steps.append({"type": "idle", "pid": None, "start": t, "end": nxt, "ready": [],
                          "reason": f"No process has arrived yet, so the CPU is idle from t={t} to t={nxt}."})
            t = nxt
            continue
        c = ready[0]
        steps.append({"type": "run", "pid": c["id"], "start": t, "end": t + c["burst"],
                      "ready": _ready_view(ready, rem), "reason": _reason(algo, rule, c, ready, rem, False)})
        t += c["burst"]
        done.add(c["id"])
    return steps


def _preemptive(procs, algo, rule):
    rem = {p["id"]: p["burst"] for p in procs}
    keyf = _key(algo, rule, rem)
    t, steps = 0, []
    while any(rem.values()):
        ready = sorted([p for p in procs if rem[p["id"]] > 0 and p["arrival"] <= t], key=keyf)
        if not ready:
            nxt = min(p["arrival"] for p in procs if rem[p["id"]] > 0)
            steps.append({"type": "idle", "pid": None, "start": t, "end": nxt, "ready": [],
                          "reason": f"No process has arrived yet, so the CPU is idle from t={t} to t={nxt}."})
            t = nxt
            continue
        c = ready[0]
        future = [p["arrival"] for p in procs if p["arrival"] > t]
        end = t + rem[c["id"]]
        if future:
            end = min(end, min(future))
        last = steps[-1] if steps else None
        if last and last["type"] == "run" and last["pid"] == c["id"] and last["end"] == t:
            last["end"] = end  # same process keeps running: extend the block
        else:
            reason = _reason(algo, rule, c, ready, rem, True)
            if last and last["type"] == "run" and last["end"] == t and rem[last["pid"]] > 0:
                last["event"] = "preempted"
                last["outcome"] = f"{last['pid']} was pre-empted by {c['id']} with {rem[last['pid']]} unit(s) left."
                reason = f"{c['id']} pre-empts {last['pid']}. " + reason
            steps.append({"type": "run", "pid": c["id"], "start": t, "end": end,
                          "ready": _ready_view(ready, rem), "reason": reason})
        rem[c["id"]] -= end - t
        t = end
    return steps


def _round_robin(procs, quantum):
    order = sorted(procs, key=lambda p: (p["arrival"], p["idx"]))
    rem = {p["id"]: p["burst"] for p in procs}
    by_id = {p["id"]: p for p in procs}
    q, i, t, steps = deque(), 0, 0, []

    def admit(upto):
        nonlocal i
        while i < len(order) and order[i]["arrival"] <= upto:
            q.append(order[i]["id"])
            i += 1

    admit(0)
    while any(rem.values()):
        if not q:
            nxt = order[i]["arrival"]
            steps.append({"type": "idle", "pid": None, "start": t, "end": nxt, "ready": [], "queue_after": [],
                          "reason": f"The ready queue is empty, so the CPU is idle from t={t} to t={nxt}."})
            t = nxt
            admit(t)
            continue
        queue_before = list(q)
        pid = q.popleft()
        run = min(quantum, rem[pid])
        start = t
        t += run
        rem[pid] -= run
        admit(t)
        ready = [{"id": x, "remaining": rem[x] + (run if x == pid else 0), "priority": by_id[x]["priority"],
                  "arrival": by_id[x]["arrival"]} for x in queue_before]
        step = {"type": "run", "pid": pid, "start": start, "end": t, "ready": ready,
                "reason": f"{pid} is at the front of the ready queue [{', '.join(queue_before)}]. "
                          f"It runs for min(quantum {quantum}, remaining {rem[pid] + run}) = {run} unit(s)."}
        if rem[pid] > 0:
            q.append(pid)
            step["event"] = "preempted"
            step["outcome"] = (f"Quantum expired at t={t}: {pid} has {rem[pid]} left and moves to the back of the queue "
                               f"(behind anything that arrived by t={t}).")
        step["queue_after"] = list(q)
        steps.append(step)
    return steps


# ---------------------------------------------------------------- finalise + metrics
def _finalise(procs, steps):
    rem = {p["id"]: p["burst"] for p in procs}
    done = []
    for k, s in enumerate(steps):
        if s["pid"]:
            rem[s["pid"]] -= s["end"] - s["start"]
            if rem[s["pid"]] == 0:
                s["event"] = "completed"
                s["outcome"] = f"{s['pid']} completes at t={s['end']}."
                done.append(s["pid"])
            else:
                s.setdefault("event", "continues")
                s.setdefault("outcome", f"{s['pid']} still has {rem[s['pid']]} unit(s) left.")
        else:
            s["event"] = "idle"
            s["outcome"] = "CPU idle."
        s["remaining"] = dict(rem)
        s["done"] = list(done)
        s["step"] = k + 1
    return steps


def _metrics(procs, steps):
    first, comp = {}, {}
    busy, switches, last_pid = 0, 0, None
    for s in steps:
        if s["pid"]:
            first.setdefault(s["pid"], s["start"])
            busy += s["end"] - s["start"]
            if last_pid is not None and last_pid != s["pid"]:
                switches += 1
            last_pid = s["pid"]
            if s["event"] == "completed":
                comp[s["pid"]] = s["end"]
    rows = []
    for p in procs:
        ct = comp[p["id"]]
        tat = ct - p["arrival"]
        rows.append({"id": p["id"], "arrival": p["arrival"], "burst": p["burst"], "priority": p["priority"],
                     "first_start": first[p["id"]], "completion": ct, "turnaround": tat,
                     "waiting": tat - p["burst"], "response": first[p["id"]] - p["arrival"]})
    n = len(rows)
    total = max(comp.values()) if comp else 0
    avg = lambda k: r2(sum(r[k] for r in rows) / n) if n else 0.0
    return rows, {
        "avg_waiting": avg("waiting"), "avg_turnaround": avg("turnaround"), "avg_response": avg("response"),
        "cpu_utilization": r2(busy / total * 100) if total else 0.0,
        "throughput": round(n / total, 4) if total else 0.0,
        "total_time": total, "busy_time": busy, "idle_time": total - busy, "context_switches": switches,
    }


def simulate(inp, algo):
    procs, cfg = _validate(inp, algo)
    if algo == "rr":
        steps = _round_robin(procs, cfg["quantum"])
    elif cfg["preemptive"]:
        steps = _preemptive(procs, algo, cfg["rule"])
    else:
        steps = _non_preemptive(procs, algo, cfg["rule"])
    steps = _finalise(procs, steps)
    rows, metrics = _metrics(procs, steps)
    name = LABELS[algo]
    if cfg["preemptive"]:
        name = "Shortest Remaining Time First (preemptive SJF)" if algo == "sjf" else "Preemptive Priority Scheduling"
    return {"algorithm": algo, "label": name, "steps": steps, "processes": rows, "metrics": metrics,
            "config": cfg,
            "notes": ["Clock starts at t=0; total simulated time = last completion time.",
                      "Turnaround = Completion - Arrival; Waiting = Turnaround - Burst; Response = First start - Arrival."]}
