"""Dispatch layer: JSON payload in, JSON-serialisable dict out. Pure Python, no HTTP."""
from .common import ValidationError
from . import cpu, memory, files, deadlock, paging

MODULES = {"cpu": cpu, "memory": memory, "files": files, "deadlock": deadlock, "paging": paging}


def _number_steps(result):
    for k, s in enumerate(result.get("steps", []) or []):
        s.setdefault("step", k + 1)
    return result


def dispatch(payload):
    """payload = {module, algorithm | algorithms[], input}. Never raises."""
    try:
        if not isinstance(payload, dict):
            raise ValidationError("Request body must be a JSON object.")
        mod = MODULES.get(payload.get("module"))
        if mod is None:
            raise ValidationError(f"Unknown module '{payload.get('module')}'.")
        inp = payload.get("input")
        if not isinstance(inp, dict):
            raise ValidationError("Missing 'input' object.")
        if isinstance(payload.get("algorithms"), list):
            results = {a: _number_steps(mod.simulate(inp, a)) for a in payload["algorithms"]}
            return {"ok": True, "results": results}
        return {"ok": True, "result": _number_steps(mod.simulate(inp, payload.get("algorithm")))}
    except ValidationError as e:
        return {"ok": False, "errors": e.errors}
    except Exception as e:  # pragma: no cover - defensive: never crash the function
        return {"ok": False, "errors": [f"Unexpected error while simulating: {type(e).__name__}: {e}"]}
