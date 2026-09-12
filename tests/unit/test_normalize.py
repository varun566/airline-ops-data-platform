import json
from datetime import date
from uuid import uuid4

import pytest

from airline_ops.normalize import RAW_SCHEMA, normalize
from airline_ops.producer import generate_events

RUN_ID = "f0000000-0000-4000-8000-000000000002"


def raw_frame(spark, events):
    return spark.createDataFrame(
        [
            (f"raw/test/offset={i}.json", json.dumps(event) if isinstance(event, dict) else event)
            for i, event in enumerate(events)
        ],
        RAW_SCHEMA,
    )


@pytest.fixture(scope="module")
def normalized(spark):
    events = generate_events(RUN_ID, flight_count=2, service_date=date(2026, 9, 12))
    delay = next(e for e in events if e["event_type"] == "flight_delay")
    checkin = next(e for e in events if e["event_type"] == "passenger_checkin")
    # Exercise both exact redelivery and a natural duplicate carrying a different ID.
    events += [dict(delay), dict(delay, event_id=str(uuid4()))]
    # String integer casting and missing reason are valid.
    for event in events:
        if event["event_type"] == "flight_delay":
            event["delay_min"] = str(event["delay_min"])
            event["reason"] = None
    events += [
        dict(delay, event_id=str(uuid4()), delay_min="-5"),
        dict(delay, event_id=str(uuid4()), delay_min="2.5"),
        dict(delay, event_id=str(uuid4()), origin=None),
        dict(delay, event_id=str(uuid4()), timestamp="not-a-date"),
        dict(delay, event_id=str(uuid4()), timestamp="2026-09-12T10:00:00"),
        dict(delay, event_id=str(uuid4()), flight_id="missing-parent"),
        dict(checkin, event_id=str(uuid4()), pax_id=None),
        '{"broken":',
    ]
    result = normalize(raw_frame(spark, list(reversed(events))), RUN_ID)
    yield result
    spark.catalog.clearCache()


def test_type_casting_and_null_reason(normalized):
    rows = normalized.delays.collect()
    assert sorted(row.delay_min for row in rows) == [10, 15]
    assert all(row.reason == "unspecified" for row in rows)


def test_latest_state_is_independent_of_arrival_order(normalized):
    flights = normalized.flights.collect()
    assert len(flights) == 2
    assert all(f.status == "departed" and f.actual_dep is not None for f in flights)
    assert {f.gate for f in flights} == {"B10", "B11"}
    assert all(f.flight_date == date(2026, 9, 12) for f in flights)


def test_duplicate_ids_and_composite_keys_are_removed(normalized):
    assert normalized.accepted.count() == 16
    assert normalized.events.count() == 14
    assert normalized.delays.count() == 2
    assert normalized.passengers.count() == 6


def test_invalid_rows_are_quarantined_with_raw_lineage(normalized):
    rejected = normalized.rejected.collect()
    assert len(rejected) == 8
    assert all(row.raw_key and row.reason and row.rejection_id for row in rejected)
    reasons = ";".join(row.reason for row in rejected)
    assert "missing_or_conflicting_schedule" in reasons
    assert "invalid_timestamp" in reasons
    assert "malformed_json" in reasons


def test_empty_input_has_no_phantom_rows(spark):
    result = normalize(spark.createDataFrame([], RAW_SCHEMA), RUN_ID)
    assert result.flights.count() == result.rejected.count() == 0
    spark.catalog.clearCache()


def test_booking_cannot_reference_two_flights(spark):
    events = generate_events(RUN_ID, flight_count=2, passengers_per_flight=1)
    for event in events:
        if event["event_type"] == "passenger_checkin":
            event["pax_id"] = "conflicting-booking"
    result = normalize(raw_frame(spark, events), RUN_ID)
    assert result.passengers.count() == 0
    assert result.rejected.count() == 2
    spark.catalog.clearCache()
