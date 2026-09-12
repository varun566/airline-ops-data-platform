"""Deterministic raw object names and immutable per-producer-run manifests."""

import json
import time
from datetime import UTC, datetime

from botocore.exceptions import ClientError


def raw_key(topic: str, partition: int, offset: int, timestamp_ms: int) -> str:
    # Kafka timestamp is stable on redelivery; wall-clock ingestion time is not.
    date = datetime.fromtimestamp(timestamp_ms / 1000, UTC).date().isoformat()
    return f"raw/date={date}/topic={topic}/partition={partition}/offset={offset:020d}.json"


def put_json(s3, bucket, key, value):
    s3.put_object(
        Bucket=bucket,
        Key=key,
        Body=(json.dumps(value, sort_keys=True) + "\n").encode(),
        ContentType="application/json",
    )


def get_json(s3, bucket, key):
    response = s3.get_object(Bucket=bucket, Key=key)
    with response["Body"] as body:
        return json.load(body)


def list_keys(s3, bucket, prefix):
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix=prefix):
        for obj in page.get("Contents", []):
            yield obj["Key"]


def manifests(settings):
    s3 = settings.s3()
    return [
        get_json(s3, settings.bucket, key)
        for key in list_keys(s3, settings.bucket, "manifests/")
        if key.endswith(".json")
    ]


def wait_for_raw(settings, manifest, timeout=120):
    s3 = settings.s3()
    missing = set(manifest["raw_keys"])
    deadline = time.monotonic() + timeout
    while missing:
        for key in list(missing):
            try:
                s3.head_object(Bucket=settings.bucket, Key=key)
                missing.remove(key)
            except ClientError as exc:
                if exc.response["Error"]["Code"] not in ("404", "NoSuchKey", "NotFound"):
                    raise
        if not missing:
            return
        if time.monotonic() >= deadline:
            raise TimeoutError(f"{len(missing)} acknowledged Kafka records not yet in MinIO")
        time.sleep(1)
