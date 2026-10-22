import pytest
from _core import paging, dispatch
from _core.common import ValidationError

CLASSIC = "7,0,1,2,0,3,0,4,2,3,0,3,2,1,2,0,1,7,0,1"


def run(refs, frames, algo):
    return paging.simulate({"reference_string": refs, "frames": frames}, algo)


@pytest.mark.parametrize("algo,faults", [("fifo", 15), ("lru", 12), ("optimal", 9)])
def test_classic_textbook_counts(algo, faults):
    r = run(CLASSIC, 3, algo)
    m = r["metrics"]
    assert m["page_faults"] == faults and m["page_hits"] + m["page_faults"] == m["total_references"] == 20
    assert m["fault_rate"] == round(faults / 20 * 100, 2)


def test_empty_frames_fill_first_without_eviction():
    r = run("1 2 3", 3, "fifo")
    assert [s["evicted"] for s in r["steps"]] == [None, None, None]
    assert r["steps"][2]["frames"] == [1, 2, 3]


def test_single_frame_and_repeats():
    r = run("1 1 2 2 1", 1, "lru")
    assert [s["hit"] for s in r["steps"]] == [False, True, False, True, False]


def test_page_zero_supported():
    assert run("0 0 0", 2, "fifo")["metrics"]["page_faults"] == 1


def test_fifo_ignores_hits_but_lru_does_not():
    f = run("1 2 1 3", 2, "fifo")["steps"][-1]
    l = run("1 2 1 3", 2, "lru")["steps"][-1]
    assert f["evicted"] == 1 and l["evicted"] == 2
    assert "least" not in f["explanation"] and "not used for the longest" in l["explanation"]


def test_optimal_prefers_page_never_used_again_and_explains_future():
    r = run("1 2 3 1 2", 2, "optimal")
    s = r["steps"][2]
    assert s["evicted"] == 2 and all(c["value"] is not None for c in s["candidates"])
    r = run("1 2 3 2 2", 2, "optimal")
    s = r["steps"][2]
    assert s["evicted"] == 1 and "never used again" in s["explanation"]


def test_optimal_tie_never_used_again_picks_earliest_loaded():
    s = run("1 2 3", 2, "optimal")["steps"][2]
    assert s["evicted"] == 1


def test_lru_and_fifo_can_tie_and_optimal_can_equal_lru():
    refs = "1 2 3"
    assert run(refs, 3, "fifo")["metrics"]["page_faults"] == run(refs, 3, "lru")["metrics"]["page_faults"] == 3
    assert run("1 2 1 2", 2, "optimal")["metrics"]["page_faults"] == run("1 2 1 2", 2, "lru")["metrics"]["page_faults"]


def test_belady_anomaly():
    b = paging.simulate({"reference_string": paging.BELADY_DEFAULT, "max_frames": 5}, "belady")
    by = {r["frames"]: r["fifo"] for r in b["rows"]}
    assert by[3] == 9 and by[4] == 10
    assert any(a["from_frames"] == 3 and a["to_frames"] == 4 for a in b["anomalies"])
    assert all(r["lru"] <= by_prev for r, by_prev in zip(b["rows"][1:], [x["lru"] for x in b["rows"][:-1]]))  # LRU never regresses here


def test_separators_and_victim_slot_stability():
    a = run("1, 2  3,4", 2, "fifo")
    assert a["references"] == [1, 2, 3, 4]
    assert a["steps"][2]["slot"] == 0 and a["steps"][3]["slot"] == 1


@pytest.mark.parametrize("refs,frames,msg", [
    ("", 3, "empty"), ("   ", 3, "empty"), ("1, a, 2", 3, "'a'"), ("1, -2", 3, "at least 0"),
    ("1 2.5", 3, "valid whole"), ("1 2", 0, "at least 1"), ("1 2", "x", "valid whole"), ("1 2", 99, "at most"),
])
def test_validation(refs, frames, msg):
    with pytest.raises(ValidationError) as e:
        run(refs, frames, "fifo")
    assert any(msg in m for m in e.value.errors)


def test_dispatch_compare_same_workload():
    out = dispatch({"module": "paging", "algorithms": ["fifo", "optimal", "lru"],
                    "input": {"reference_string": CLASSIC, "frames": 3}})
    assert [out["results"][a]["metrics"]["page_faults"] for a in ("fifo", "optimal", "lru")] == [15, 9, 12]
