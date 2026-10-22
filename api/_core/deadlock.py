"""Deadlock avoidance (Banker's Algorithm) and deadlock detection (multi-instance).

Avoidance asks: "if I grant this, is there still an order in which everyone can finish?"
Detection asks:  "given what is held and requested right now, who can never finish?"
An unsafe state is NOT the same thing as a deadlock; a deadlock is a stuck state that exists now.
"""
from .common import ValidationError, to_int

LABELS = {"banker": "Deadlock Avoidance (Banker's Algorithm)", "detection": "Deadlock Detection"}
MAX_P, MAX_R = 10, 6


def _matrix(raw, name, n, m, errors, minimum=0):
    if not isinstance(raw, list) or len(raw) != n:
        errors.append(f"{name} matrix must have {n} row(s), one per process.")
        return None
    out = []
    for i, row in enumerate(raw):
        if not isinstance(row, list) or len(row) != m:
            errors.append(f"{name} row P{i} must have {m} value(s), one per resource type.")
            return None
        vals = [to_int(v, f"{name}[P{i}][{chr(65 + j)}]", errors, minimum) for j, v in enumerate(row)]
        out.append(vals)
    return out


def _parse(inp, algo):
    errors = []
    total_raw = inp.get("total")
    if not isinstance(total_raw, list) or not total_raw:
        raise ValidationError("Define the total instances of at least one resource type.")
    m = len(total_raw)
    alloc_raw = inp.get("allocation")
    if not isinstance(alloc_raw, list) or not alloc_raw:
        raise ValidationError("Define at least one process.")
    n = len(alloc_raw)
    if n > MAX_P or m > MAX_R:
        raise ValidationError(f"At most {MAX_P} processes and {MAX_R} resource types are supported.")
    total = [to_int(v, f"Total instances of {chr(65 + j)}", errors, 0) for j, v in enumerate(total_raw)]
    alloc = _matrix(alloc_raw, "Allocation", n, m, errors)
    # Detection reads "request_matrix" (falls back to "request") so one payload can serve both algorithms.
    req_raw = inp.get("request_matrix") if inp.get("request_matrix") is not None else inp.get("request")
    second = _matrix(inp.get("maximum") if algo == "banker" else req_raw,
                     "Maximum" if algo == "banker" else "Request", n, m, errors)
    if errors:
        raise ValidationError(errors)
    for j in range(m):
        s = sum(alloc[i][j] for i in range(n))
        if s > total[j]:
            errors.append(f"Allocation exceeds the total instances of resource {chr(65 + j)}: allocated {s}, total {total[j]}.")
    if algo == "banker":
        for i in range(n):
            for j in range(m):
                if second[i][j] < alloc[i][j]:
                    errors.append(f"Maximum[P{i}][{chr(65 + j)}] = {second[i][j]} is less than its current allocation {alloc[i][j]}.")
                if second[i][j] > total[j]:
                    errors.append(f"Maximum[P{i}][{chr(65 + j)}] = {second[i][j]} exceeds the total instances ({total[j]}); the process could never be guaranteed to finish.")
    if errors:
        raise ValidationError(errors)
    return n, m, total, alloc, second


def _fmt(v):
    return "[" + ", ".join(map(str, v)) + "]"


def _sweep(alloc, demand, work, finish, pname, rname, avoid):
    """Repeatedly pick the first unfinished process whose demand <= work. Shared by both algorithms."""
    n, m = len(alloc), len(work)
    steps, seq = [], []
    word = "Need" if avoid else "Request"
    while not all(finish):
        cands = [i for i in range(n) if not finish[i] and all(demand[i][j] <= work[j] for j in range(m))]
        blocked = [{"process": i, "lacking": [j for j in range(m) if demand[i][j] > work[j]]}
                   for i in range(n) if not finish[i] and i not in cands]
        if not cands:
            break
        i = cands[0]
        before = work[:]
        work = [w + a for w, a in zip(work, alloc[i])]
        finish[i] = True
        seq.append(i)
        steps.append({"type": "select", "work_before": before, "candidates": cands, "selected": i,
                      "work_after": work[:], "finish": finish[:], "sequence": seq[:], "blocked": blocked,
                      "reason": f"{pname(i)}: {word} {_fmt(demand[i])} <= Work {_fmt(before)}. It can run to completion and "
                                f"release {_fmt(alloc[i])}, so Work becomes {_fmt(work)}."
                                + (f" Other eligible: {', '.join(pname(c) for c in cands[1:])} (first in index order is chosen)." if len(cands) > 1 else "")})
    return steps, seq, work, finish


