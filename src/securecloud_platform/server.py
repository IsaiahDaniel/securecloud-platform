import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def route(path: str) -> tuple[int, dict[str, str]]:
    if path.split("?", 1)[0] == "/health":
        return 200, {"status": "ok"}
    return 404, {"status": "not_found"}


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        status, payload = route(self.path)
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt: str, *args: object) -> None:
        print(f"{self.address_string()} {fmt % args}", flush=True)


def serve(host: str, port: int) -> None:
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"listening on http://{host}:{port}", flush=True)
    server.serve_forever()
