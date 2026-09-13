"""Local dashboard API. Serves synthetic operational data without exposing credentials."""

import json
import logging
import os
import subprocess
import sys
import threading
from datetime import UTC, datetime
from functools import lru_cache
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from psycopg.rows import dict_row

from airline_ops.config import Settings, configure_logging
from airline_ops.lake import get_json

LOG = logging.getLogger(__name__)
SETTINGS = Settings()
JOB_LOCK = threading.Lock()
JOB = {"state": "idle", "started_at": None, "finished_at": None, "exit_code": None}


@lru_cache(maxsize=2048)
def raw_event(key):
    envelope = get_json(SETTINGS.s3(), SETTINGS.bucket, key)
    try:
        event = json.loads(envelope["payload"])
        if not isinstance(event, dict):
            return None
        return dict(event, raw_key=key)
    except (TypeError, json.JSONDecodeError):
        return None


def dashboard(settings=None):
    settings = settings or SETTINGS
    with settings.connect(row_factory=dict_row) as conn:
        conn.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        runs = conn.execute("""
            SELECT * FROM pipeline_runs ORDER BY created_at DESC LIMIT 12
        """).fetchall()
        ids = [run["run_id"] for run in runs]
        flights = conn.execute(
            """
            SELECT f.*,
                (SELECT count(*) FROM passengers p WHERE p.flight_id=f.flight_id) AS passengers,
                (SELECT delay_min FROM delays d WHERE d.flight_id=f.flight_id
                 ORDER BY occurred_at DESC LIMIT 1) AS delay_min,
                (SELECT reason FROM delays d WHERE d.flight_id=f.flight_id
                 ORDER BY occurred_at DESC LIMIT 1) AS delay_reason
            FROM flights f WHERE source_run_id=ANY(%s) ORDER BY flight_number
        """,
            (ids,),
        ).fetchall()
        checks = conn.execute(
            """
            SELECT * FROM data_quality_report WHERE validation_id IN (
                SELECT DISTINCT ON (run_id) validation_id FROM data_quality_report
                WHERE run_id=ANY(%s) ORDER BY run_id, checked_at DESC)
            ORDER BY report_id
        """,
            (ids,),
        ).fetchall()
    events = []
    warnings = []
    for run in runs:
        # Keep the dashboard bounded even if a caller generates a very large batch.
        for key in run["manifest"]["raw_keys"][:500]:
            try:
                event = raw_event(key)
                if event is not None:
                    events.append(event)
            except Exception:
                warnings.append("Some raw events are unavailable; database results remain visible.")
                LOG.warning("Could not read raw object %s", key, exc_info=True)
                break
        if len(run["manifest"]["raw_keys"]) > 500:
            warnings.append("The event browser displays up to 500 raw events per run.")
        run.pop("manifest")
    with JOB_LOCK:
        job = dict(JOB)
    return {
        "mode": "live",
        "generated_at": datetime.now(UTC).isoformat(),
        "runs": runs,
        "flights": flights,
        "checks": checks,
        "events": events,
        "warnings": list(dict.fromkeys(warnings)),
        "job": job,
    }


def start_simulation():
    with JOB_LOCK:
        if JOB["state"] == "running":
            return False
        JOB.update(
            state="running",
            started_at=datetime.now(UTC).isoformat(),
            finished_at=None,
            exit_code=None,
        )

    def work():
        exit_code = -1
        try:
            # Fixed command, no user-controlled executable or arguments, no Docker socket.
            with Path("/tmp/airline-dashboard-demo.log").open("w") as output:
                result = subprocess.run(
                    [sys.executable, "-m", "airline_ops.demo"],
                    stdout=output,
                    stderr=subprocess.STDOUT,
                    timeout=600,
                )
                exit_code = result.returncode
        except Exception:
            LOG.exception("Dashboard simulation failed")
        finally:
            with JOB_LOCK:
                JOB.update(
                    state="succeeded" if exit_code == 0 else "failed",
                    finished_at=datetime.now(UTC).isoformat(),
                    exit_code=exit_code,
                )

    threading.Thread(target=work, daemon=True).start()
    return True


class Handler(BaseHTTPRequestHandler):
    def reply(self, status, payload):
        content = json.dumps(payload, default=str).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(content)

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/health":
            self.reply(200, {"status": "ok"})
        elif path == "/api/dashboard":
            try:
                self.reply(200, dashboard())
            except Exception:
                LOG.exception("Dashboard query failed")
                self.reply(503, {"error": "Database unavailable. Check the PostgreSQL service."})
        else:
            self.reply(404, {"error": "Unknown endpoint"})

    def do_POST(self):
        if urlparse(self.path).path != "/api/simulations":
            return self.reply(404, {"error": "Unknown endpoint"})
        host = self.headers.get("Host", "")
        origin = self.headers.get("Origin")
        if urlparse("http://" + host).hostname not in {"localhost", "127.0.0.1", "api"} or (
            origin and urlparse(origin).netloc != host
        ):
            return self.reply(
                403, {"error": "Only local same-origin simulation requests are allowed"}
            )
        if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
            return self.reply(415, {"error": "Use application/json"})
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if size < 0 or size > 1024:
                return self.reply(413, {"error": "Request too large"})
            body = json.loads(self.rfile.read(size) or b"{}")
            if body != {}:
                return self.reply(400, {"error": "This demo does not accept custom arguments"})
        except (ValueError, json.JSONDecodeError):
            return self.reply(400, {"error": "Invalid JSON request"})
        if not start_simulation():
            return self.reply(409, {"error": "A simulation is already running"})
        self.reply(202, {"state": "running"})


def main():
    configure_logging()
    address = (os.getenv("API_HOST", "0.0.0.0"), int(os.getenv("API_PORT", "8010")))
    LOG.info("Dashboard API listening on %s:%s", *address)
    ThreadingHTTPServer(address, Handler).serve_forever()


if __name__ == "__main__":
    main()
