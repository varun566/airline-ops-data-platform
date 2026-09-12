"""Read a completed producer manifest, transform its raw S3 JSON, atomically merge via JDBC."""

import argparse
import json
import logging
from uuid import UUID, uuid4

from psycopg import sql
from psycopg.types.json import Jsonb

from airline_ops.config import Settings, configure_logging
from airline_ops.lake import get_json, manifests, wait_for_raw
from airline_ops.normalize import RAW_SCHEMA, normalize
from airline_ops.spark import create_spark

LOG = logging.getLogger(__name__)
TABLES = ("flights", "delays", "passengers", "rejected_events")


def _merge(conn, stage):
    """Single transaction: parent first, children second; retain all modeled constraints."""
    # Serialize the short final merge, while separate Spark jobs may stage concurrently.
    conn.execute("SELECT pg_advisory_xact_lock(724913)")
    collision = conn.execute(
        sql.SQL("""
        SELECT 1 FROM {s}.flights s JOIN flights f USING (flight_id)
        WHERE s.source_run_id <> f.source_run_id LIMIT 1
    """).format(s=sql.Identifier(stage))
    ).fetchone()
    if collision:
        raise ValueError("flight_id already belongs to another simulation run")
    collision = conn.execute(
        sql.SQL("""
        SELECT 1 FROM {s}.passengers s JOIN passengers p USING (pax_id)
        WHERE s.flight_id <> p.flight_id LIMIT 1
    """).format(s=sql.Identifier(stage))
    ).fetchone()
    if collision:
        raise ValueError("pax_id already belongs to another flight")
    conn.execute(
        sql.SQL("""
        INSERT INTO flights SELECT DISTINCT * FROM {s}.flights
        ON CONFLICT (flight_id) DO UPDATE SET
            origin=EXCLUDED.origin, dest=EXCLUDED.dest, scheduled_dep=EXCLUDED.scheduled_dep,
            actual_dep=EXCLUDED.actual_dep, status=EXCLUDED.status, gate=EXCLUDED.gate,
            last_event_at=EXCLUDED.last_event_at, last_event_id=EXCLUDED.last_event_id
        WHERE (EXCLUDED.last_event_at, EXCLUDED.last_event_id) >=
              (flights.last_event_at, flights.last_event_id)
    """).format(s=sql.Identifier(stage))
    )
    conn.execute(
        sql.SQL("""
        INSERT INTO delays SELECT DISTINCT * FROM {s}.delays
        ON CONFLICT (flight_id, occurred_at) DO UPDATE SET
            delay_min=EXCLUDED.delay_min, reason=EXCLUDED.reason
    """).format(s=sql.Identifier(stage))
    )
    conn.execute(
        sql.SQL("""
        INSERT INTO passengers SELECT DISTINCT * FROM {s}.passengers
        ON CONFLICT (pax_id) DO UPDATE SET
            checkin_time=LEAST(passengers.checkin_time, EXCLUDED.checkin_time)
    """).format(s=sql.Identifier(stage))
    )
    conn.execute(
        sql.SQL("""
        INSERT INTO rejected_events (rejection_id, run_id, raw_key, reason, payload)
        SELECT DISTINCT rejection_id, run_id, raw_key, reason, payload FROM {s}.rejected_events
        ON CONFLICT (rejection_id) DO UPDATE SET reason=EXCLUDED.reason
    """).format(s=sql.Identifier(stage))
    )