def _stuck_reason(alloc, demand, work, finish, pname, rname, word):
    parts = []
    for i in range(len(alloc)):
        if not finish[i]:
            lack = [f"{rname(j)} (needs {demand[i][j]}, Work has {work[j]})" for j in range(len(work)) if demand[i][j] > work[j]]
            parts.append(f"{pname(i)} lacks {', '.join(lack)}")
    return "; ".join(parts)


def _avoidance_trace(alloc, need, avail, phase, pname, rname):
    n = len(alloc)
    finish = [False] * n
    state = {"allocation": [r[:] for r in alloc], "need": [r[:] for r in need], "available": avail[:]}
    steps = [{"type": "init", "phase": phase, "work": avail[:], "finish": finish[:], "sequence": [], "state": state,
              "reason": f"Work = Available = {_fmt(avail)}. Finish = all false. Need = Maximum - Allocation."}]
    body, seq, work, finish = _sweep(alloc, need, avail[:], finish, pname, rname, True)
    for s in body:
        s["phase"], s["state"] = phase, state
    steps += body
    safe = all(finish)
    if safe:
        final = {"type": "safe", "reason": f"Every process could finish: safe sequence <{', '.join(pname(i) for i in seq)}>. The state is SAFE."}
    else:
        final = {"type": "unsafe", "reason": "No unfinished process has Need <= Work: " + _stuck_reason(alloc, need, work, finish, pname, rname, "Need")
                 + ". No safe sequence exists, so the state is UNSAFE (this is not necessarily a deadlock yet)."}
    final.update({"phase": phase, "work": work[:], "finish": finish[:], "sequence": seq[:], "state": state})
    steps.append(final)
    return steps, safe, seq


