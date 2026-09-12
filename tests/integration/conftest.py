"""Persist actual PyTest outcomes, including failures, for each validation invocation."""

import os
import warnings
from uuid import uuid4

import pytest

from airline_ops.config import Settings
from airline_ops.quality import record_result


def pytest_collection_modifyitems(items):
    enabled = os.getenv("RUN_INTEGRATION") == "1" or os.getenv("TEST_RUN_ID")
    for item in items:
        if "/integration/" in str(item.path):
            item.add_marker(pytest.mark.integration)
            if not enabled:
                item.add_marker(pytest.mark.skip(reason="Set RUN_INTEGRATION=1 or TEST_RUN_ID"))


@pytest.fixture(scope="session")
def settings():
    return Settings()


@pytest.fixture(scope="session")
def run_manifest(settings, request):
    run_id = os.getenv("TEST_RUN_ID")
    with settings.connect() as conn:
        if run_id:
            row = conn.execute(
                "SELECT manifest FROM pipeline_runs WHERE run_id=%s", (run_id,)
            ).fetchone()
        else:
            row = conn.execute("""
                SELECT manifest FROM pipeline_runs WHERE status='completed'
                ORDER BY transformed_at DESC LIMIT 1
            """).fetchone()
    if row is None:
        pytest.fail("No transformed run found. Run docker compose up --build -d first.")
    request.config._airline_quality = (settings, row[0]["run_id"], uuid4())
    return row[0]


@pytest.fixture(autouse=True)
def prepare_quality_logging(run_manifest):
    """Resolve the run before each integration test so failures can be audited."""


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    report = outcome.get_result()
    context = getattr(item.config, "_airline_quality", None)
    if context and (report.when == "call" or (report.when == "setup" and report.failed)):
        settings, run_id, validation_id = context
        details = str(report.longrepr)[:8000] if not report.passed else "PyTest assertion passed"
        try:
            record_result(settings, validation_id, run_id, item.nodeid, report.passed, details)
        except Exception as exc:
            warnings.warn(f"Could not persist data quality result: {exc}", stacklevel=1)
