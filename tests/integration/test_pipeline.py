import re
import time
from uuid import uuid4

import psycopg
import pytest
from confluent_kafka import Consumer, TopicPartition

from airline_ops.lake import get_json
from airline_ops.quality import record_result
from airline_ops.transform import TABLES, _merge, transform_run


def counts(settings, run_id):
    with settings.connect() as conn:
        return tuple(
            conn.execute(query, (run_id,)).fetchone()[0]
            for query in [
                "SELECT count(*) FROM flights WHERE source_run_id=%s",
                "SELECT count(*) FROM delays d JOIN flights f USING(flight_id) "
                "WHERE f.source_run_id=%s",
                "SELECT count(*) FROM passengers p JOIN flights f USING(flight_id) "
                "WHERE f.source_run_id=%s",
            ]
        )


def test_kafka_delivery_count_matches_consumer_landing(settings, run_manifest):
    expected = set()
    payloads = {}
    s3 = settings.s3()
    for key in run_manifest["raw_keys"]:
        row = get_json(s3, settings.bucket, key)
        assert row["raw_key"] == key
        expected.add((row["partition"], row["offset"]))
        payloads[(row["partition"], row["offset"])] = row["payload"].encode("utf-8")
    assert len(expected) == run_manifest["producer_count"]
    consumer = Consumer(
        {
            "bootstrap.servers": settings.bootstrap,
            "group.id": f"airline-validation-{uuid4()}",
            "enable.auto.commit": False,
        }
    )
    received = set()
    try:
        consumer.assign(
            [
                TopicPartition(
                    settings.topic, partition, min(o for p, o in expected if p == partition)
                )
                for partition in sorted({p for p, _ in expected})
            ]
        )
        deadline = time.monotonic() + 30
        while received != expected and time.monotonic() < deadline:
            message = consumer.poll(1)
            if message is not None:
                assert message.error() is None
                identity = (message.partition(), message.offset())
                if identity in expected:
                    assert message.value() == payloads[identity]
                    received.add(identity)
        assert received == expected, "Kafka record count must equal landed MinIO record count"
    finally:
        consumer.close()


def test_postgres_row_counts(settings, run_manifest):
    assert counts(settings, run_manifest["run_id"]) == (
        run_manifest["expected_flights"],
        run_manifest["expected_delays"],
        run_manifest["expected_passengers"],
    )


def test_no_orphan_delays_or_passengers(settings):
    with settings.connect() as conn:
        for table in ("delays", "passengers"):
            query = psycopg.sql.SQL("""
                SELECT count(*) FROM {} child LEFT JOIN flights f USING(flight_id)
                WHERE f.flight_id IS NULL
            """).format(psycopg.sql.Identifier(table))
            assert conn.execute(query).fetchone()[0] == 0


def test_foreign_key_is_enforced_by_postgres(settings):
    with settings.connect() as conn:
        with pytest.raises(psycopg.errors.ForeignKeyViolation):
            with conn.transaction():
                conn.execute(
                    """
                    INSERT INTO delays(delay_id, flight_id, delay_min, reason, occurred_at)
                    VALUES (%s, %s, 10, 'test', now())
                """,
                    (str(uuid4()), "nonexistent-" + str(uuid4())),
                )


def test_negative_delay_is_rejected_by_postgres(settings, run_manifest):
    with settings.connect() as conn:
        with pytest.raises(psycopg.errors.CheckViolation):
            with conn.transaction():
                conn.execute(
                    """
                    INSERT INTO delays(delay_id, flight_id, delay_min, reason, occurred_at)
                    VALUES (%s, %s, -1, 'test', now())
                """,
                    (str(uuid4()), run_manifest["flight_ids"][0]),
                )


