import pytest
from _core import files
from _core.common import ValidationError


def cfg(**kw):
    base = {"total_blocks": 16, "block_size": 512, "mode": "auto", "reserved": "", "files": []}
    base.update(kw)
    return base


def disk_states(step):
    return [d["state"] for d in step["disk"]]


def test_sequential_contiguous_and_skips_reserved():
    r = files.simulate(cfg(reserved="3", files=[{"name": "A", "size": 1024}, {"name": "B", "size": 2048}]), "sequential")
    a, b = r["files"]
    assert a["blocks"] == [0, 1] and b["blocks"] == [4, 5, 6, 7]
    assert r["metrics"]["total_consumed"] == 6 and r["metrics"]["meta_blocks"] == 0


def test_sequential_fails_on_fragmented_free_space_even_if_total_is_enough():
    r = files.simulate(cfg(total_blocks=8, reserved="1,3,5", files=[{"name": "A", "size": 1536}]), "sequential")
    f = r["files"][0]
    assert not f["ok"] and "largest contiguous free run is 2" in f["reason"] and "external fragmentation" in f["reason"]
    assert r["metrics"]["files_failed"] == 1


def test_full_disk():
    r = files.simulate(cfg(total_blocks=4, files=[{"name": "A", "size": 512 * 5}]), "linked")
    assert not r["files"][0]["ok"] and "Disk full" in r["files"][0]["reason"]


def test_small_file_occupies_one_block_and_wastes_the_rest():
    r = files.simulate(cfg(files=[{"name": "tiny", "size": 1}]), "sequential")
    f = r["files"][0]
    assert f["data_blocks"] == 1 and f["internal_waste"] == 511


def test_indexed_overhead_and_index_not_a_data_block():
    r = files.simulate(cfg(files=[{"name": "A", "size": 1000}]), "indexed")
    f = r["files"][0]
    assert f["index_block"] == 0 and f["blocks"] == [1, 2] and f["meta_blocks"] == 1
    assert f["total_blocks"] == 3 and f["overhead_pct"] == pytest.approx(33.33)
    assert f["index_block"] not in f["blocks"]
    assert r["steps"][0]["details"]["mapping"] == [{"entry": 0, "block": 1}, {"entry": 1, "block": 2}]
    assert f["direct_cost_last"] == 2 and f["seq_cost"] == 3


def test_indexed_single_index_block_capacity():
    r = files.simulate(cfg(block_size=8, total_blocks=32, files=[{"name": "A", "size": 24}]), "indexed")
    assert not r["files"][0]["ok"] and "index block" in r["files"][0]["reason"]


def test_linked_pointer_chain_and_usable_bytes():
    r = files.simulate(cfg(reserved="1", files=[{"name": "A", "size": 1017}]), "linked")
    f = r["files"][0]
    assert f["data_blocks"] == 3 and f["blocks"] == [0, 2, 3]  # 508 usable bytes per block
    disk = r["steps"][0]["disk"]
    assert [disk[b]["next"] for b in (0, 2, 3)] == [2, 3, None]
    assert f["direct_cost_last"] == 3 and f["pointer_bytes"] == 12
    trav = [s for s in r["steps"] if s["type"] == "traverse"]
    assert [t["block"] for t in trav] == [0, 2, 3] and "null" in trav[-1]["reason"]


def test_linked_boundary_1016_bytes_needs_two_blocks():
    r = files.simulate(cfg(files=[{"name": "A", "size": 1016}]), "linked")
    assert r["files"][0]["data_blocks"] == 2


def test_multiple_files_never_overlap():
    r = files.simulate(cfg(files=[{"name": "A", "size": 2000}, {"name": "B", "size": 2000}, {"name": "C", "size": 900}]), "linked")
    seen = []
    for f in r["files"]:
        seen += f["blocks"]
    assert len(seen) == len(set(seen))


def test_manual_conflict_is_refused_not_overwritten():
    f = [{"name": "A", "size": 1024, "start": 2}, {"name": "B", "size": 1024, "start": 3}]
    r = files.simulate(cfg(mode="manual", files=f), "sequential")
    assert r["files"][0]["ok"] and not r["files"][1]["ok"]
    assert r["steps"][1]["invalid"] == [3] and "already allocated" in r["files"][1]["reason"]


def test_manual_linked_and_indexed():
    r = files.simulate(cfg(mode="manual", files=[{"name": "A", "size": 1000, "blocks": "9, 2"}]), "linked")
    assert r["files"][0]["blocks"] == [9, 2] and r["steps"][0]["disk"][9]["next"] == 2
    r = files.simulate(cfg(mode="manual", files=[{"name": "A", "size": 1000, "start": 5, "blocks": "1,2"}]), "indexed")
    assert r["files"][0]["index_block"] == 5


@pytest.mark.parametrize("method,f", [
    ("sequential", {"name": "A", "size": 2048, "start": 14}),          # runs off the disk
    ("sequential", {"name": "A", "size": 2048, "start": 99}),          # out of range
    ("linked", {"name": "A", "size": 1000, "blocks": "1"}),            # wrong count
    ("linked", {"name": "A", "size": 1000, "blocks": "1,1"}),          # duplicate
    ("indexed", {"name": "A", "size": 1000, "start": 1, "blocks": "1,2"}),  # index == data
])
def test_manual_invalid_assignments_raise(method, f):
    with pytest.raises(ValidationError):
        files.simulate(cfg(mode="manual", files=[f]), method)


@pytest.mark.parametrize("kw", [
    {"files": []}, {"total_blocks": 2}, {"block_size": "x"},
    {"files": [{"name": "A", "size": 0}]}, {"files": [{"name": "", "size": 5}]},
    {"files": [{"name": "A", "size": 5}, {"name": "A", "size": 5}]}, {"reserved": "99"},
])
def test_validation(kw):
    with pytest.raises(ValidationError):
        files.simulate(cfg(**{"files": [{"name": "A", "size": 5}], **kw}), "sequential")
