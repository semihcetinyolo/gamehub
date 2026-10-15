#!/usr/bin/env python3
"""Serve the playable on the LAN (phones on the same Wi-Fi) with caching off,
so a re-extracted level or code change shows up on the next reload.

Usage:  python3 tools/serve.py [port]      (default 8767)
"""
import functools, http.server, sys
from pathlib import Path


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8767
root = Path(__file__).resolve().parents[1] / "game"
http.server.ThreadingHTTPServer(("0.0.0.0", port), functools.partial(NoCache, directory=str(root))).serve_forever()
