#!/usr/bin/env python3
"""Static file server with HTTP Range support (needed for video seeking).

Python's built-in `http.server` ignores Range headers, which stops browsers
from seeking inside the MP4. Usage, from klt-tracker/:

    python3 tools/serve.py            # http://localhost:8000
    python3 tools/serve.py 9000
    python3 tools/serve.py 8000 --upload-dir build/sim   # also accept simulator uploads

Extras:
  * `--upload-dir DIR` enables POST /__upload/<relative path> (used by the
    simulator's recorder, sim/?record). Off by default.
  * If `x.json.gz` exists next to a requested `x.json`, it is sent gzip-encoded
    (browsers decompress transparently), which keeps large track files small.
"""
import http.server
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOAD_DIR = None
SAFE = re.compile(r"^[A-Za-z0-9_\-][A-Za-z0-9_./\-]*$")


class RangeHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript", ".mjs": "text/javascript",
        ".json": "application/json", ".mp4": "video/mp4", ".webm": "video/webm",
    }

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def do_POST(self):
        prefix = "/__upload/"
        name = self.path[len(prefix):].split("?")[0] if self.path.startswith(prefix) else ""
        if not UPLOAD_DIR or not name or not SAFE.match(name) or ".." in name:
            self.send_error(403 if not UPLOAD_DIR else 400)
            return
        length = int(self.headers.get("Content-Length", 0))
        dest = os.path.join(UPLOAD_DIR, name)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(dest, "wb") as fh:
            fh.write(self.rfile.read(length))
        self.send_response(204)
        self.end_headers()

    def send_head(self):
        rng = self.headers.get("Range")
        path = self.translate_path(self.path)
        gz = path + ".gz"
        if path.endswith(".json") and os.path.isfile(gz) and "gzip" in self.headers.get("Accept-Encoding", ""):
            f = open(gz, "rb")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Encoding", "gzip")
            self.send_header("Content-Length", str(os.path.getsize(gz)))
            self.end_headers()
            return f
        if not rng or not os.path.isfile(path):
            return super().send_head()
        m = re.match(r"bytes=(\d*)-(\d*)$", rng.strip())
        size = os.path.getsize(path)
        if not m:
            self.send_error(416)
            return None
        start = int(m.group(1)) if m.group(1) else max(0, size - int(m.group(2) or 0))
        end = int(m.group(2)) if m.group(1) and m.group(2) else size - 1
        end = min(end, size - 1)
        if start > end:
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{size}")
            self.end_headers()
            return None
        f = open(path, "rb")
        f.seek(start)
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.send_header("Accept-Ranges", "bytes")
        self.end_headers()
        self._remaining = end - start + 1
        return f

    def copyfile(self, source, outputfile):
        remaining = getattr(self, "_remaining", None)
        if remaining is None:
            return super().copyfile(source, outputfile)
        while remaining > 0:
            chunk = source.read(min(65536, remaining))
            if not chunk:
                break
            try:
                outputfile.write(chunk)
            except (BrokenPipeError, ConnectionResetError):
                break
            remaining -= len(chunk)
        self._remaining = None

    def end_headers(self):
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    args = sys.argv[1:]
    if "--upload-dir" in args:
        i = args.index("--upload-dir")
        UPLOAD_DIR = os.path.abspath(args[i + 1])
        del args[i:i + 2]
        os.makedirs(UPLOAD_DIR, exist_ok=True)
    port = int(args[0]) if args else 8000
    print(f"Serving {ROOT} at http://localhost:{port}" + (f" (uploads -> {UPLOAD_DIR})" if UPLOAD_DIR else ""))
    # Bind to localhost only: this is a development server.
    http.server.ThreadingHTTPServer(("127.0.0.1", port), RangeHandler).serve_forever()