def transform_run(settings, manifest, spark=None, timeout=120):
    run_id = str(UUID(manifest["run_id"]))
    keys = manifest["raw_keys"]
    if not keys or len(set(keys)) != len(keys) or len(keys) != manifest["producer_count"]:
        raise ValueError("Manifest must identify each acknowledged Kafka record exactly once")
    own_spark = spark is None
    stage = "stage_" + uuid4().hex
    with settings.connect(autocommit=True) as conn:
        acquired = conn.execute(
            "SELECT pg_try_advisory_lock(hashtextextended(%s, 0))", (run_id,)
        ).fetchone()[0]
        if not acquired:
            raise RuntimeError(f"Run {run_id} is already being transformed")
        conn.execute(
            """
            INSERT INTO pipeline_runs (run_id, producer_count, status, manifest)
            VALUES (%s, %s, 'pending', %s)
            ON CONFLICT (run_id) DO UPDATE SET status='pending', error=NULL
        """,
            (run_id, manifest["producer_count"], Jsonb(manifest)),
        )
        try:
            wait_for_raw(settings, manifest, timeout)
            spark = spark or create_spark(settings)
            raw = (
                spark.read.schema(RAW_SCHEMA)
                .json([f"s3a://{settings.bucket}/{key}" for key in keys])
                .cache()
            )
            raw_count = raw.count()
            if raw_count != manifest["producer_count"]:
                raise ValueError("Raw row count differs from acknowledged Kafka deliveries")
            normalized = normalize(raw, run_id)
            valid_count = normalized.events.count()
            rejected_count = normalized.rejected.count()
            duplicate_count = normalized.accepted.count() - valid_count
            if raw_count != valid_count + rejected_count + duplicate_count:
                raise ValueError("Raw/valid/rejected/duplicate accounting does not balance")
            frames = {
                "flights": normalized.flights,
                "delays": normalized.delays,
                "passengers": normalized.passengers,
                "rejected_events": normalized.rejected,
            }
            conn.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(stage)))
            for name, frame in frames.items():
                # Explicit target column order prevents silent positional corruption on merge.
                target_columns = [
                    row[0]
                    for row in conn.execute(
                        """
                    SELECT column_name FROM information_schema.columns
                    WHERE table_schema='public' AND table_name=%s
                    ORDER BY ordinal_position
                """,
                        (name,),
                    ).fetchall()
                    if row[0] in frame.columns
                ]
                conn.execute(
                    sql.SQL("CREATE TABLE {}.{} AS SELECT {} FROM {} WITH NO DATA").format(
                        sql.Identifier(stage),
                        sql.Identifier(name),
                        sql.SQL(", ").join(map(sql.Identifier, target_columns)),
                        sql.Identifier(name),
                    )
                )
                frame.select(*target_columns).coalesce(2).write.jdbc(
                    settings.jdbc_url,
                    f"{stage}.{name}",
                    mode="append",
                    properties={
                        "user": settings.pg_user,
                        "password": settings.pg_password,
                        "driver": "org.postgresql.Driver",
                        "batchsize": "500",
                        "isolationLevel": "READ_COMMITTED",
                    },
                )
            with conn.transaction():
                _merge(conn, stage)
                conn.execute(
                    """
                    UPDATE pipeline_runs SET status='completed', transformed_at=now(), error=NULL,
                        raw_count=%s, valid_count=%s, rejected_count=%s, duplicate_count=%s
                    WHERE run_id=%s
                """,
                    (raw_count, valid_count, rejected_count, duplicate_count, run_id),
                )
            result = {
                "run_id": run_id,
                "raw": raw_count,
                "valid": valid_count,
                "rejected": rejected_count,
                "duplicates": duplicate_count,
            }
            LOG.info("transform_complete %s", json.dumps(result))
            return result
        except Exception as exc:
            conn.execute(
                "UPDATE pipeline_runs SET status='failed', error=%s WHERE run_id=%s",
                (f"{type(exc).__name__}: {str(exc)[:1000]}", run_id),
            )
            raise
        finally:
            conn.execute(sql.SQL("DROP SCHEMA IF EXISTS {} CASCADE").format(sql.Identifier(stage)))
            conn.execute("SELECT pg_advisory_unlock(hashtextextended(%s, 0))", (run_id,))
            if spark is not None:
                spark.catalog.clearCache()
                if own_spark:
                    spark.stop()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-id", type=lambda value: str(UUID(value)))
    parser.add_argument("--replay", action="store_true", help="Include completed runs")
    parser.add_argument("--timeout", type=int, default=120)
    args = parser.parse_args()
    configure_logging()
    settings = Settings()
    candidates = (
        [get_json(settings.s3(), settings.bucket, f"manifests/{args.run_id}.json")]
        if args.run_id
        else manifests(settings)
    )
    if not args.run_id and not args.replay:
        with settings.connect() as conn:
            completed = {
                row[0]
                for row in conn.execute("SELECT run_id FROM pipeline_runs WHERE status='completed'")
            }
        candidates = [m for m in candidates if m["run_id"] not in completed]
    if not candidates:
        print("No pending producer runs")
        return
    spark = create_spark(settings)
    try:
        for manifest in sorted(candidates, key=lambda m: m["created_at"]):
            transform_run(settings, manifest, spark=spark, timeout=args.timeout)
    finally:
        spark.stop()


if __name__ == "__main__":
    main()