def simulate(inp, algo):
    if algo not in LABELS:
        raise ValidationError(f"Unknown deadlock algorithm '{algo}'.")
    n, m, total, alloc, second = _parse(inp, algo)
    pname = lambda i: f"P{i}"
    rname = lambda j: chr(65 + j)
    avail = [total[j] - sum(alloc[i][j] for i in range(n)) for j in range(m)]
    base = {"algorithm": algo, "label": LABELS[algo], "processes": [pname(i) for i in range(n)],
            "resources": [rname(j) for j in range(m)], "total": total, "allocation": alloc, "available": avail}
    util = [round(sum(alloc[i][j] for i in range(n)) / total[j] * 100, 2) if total[j] else 0.0 for j in range(m)]
    common = {"processes": n, "resource_types": m, "total_instances": sum(total), "available": avail,
              "utilization_per_resource": util,
              "overall_utilization": round(sum(sum(r) for r in alloc) / sum(total) * 100, 2) if sum(total) else 0.0}

    if algo == "detection":
        finish = [all(a == 0 for a in alloc[i]) for i in range(n)]
        steps = [{"type": "init", "phase": "initial", "work": avail[:], "finish": finish[:], "sequence": [],
                  "reason": f"Work = Available = {_fmt(avail)}. Finish[i] = true when a process holds nothing "
                            f"({', '.join(pname(i) for i in range(n) if finish[i]) or 'none here'}); a process holding no resources cannot be part of a deadlock."}]
        body, seq, work, finish = _sweep(alloc, second, avail[:], finish, pname, rname, False)
        for s in body:
            s["phase"] = "initial"
        steps += body
        stuck = [i for i in range(n) if not finish[i]]
        if stuck:
            final = {"type": "deadlock", "reason": f"{', '.join(pname(i) for i in stuck)} cannot finish: "
                     + _stuck_reason(alloc, second, work, finish, pname, rname, "Request")
                     + ". Under the model's assumptions they are candidates for the deadlocked set (final Work "
                       f"{_fmt(work)})."}
        else:
            final = {"type": "no_deadlock", "reason": f"Every process can finish (order <{', '.join(pname(i) for i in seq)}>). No deadlock detected."}
        final.update({"phase": "initial", "work": work[:], "finish": finish[:], "sequence": seq[:]})
        steps.append(final)
        for s in steps:
            s["state"] = {"allocation": alloc, "request": second, "available": avail}
        metrics = dict(common, state="Deadlock detected" if stuck else "No deadlock",
                       unfinished=[pname(i) for i in stuck], completion_order=[pname(i) for i in seq],
                       final_work=work)
        return dict(base, demand=second, steps=steps, metrics=metrics, deadlocked=[pname(i) for i in stuck],
                    notes=["Detection inspects an existing state: processes left unfinished are unable to complete "
                           "under the modelled conditions (candidates for the deadlocked set)."])

    # ---- Banker's algorithm
    need = [[second[i][j] - alloc[i][j] for j in range(m)] for i in range(n)]
    steps, safe, seq = _avoidance_trace(alloc, need, avail, "initial", pname, rname)
    request = None
    req_in = inp.get("request")
    if isinstance(req_in, dict) and req_in.get("vector") not in (None, [], ""):
        errors = []
        pi = to_int(req_in.get("process"), "Request process", errors, 0, n - 1)
        vec = [to_int(v, f"Request[{rname(j)}]", errors, 0) for j, v in enumerate(req_in.get("vector") or [])]
        if not errors and len(vec) != m:
            errors.append(f"Request vector must have {m} value(s).")
        if errors:
            raise ValidationError(errors)
        request = {"process": pi, "vector": vec, "approved": False}
        p = pname(pi)
        over_need = [j for j in range(m) if vec[j] > need[pi][j]]
        over_av = [j for j in range(m) if vec[j] > avail[j]]
        head = {"type": "request", "phase": "request", "work": avail[:], "finish": [False] * n, "sequence": [],
                "state": {"allocation": alloc, "need": need, "available": avail}}
        if over_need:
            request.update(stage="exceeds_need", explanation=(
                f"Rejected: {p} asks for more than its declared remaining need ("
                + ", ".join(f"{rname(j)}: asks {vec[j]}, need {need[pi][j]}" for j in over_need)
                + "). A process may not exceed its maximum claim."))
            steps.append(dict(head, reason=request["explanation"]))
        elif over_av:
            request.update(stage="exceeds_available", explanation=(
                f"{p} must wait: the request is not available right now ("
                + ", ".join(f"{rname(j)}: asks {vec[j]}, available {avail[j]}" for j in over_av) + ")."))
            steps.append(dict(head, reason=request["explanation"]))
        else:
            a2 = [r[:] for r in alloc]
            n2 = [r[:] for r in need]
            av2 = avail[:]
            for j in range(m):
                a2[pi][j] += vec[j]
                n2[pi][j] -= vec[j]
                av2[j] -= vec[j]
            steps.append(dict(head, reason=f"Request {_fmt(vec)} from {p} is within its Need and the Available vector. "
                                            f"Tentatively grant it: Available {_fmt(avail)} -> {_fmt(av2)}, then re-run the safety check.",
                              state={"allocation": a2, "need": n2, "available": av2}))
            t_steps, t_safe, t_seq = _avoidance_trace(a2, n2, av2, "request", pname, rname)
            steps += t_steps
            if t_safe:
                request.update(stage="granted", approved=True, new_state={"allocation": a2, "need": n2, "available": av2},
                               safe_sequence=[pname(i) for i in t_seq],
                               explanation=f"Approved: after granting, the state is still safe via <{', '.join(pname(i) for i in t_seq)}>.")
            else:
                request.update(stage="unsafe", explanation=(
                    f"Rejected: granting {_fmt(vec)} to {p} would leave the system in an UNSAFE state, so the request is "
                    f"rolled back and {p} must wait."))
            steps.append({"type": "decision", "phase": "request", "work": av2[:], "finish": t_steps[-1]["finish"],
                          "sequence": t_steps[-1]["sequence"], "state": t_steps[-1]["state"],
                          "reason": request["explanation"]})
    for k, s in enumerate(steps):
        s["step"] = k + 1
    metrics = dict(common, state="Safe" if safe else "Unsafe", safe_sequence=[pname(i) for i in seq] if safe else [])
    return dict(base, maximum=second, need=need, demand=need, steps=steps, metrics=metrics, request=request, safe=safe,
                notes=["Avoidance checks whether a proposed allocation keeps the system safe. "
                       "An unsafe state may lead to deadlock; it is not itself a deadlock."])
