#!/usr/bin/env python3
"""於專案根目錄提供靜態檔案（index.html、questions.json 等）。"""
from __future__ import annotations

import functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PORT = 5176


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format_: str, *args: object) -> None:
        pass

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main() -> None:
    handler = functools.partial(QuietHandler, directory=str(ROOT.resolve()))
    with ThreadingHTTPServer(("127.0.0.1", PORT), handler) as httpd:
        print(f"請用瀏覽器開啟： http://127.0.0.1:{PORT}/")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
