import pytest
from _core import cpu, dispatch
from _core.common import ValidationError

BASE = [
    {"id": "P1", "arrival": 0, "burst": 5, "priority": 2},
    {"id": "P2", "arrival": 1, "burst": 3, "priority": 1},
    {"id": "P3", "arrival": 2, "burst": 8, "priority": 4},
    {"id": "P4", "arrival": 3, "burst": 6, "priority": 3},
]


def order(res):
    return [(s["pid"], s["start"], s["end"]) for s in res["steps"]]


def row(res, pid):
    return next(r for r in res["processes"] if r["id"] == pid)


def test_fcfs_different_arrivals_and_metrics():
    r = cpu.simulate({"processes": BASE}, "fcfs")
    assert order(r) == [("P1", 0, 5), ("P2", 5, 8), ("P3", 8, 16), ("P4", 16, 22)]
    assert [row(r, p)["waiting"] for p in ("P1", "P2", "P3", "P4")] == [0, 4, 6, 13]
    assert r["metrics"]["avg_waiting"] == 5.75
    assert r["metrics"]["avg_turnaround"] == 11.25
    assert r["metrics"]["cpu_utilization"] == 100.0


def test_fcfs_same_arrival_uses_input_order():
    procs = [{"id": "B", "arrival": 0, "burst": 2}, {"id": "A", "arrival": 0, "burst": 1}]
    assert [s["pid"] for s in cpu.simulate({"processes": procs}, "fcfs")["steps"]] == ["B", "A"]


def test_idle_period_and_utilisation():
    r = cpu.simulate({"processes": [{"id": "P1", "arrival": 3, "burst": 2}]}, "fcfs")
    assert order(r) == [(None, 0, 3), ("P1", 3, 5)]
    assert r["metrics"]["cpu_utilization"] == 40.0 and r["metrics"]["idle_time"] == 3
    assert r["metrics"]["throughput"] == 0.2


def test_idle_gap_between_processes():
    procs = [{"id": "P1", "arrival": 0, "burst": 2}, {"id": "P2", "arrival": 5, "burst": 1}]
    r = cpu.simulate({"processes": procs}, "sjf")
    assert order(r) == [("P1", 0, 2), (None, 2, 5), ("P2", 5, 6)]


def test_sjf_non_preemptive_choice():
    r = cpu.simulate({"processes": BASE}, "sjf")
    assert [s["pid"] for s in r["steps"]] == ["P1", "P2", "P4", "P3"]
    assert r["metrics"]["avg_waiting"] == 5.25
    assert "shortest burst" in r["steps"][1]["reason"]


def test_sjf_equal_burst_tie_breaks_on_arrival_then_id():
    procs = [{"id": "P1", "arrival": 0, "burst": 4}, {"id": "P3", "arrival": 1, "burst": 2},
             {"id": "P2", "arrival": 1, "burst": 2}]
    r = cpu.simulate({"processes": procs}, "sjf")
    assert [s["pid"] for s in r["steps"]] == ["P1", "P2", "P3"]
    assert "Tie" in r["steps"][1]["reason"]


def test_srtf_preempts():
    procs = [{"id": "P1", "arrival": 0, "burst": 8}, {"id": "P2", "arrival": 1, "burst": 2}]
    r = cpu.simulate({"processes": procs, "preemptive": True}, "sjf")
    assert order(r) == [("P1", 0, 1), ("P2", 1, 3), ("P1", 3, 10)]
    assert r["steps"][0]["event"] == "preempted"


@pytest.mark.parametrize("rule,first", [("lower", "P1"), ("higher", "P2")])
def test_priority_convention(rule, first):
    procs = [{"id": "P1", "arrival": 0, "burst": 3, "priority": 1}, {"id": "P2", "arrival": 0, "burst": 3, "priority": 2}]
    r = cpu.simulate({"processes": procs, "priority_rule": rule}, "priority")
    assert r["steps"][0]["pid"] == first


