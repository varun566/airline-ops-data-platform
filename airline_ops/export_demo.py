"""Export recorded synthetic results for the public, read-only portfolio dashboard."""

import json
import sys

from airline_ops.api import dashboard


def snapshot():
    data = dashboard()
    data["mode"] = "snapshot"
    data.pop("job", None)
    return data


def main():
    json.dump(snapshot(), sys.stdout, indent=2, default=str)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
