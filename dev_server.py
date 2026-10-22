"""Local preview server for the static pages and Python API."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
from api.estimate import handler as ApiHandler

PUBLIC = Path(__file__).resolve().parent / "public"


class LocalHandler(ApiHandler, SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC), **kwargs)

    def do_GET(self):
        if urlparse(self.path).path == "/api/estimate":
            ApiHandler.do_GET(self)
        else:
            SimpleHTTPRequestHandler.do_GET(self)

    def do_POST(self):
        if urlparse(self.path).path == "/api/estimate":
            ApiHandler.do_POST(self)
        else:
            self.reply(404, {"error": "Page not found."})


if __name__ == "__main__":
    print("Open http://localhost:8000 — press Ctrl+C to stop.", flush=True)
    ThreadingHTTPServer(("127.0.0.1", 8000), LocalHandler).serve_forever()