def test_priority_equal_priority_arrival_then_id():
    procs = [{"id": "P2", "arrival": 0, "burst": 1, "priority": 1}, {"id": "P1", "arrival": 0, "burst": 1, "priority": 1}]
    r = cpu.simulate({"processes": procs}, "priority")
    assert [s["pid"] for s in r["steps"]] == ["P1", "P2"]


def test_round_robin_event_order_and_metrics():
    procs = [{"id": "P1", "arrival": 0, "burst": 5}, {"id": "P2", "arrival": 1, "burst": 3}]
    r = cpu.simulate({"processes": procs, "quantum": 2}, "rr")
    assert order(r) == [("P1", 0, 2), ("P2", 2, 4), ("P1", 4, 6), ("P2", 6, 7), ("P1", 7, 8)]
    assert row(r, "P1")["completion"] == 8 and row(r, "P2")["completion"] == 7
    assert row(r, "P2")["response"] == 1


def test_round_robin_arrival_at_quantum_end_queued_before_preempted():
    procs = [{"id": "A", "arrival": 0, "burst": 4}, {"id": "B", "arrival": 2, "burst": 2}]
    r = cpu.simulate({"processes": procs, "quantum": 2}, "rr")
    assert [s["pid"] for s in r["steps"]] == ["A", "B", "A"]


@pytest.mark.parametrize("q", [1, 2, 3, 100])
def test_round_robin_total_run_time_equals_bursts(q):
    r = cpu.simulate({"processes": BASE, "quantum": q}, "rr")
    assert sum(s["end"] - s["start"] for s in r["steps"] if s["pid"]) == 22
    assert all(row(r, p["id"])["turnaround"] - p["burst"] == row(r, p["id"])["waiting"] for p in BASE)


def test_rr_idle_when_queue_empty():
    procs = [{"id": "P1", "arrival": 0, "burst": 1}, {"id": "P2", "arrival": 4, "burst": 1}]
    r = cpu.simulate({"processes": procs, "quantum": 3}, "rr")
    assert order(r) == [("P1", 0, 1), (None, 1, 4), ("P2", 4, 5)]


@pytest.mark.parametrize("procs,quantum,msg", [
    ([], 2, "at least one"),
    ([{"id": "P1", "arrival": -1, "burst": 2}], 2, "at least 0"),
    ([{"id": "P1", "arrival": 0, "burst": 0}], 2, "at least 1"),
    ([{"id": "P1", "arrival": 0, "burst": "x"}], 2, "not a valid whole number"),
    ([{"id": "P1", "arrival": 0, "burst": 1}, {"id": "P1", "arrival": 0, "burst": 1}], 2, "duplicate"),
    ([{"id": "P1", "arrival": 0, "burst": 1}], 0, "Time quantum"),
    ([{"id": "P1", "arrival": 0, "burst": 1}], "", "Time quantum"),
])
def test_validation(procs, quantum, msg):
    with pytest.raises(ValidationError) as e:
        cpu.simulate({"processes": procs, "quantum": quantum}, "rr")
    assert any(msg in m for m in e.value.errors)


def test_priority_must_be_integer_only_for_priority_algorithm():
    procs = [{"id": "P1", "arrival": 0, "burst": 1, "priority": "high"}]
    assert cpu.simulate({"processes": procs}, "fcfs")["metrics"]["avg_waiting"] == 0
    with pytest.raises(ValidationError):
        cpu.simulate({"processes": procs}, "priority")


def test_dispatch_never_raises_and_compare_same_input():
    out = dispatch({"module": "cpu", "algorithms": ["fcfs", "sjf", "rr"], "input": {"processes": BASE, "quantum": 3}})
    assert out["ok"] and set(out["results"]) == {"fcfs", "sjf", "rr"}
    assert dispatch({"module": "cpu", "algorithm": "fcfs", "input": {}})["ok"] is False
    assert dispatch("junk")["ok"] is False
