"""Exercise real HTTP request handling without starting external services or Spark."""

import json
import threading
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer

import pytest

from airline_ops import api, export_demo


@pytest.fixture
def client():
    server = ThreadingHTTPServer(("127.0.0.1", 0), api.Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    def request(method="GET", path="/api/dashboard", body=None, headers=None):
        conn = HTTPConnection(*server.server_address, timeout=5)
        try:
            conn.request(method, path, body, headers or {})
            response = conn.getresponse()
            return response.status, json.loads(response.read()), dict(response.getheaders())
        finally:
            conn.close()

    yield request
    server.shutdown()
    server.server_close()
    thread.join(timeout=5)


def test_dashboard_returns_actual_payload_with_no_cache(client, monkeypatch):
    payload = {"mode": "live", "runs": [{"run_id": "sample-run", "raw_count": 32}]}
    monkeypatch.setattr(api, "dashboard", lambda: payload)
    status, data, headers = client()
    assert status == 200
    assert data == payload
    assert headers["Cache-Control"] == "no-store"


def test_database_failure_is_sanitized(client, monkeypatch):
    def unavailable():
        raise RuntimeError("private connection detail")

    monkeypatch.setattr(api, "dashboard", unavailable)
    status, data, _ = client()
    assert status == 503
    assert "private" not in json.dumps(data)


@pytest.mark.parametrize("method", ["GET", "POST"])
def test_unknown_route(client, method):
    assert client(method, "/api/unknown")[0] == 404


def test_same_origin_simulation_and_busy_response(client, monkeypatch):
    outcomes = iter([True, False])
    monkeypatch.setattr(api, "start_simulation", lambda: next(outcomes))
    headers = {
        "Host": "localhost:8088",
        "Origin": "http://localhost:8088",
        "Content-Type": "application/json",
    }
    assert client("POST", "/api/simulations", "{}", headers)[0] == 202
    assert client("POST", "/api/simulations", "{}", headers)[0] == 409


@pytest.mark.parametrize(
    ("headers", "body", "expected"),
    [
        ({"Origin": "https://untrusted.example"}, "{}", 403),
        ({"Host": "untrusted.example"}, "{}", 403),
        ({"Content-Type": "text/plain"}, "{}", 415),
        ({}, '{"command":"anything"}', 400),
        ({}, "{", 400),
        ({"Content-Length": "1025"}, "{}", 413),
    ],
)
def test_invalid_simulation_never_starts_a_job(client, monkeypatch, headers, body, expected):
    def forbidden():
        pytest.fail("Rejected request must not start a simulation")

    monkeypatch.setattr(api, "start_simulation", forbidden)
    combined = {"Content-Type": "application/json", **headers}
    assert client("POST", "/api/simulations", body, combined)[0] == expected


def test_running_job_cannot_be_started_twice(monkeypatch):
    monkeypatch.setattr(api, "JOB", {"state": "running"})
    assert api.start_simulation() is False


def test_export_labels_snapshot_and_removes_local_job(monkeypatch):
    monkeypatch.setattr(
        export_demo,
        "dashboard",
        lambda: {
            "mode": "live",
            "job": {"state": "running"},
            "runs": [{"raw_count": 32}],
        },
    )
    result = export_demo.snapshot()
    assert result == {"mode": "snapshot", "runs": [{"raw_count": 32}]}
