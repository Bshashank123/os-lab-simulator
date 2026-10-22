"""Local development server: serves public/ and the same Python core at /api/simulate.

    python dev_server.py            # http://localhost:8000
    python dev_server.py 3000       # custom port
(`vercel dev` also works if you have the Vercel CLI.)
"""
import json
import os
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ROOT, "api"))
from _core import dispatch  # noqa: E402


class Dev(SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path.split("?")[0] != "/api/simulate":
            self.send_error(404)
            return
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
            out = dispatch(body)
        except ValueError:
            out = {"ok": False, "errors": ["Request body is not valid JSON."]}
        data = json.dumps(out).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    handler = partial(Dev, directory=os.path.join(ROOT, "public"))
    print(f"OS Lab Simulator running at http://localhost:{port}  (Ctrl+C to stop)")
    ThreadingHTTPServer(("", port), handler).serve_forever()
