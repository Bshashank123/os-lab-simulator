"""Vercel serverless entry point: POST /api/simulate."""
import json
import os
import sys
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _core import dispatch  # noqa: E402


class handler(BaseHTTPRequestHandler):
    def _send(self, code, body):
        data = json.dumps(body).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
            if length > 1_000_000:
                return self._send(413, {"ok": False, "errors": ["Request too large."]})
            payload = json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, json.JSONDecodeError):
            return self._send(400, {"ok": False, "errors": ["Request body is not valid JSON."]})
        self._send(200, dispatch(payload))

    def do_GET(self):
        self._send(200, {"ok": True, "service": "os-lab-simulator", "usage": "POST JSON {module, algorithm, input}"})
