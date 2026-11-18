import json
import threading
from http.server import ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.request import urlopen

import pytest

from securecloud_platform.server import Handler, route


def test_route_health() -> None:
    status, payload = route("/health")
    assert status == 200
    assert payload == {"status": "ok"}


def test_route_unknown() -> None:
    status, payload = route("/missing")
    assert status == 404
    assert payload == {"status": "not_found"}


def test_health_endpoint() -> None:
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    port = server.server_address[1]
    try:
        with urlopen(f"http://127.0.0.1:{port}/health") as response:
            assert response.status == 200
            assert json.load(response) == {"status": "ok"}
        with pytest.raises(HTTPError) as raised:
            urlopen(f"http://127.0.0.1:{port}/missing")
        assert raised.value.code == 404
    finally:
        server.shutdown()
        thread.join(timeout=5)
