"""Shared helpers: strict integer parsing and a ValidationError type.

Nothing in this package imports HTTP, DOM or timer code. Every algorithm is a pure
function: validated input in, immutable-style trace (plain dicts/lists) out.
"""
import re


class ValidationError(Exception):
    """Raised with one or more user-facing messages. Values are never silently fixed."""

    def __init__(self, errors):
        self.errors = errors if isinstance(errors, list) else [errors]
        super().__init__("; ".join(self.errors))


_INT = re.compile(r"^[+-]?\d+$")


def to_int(value, label, errors, minimum=None, maximum=None):
    """Strictly convert to int. On failure append a message to `errors` and return None."""
    n = None
    if isinstance(value, bool):
        n = None
    elif isinstance(value, int):
        n = value
    elif isinstance(value, float) and value.is_integer():
        n = int(value)
    elif isinstance(value, str) and _INT.match(value.strip()):
        n = int(value.strip())
    if n is None:
        shown = "empty" if value is None or value == "" else f"'{value}'"
        errors.append(f"{label}: {shown} is not a valid whole number.")
        return None
    if minimum is not None and n < minimum:
        errors.append(f"{label}: must be at least {minimum} (got {n}).")
        return None
    if maximum is not None and n > maximum:
        errors.append(f"{label}: must be at most {maximum} (got {n}).")
        return None
    return n


def nat(text):
    """Natural-sort key so P2 sorts before P10. Deterministic tie-breaking by ID."""
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", str(text))]


def int_list(raw, label, errors, minimum=None, maximum=None):
    """Parse '1, 2 3' or [1,2,3] into a list of ints (None entries dropped after error)."""
    if raw is None or raw == "":
        return []
    tokens = re.split(r"[,\s]+", raw.strip()) if isinstance(raw, str) else list(raw)
    out = []
    for t in tokens:
        if t == "":
            continue
        v = to_int(t, label, errors, minimum, maximum)
        if v is not None:
            out.append(v)
    return out


def r2(x):
    return round(float(x), 2)
