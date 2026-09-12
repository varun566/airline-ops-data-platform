"""One-command sample: publish, await raw delivery, transform, then run real PyTest checks."""

import os
import subprocess
import sys

from airline_ops.config import Settings, configure_logging
from airline_ops.producer import publish_run
from airline_ops.transform import transform_run


def main():
    configure_logging()
    settings = Settings()
    manifest = publish_run(settings, shuffle=True)
    transform_run(settings, manifest)
    env = dict(os.environ, TEST_RUN_ID=manifest["run_id"])
    subprocess.run([sys.executable, "-m", "pytest", "-q", "tests/integration"], env=env, check=True)
    print(f"Demo passed. Run ID: {manifest['run_id']}")
    print(
        "Expected: 32 Kafka/raw records, 28 unique events, 4 duplicates, "
        "4 flights, 4 delays, 12 passenger bookings."
    )


if __name__ == "__main__":
    main()
