#!/usr/bin/env python3
"""No-cache static server for the built demo: python3 serve.py [port] [dir]"""
import http.server, os, sys
port = int(sys.argv[1]) if len(sys.argv) > 1 else 4833
root = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "dist")
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=root, **k)
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate"); self.send_header("Expires", "0")
        super().end_headers()
    def log_message(self, *a):
        pass
print(f"serving {root} on http://localhost:{port}", flush=True)
http.server.ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
