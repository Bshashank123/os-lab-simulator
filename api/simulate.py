"""Vercel serverless entry point: POST /api/simulate (WSGI app)."""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _core import dispatch  # noqa: E402

MAX_BODY = 1_000_000


def _respond(start_response, code, body):
    data = json.dumps(body).encode("utf-8")
    status = {200: "200 OK", 400: "400 Bad Request", 413: "413 Payload Too Large"}[code]
    start_response(status, [
        ("Content-Type", "application/json; charset=utf-8"),
        ("Content-Length", str(len(data))),
        ("Cache-Control", "no-store"),
    ])
    return [data]


def app(environ, start_response):
    method = environ.get("REQUEST_METHOD", "GET")
    if method == "GET":
        return _respond(start_response, 200, {
            "ok": True, "service": "os-lab-simulator",
            "usage": "POST JSON {module, algorithm, input}"})
    if method != "POST":
        return _respond(start_response, 400, {"ok": False, "errors": ["Method not allowed."]})
    try:
        length = int(environ.get("CONTENT_LENGTH") or 0)
        if length > MAX_BODY:
            return _respond(start_response, 413, {"ok": False, "errors": ["Request too large."]})
        payload = json.loads(environ["wsgi.input"].read(length) or b"{}")
    except (ValueError, json.JSONDecodeError):
        return _respond(start_response, 400, {"ok": False, "errors": ["Request body is not valid JSON."]})
    return _respond(start_response, 200, dispatch(payload))