def test_failed_child_load_rolls_back_parent_update(settings, run_manifest):
    stage = "stage_test_" + uuid4().hex
    flight_id = run_manifest["flight_ids"][0]
    with settings.connect(autocommit=True) as conn:
        original = conn.execute(
            "SELECT gate FROM flights WHERE flight_id=%s", (flight_id,)
        ).fetchone()[0]
        conn.execute(psycopg.sql.SQL("CREATE SCHEMA {}").format(psycopg.sql.Identifier(stage)))
        try:
            for table in TABLES:
                conn.execute(
                    psycopg.sql.SQL("CREATE TABLE {}.{} AS SELECT * FROM {} WITH NO DATA").format(
                        psycopg.sql.Identifier(stage),
                        psycopg.sql.Identifier(table),
                        psycopg.sql.Identifier(table),
                    )
                )
            conn.execute(
                psycopg.sql.SQL(
                    "INSERT INTO {}.flights SELECT * FROM flights WHERE flight_id=%s"
                ).format(psycopg.sql.Identifier(stage)),
                (flight_id,),
            )
            conn.execute(
                psycopg.sql.SQL("UPDATE {}.flights SET gate='ROLLBACK-TEST'").format(
                    psycopg.sql.Identifier(stage)
                )
            )
            conn.execute(
                psycopg.sql.SQL("""
                INSERT INTO {}.delays (delay_id, flight_id, delay_min, reason, occurred_at)
                VALUES (%s, %s, -10, 'invalid staged child', now())
            """).format(psycopg.sql.Identifier(stage)),
                (str(uuid4()), flight_id),
            )
            with pytest.raises(psycopg.errors.CheckViolation):
                with conn.transaction():
                    _merge(conn, stage)
            assert (
                conn.execute(
                    "SELECT gate FROM flights WHERE flight_id=%s", (flight_id,)
                ).fetchone()[0]
                == original
            )
        finally:
            conn.execute(
                psycopg.sql.SQL("DROP SCHEMA {} CASCADE").format(psycopg.sql.Identifier(stage))
            )


def test_no_duplicate_flight_ids_per_date(settings, run_manifest):
    with settings.connect() as conn:
        assert (
            conn.execute(
                """
            SELECT flight_id, flight_date FROM flights WHERE source_run_id=%s
            GROUP BY flight_id, flight_date HAVING count(*) > 1
        """,
                (run_manifest["run_id"],),
            ).fetchall()
            == []
        )
        assert (
            conn.execute(
                """
            SELECT flight_number, flight_date FROM flights WHERE source_run_id=%s
            GROUP BY flight_number, flight_date HAVING count(*) > 1
        """,
                (run_manifest["run_id"],),
            ).fetchall()
            == []
        )


def test_raw_event_accounting(settings, run_manifest):
    with settings.connect() as conn:
        row = conn.execute(
            """
            SELECT producer_count, raw_count, valid_count, duplicate_count, rejected_count, status
            FROM pipeline_runs WHERE run_id=%s
        """,
            (run_manifest["run_id"],),
        ).fetchone()
    produced, raw, valid, duplicate, rejected, status = row
    assert status == "completed"
    assert produced == raw == valid + duplicate + rejected
    assert valid == run_manifest["unique_event_count"]
    assert duplicate == run_manifest["expected_duplicates"]
    assert rejected == run_manifest["expected_rejected"]


def test_latest_flight_state_and_types(settings, run_manifest):
    with settings.connect() as conn:
        rows = conn.execute(
            """
            SELECT status, actual_dep, gate, flight_date, scheduled_dep FROM flights
            WHERE source_run_id=%s
        """,
            (run_manifest["run_id"],),
        ).fetchall()
    assert len(rows) == run_manifest["expected_flights"]
    for status, actual, gate, flight_date, scheduled in rows:
        assert status == "departed" and actual is not None
        assert re.fullmatch(r"B\d+", gate)
        assert flight_date == scheduled.date()


def test_transform_replay_is_idempotent(settings, run_manifest):
    before = counts(settings, run_manifest["run_id"])
    with settings.connect() as conn:
        first = conn.execute(
            """
            SELECT flight_id, status, actual_dep, gate FROM flights
            WHERE source_run_id=%s ORDER BY flight_id
        """,
            (run_manifest["run_id"],),
        ).fetchall()
    transform_run(settings, run_manifest)
    assert counts(settings, run_manifest["run_id"]) == before
    with settings.connect() as conn:
        assert (
            conn.execute(
                """
            SELECT flight_id, status, actual_dep, gate FROM flights
            WHERE source_run_id=%s ORDER BY flight_id
        """,
                (run_manifest["run_id"],),
            ).fetchall()
            == first
        )


def test_quality_report_persists_results(settings, run_manifest, request):
    validation_id = request.config._airline_quality[2]
    # The real reporting hook replaces this probe with the final test outcome.
    record_result(
        settings,
        validation_id,
        run_manifest["run_id"],
        request.node.nodeid,
        False,
        "storage probe pending final assertion",
    )
    with settings.connect() as conn:
        row = conn.execute(
            """
            SELECT passed, details FROM data_quality_report
            WHERE run_id=%s AND validation_id=%s AND test_name=%s
        """,
            (run_manifest["run_id"], validation_id, request.node.nodeid),
        ).fetchone()
    assert row == (False, "storage probe pending final assertion")
