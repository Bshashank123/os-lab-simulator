import pytest
from _core import deadlock
from _core.common import ValidationError

TOTAL = [10, 5, 7]
ALLOC = [[0, 1, 0], [2, 0, 0], [3, 0, 2], [2, 1, 1], [0, 0, 2]]
MAX = [[7, 5, 3], [3, 2, 2], [9, 0, 2], [2, 2, 2], [4, 3, 3]]


def bank(**kw):
    d = {"total": TOTAL, "allocation": ALLOC, "maximum": MAX}
    d.update(kw)
    return d


def is_valid_safe_sequence(res):
    work = list(res["available"])
    for name in res["metrics"]["safe_sequence"]:
        i = int(name[1:])
        assert all(res["need"][i][j] <= work[j] for j in range(len(work)))
        work = [w + a for w, a in zip(work, res["allocation"][i])]
    return True


def test_safe_state_and_matrices():
    r = deadlock.simulate(bank(), "banker")
    assert r["available"] == [3, 3, 2]
    assert r["need"][0] == [7, 4, 3] and r["need"][1] == [1, 2, 2]
    assert r["safe"] and len(r["metrics"]["safe_sequence"]) == 5 and is_valid_safe_sequence(r)
    assert r["steps"][-1]["type"] == "safe" and r["steps"][0]["type"] == "init"


def test_unsafe_state():
    r = deadlock.simulate({"total": [3], "allocation": [[1], [1]], "maximum": [[3], [3]]}, "banker")
    assert not r["safe"] and r["metrics"]["state"] == "Unsafe" and r["steps"][-1]["type"] == "unsafe"
    assert "not necessarily a deadlock" in r["steps"][-1]["reason"]


def test_request_granted():
    r = deadlock.simulate(bank(request={"process": 1, "vector": [1, 0, 2]}), "banker")
    assert r["request"]["approved"] and r["request"]["stage"] == "granted"
    assert r["request"]["new_state"]["available"] == [2, 3, 0]
    assert r["steps"][-1]["type"] == "decision"


def test_request_rejected_because_unsafe():
    # Textbook state after P1's (1,0,2) request was granted: Available = (2,3,0).
    after = [[0, 1, 0], [3, 0, 2], [3, 0, 2], [2, 1, 1], [0, 0, 2]]
    r = deadlock.simulate(bank(allocation=after, request={"process": 0, "vector": [0, 2, 0]}), "banker")
    assert r["available"] == [2, 3, 0]
    assert not r["request"]["approved"] and r["request"]["stage"] == "unsafe"
    assert "UNSAFE" in r["request"]["explanation"]


def test_request_exceeds_need_never_approved():
    r = deadlock.simulate(bank(request={"process": 1, "vector": [4, 0, 0]}), "banker")
    assert not r["request"]["approved"] and r["request"]["stage"] == "exceeds_need"


def test_request_exceeds_available_must_wait():
    r = deadlock.simulate(bank(request={"process": 4, "vector": [4, 0, 0]}), "banker")
    assert not r["request"]["approved"] and r["request"]["stage"] in ("exceeds_available", "exceeds_need")
    r = deadlock.simulate(bank(request={"process": 0, "vector": [4, 0, 0]}), "banker")
    assert r["request"]["stage"] == "exceeds_available" and "wait" in r["request"]["explanation"]


DT = [7, 2, 6]
DA = [[0, 1, 0], [2, 0, 0], [3, 0, 3], [2, 1, 1], [0, 0, 2]]
DR = [[0, 0, 0], [2, 0, 2], [0, 0, 0], [1, 0, 0], [0, 0, 2]]


def test_detection_no_deadlock():
    r = deadlock.simulate({"total": DT, "allocation": DA, "request": DR}, "detection")
    assert r["available"] == [0, 0, 0] and r["deadlocked"] == [] and r["metrics"]["state"] == "No deadlock"
    assert r["steps"][-1]["type"] == "no_deadlock"


def test_detection_finds_unfinished_processes():
    req = [row[:] for row in DR]
    req[2] = [0, 0, 1]
    r = deadlock.simulate({"total": DT, "allocation": DA, "request": req}, "detection")
    assert r["deadlocked"] == ["P1", "P2", "P3", "P4"] and r["metrics"]["completion_order"] == ["P0"]
    assert r["steps"][-1]["type"] == "deadlock" and r["steps"][-1]["finish"] == [True, False, False, False, False]


def test_detection_process_with_no_allocation_is_not_deadlocked():
    r = deadlock.simulate({"total": [1], "allocation": [[1], [0]], "request": [[1], [1]]}, "detection")
    assert r["deadlocked"] == ["P0"]  # P0 waits on itself... but P1 holds nothing so is never listed
    assert r["steps"][0]["finish"] == [False, True]


def test_multiple_instances_resource_chain():
    r = deadlock.simulate({"total": [4], "allocation": [[2], [1]], "maximum": [[3], [4]]}, "banker")
    assert r["safe"] and r["metrics"]["safe_sequence"] == ["P0", "P1"]
    # Same totals but nothing available and everyone still needs more: unsafe.
    r = deadlock.simulate({"total": [4], "allocation": [[1], [3]], "maximum": [[3], [4]]}, "banker")
    assert not r["safe"]


@pytest.mark.parametrize("inp,msg", [
    ({"total": [2], "allocation": [[3]], "maximum": [[3]]}, "exceeds the total"),
    ({"total": [5], "allocation": [[3]], "maximum": [[2]]}, "less than its current allocation"),
    ({"total": [5], "allocation": [[1]], "maximum": [[9]]}, "exceeds the total instances"),
    ({"total": [5, 5], "allocation": [[1]], "maximum": [[1, 1]]}, "must have 2"),
    ({"total": [5], "allocation": [[-1]], "maximum": [[1]]}, "at least 0"),
    ({"total": [5], "allocation": [[1.5]], "maximum": [[2]]}, "not a valid whole number"),
    ({"total": [], "allocation": [[1]], "maximum": [[1]]}, "total instances"),
])
def test_invalid_matrices(inp, msg):
    with pytest.raises(ValidationError) as e:
        deadlock.simulate(inp, "banker")
    assert any(msg in m for m in e.value.errors)


def test_one_payload_serves_both_algorithms():
    payload = {"total": DT, "allocation": DA, "maximum": [[a + r for a, r in zip(x, y)] for x, y in zip(DA, DR)],
               "request_matrix": DR, "request": {"process": 0, "vector": []}}
    assert deadlock.simulate(payload, "detection")["deadlocked"] == []
    assert deadlock.simulate(payload, "banker")["request"] is None
