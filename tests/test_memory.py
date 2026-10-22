import pytest
from _core import memory
from _core.common import ValidationError

BLOCKS = [{"id": f"B{i}", "size": s} for i, s in enumerate([100, 500, 200, 300, 600], 1)]
PROCS = [{"id": f"P{i}", "size": s} for i, s in enumerate([212, 417, 112, 426], 1)]


def placed(r):
    return {x["process"]: x["block"] for x in r["rows"]}


def test_first_fit():
    r = memory.simulate({"blocks": BLOCKS, "processes": PROCS}, "first")
    assert placed(r) == {"P1": "B2", "P2": "B5", "P3": "B3", "P4": None}


def test_best_fit():
    r = memory.simulate({"blocks": BLOCKS, "processes": PROCS}, "best")
    assert placed(r) == {"P1": "B4", "P2": "B2", "P3": "B3", "P4": "B5"}
    assert r["metrics"]["internal_fragmentation"] == (300 - 212) + (500 - 417) + (200 - 112) + (600 - 426)
    assert r["metrics"]["success_rate"] == 100.0


def test_worst_fit_and_metrics():
    r = memory.simulate({"blocks": BLOCKS, "processes": PROCS}, "worst")
    assert placed(r) == {"P1": "B5", "P2": "B2", "P3": "B4", "P4": None}
    m = r["metrics"]
    assert m["allocated"] == 3 and m["unallocated"] == 1 and m["success_rate"] == 75.0
    assert m["unused_in_free_blocks"] == 100 + 200
    assert m["total_capacity"] == 1700 and m["total_requested"] == 1167


def test_block_not_reused():
    r = memory.simulate({"blocks": [{"id": "A", "size": 50}], "processes": [{"id": "P1", "size": 10}, {"id": "P2", "size": 10}]}, "best")
    assert placed(r) == {"P1": "A", "P2": None}
    assert "already assigned" in r["steps"][1]["reason"]


def test_exact_fit_and_tie_goes_to_first_block():
    blocks = [{"id": "A", "size": 10}, {"id": "B", "size": 10}]
    r = memory.simulate({"blocks": blocks, "processes": [{"id": "P", "size": 10}]}, "best")
    assert placed(r) == {"P": "A"} and r["rows"][0]["fragmentation"] == 0


def test_request_exceeds_every_block():
    r = memory.simulate({"blocks": BLOCKS, "processes": [{"id": "X", "size": 9999}]}, "first")
    assert placed(r) == {"X": None} and "exceeds the largest block" in r["steps"][0]["reason"]


def test_first_fit_skips_after_selection():
    r = memory.simulate({"blocks": BLOCKS, "processes": PROCS[:1]}, "first")
    st = [e["status"] for e in r["steps"][0]["examined"]]
    assert st == ["too_small", "selected", "skipped", "skipped", "skipped"]


@pytest.mark.parametrize("inp", [
    {"blocks": [], "processes": PROCS},
    {"blocks": BLOCKS, "processes": []},
    {"blocks": [{"id": "A", "size": -5}], "processes": PROCS},
    {"blocks": [{"id": "A", "size": 5}, {"id": "A", "size": 5}], "processes": PROCS},
])
def test_validation(inp):
    with pytest.raises(ValidationError):
        memory.simulate(inp, "first")
