from datetime import date
from unittest.mock import MagicMock, patch

import pytest
from botocore.exceptions import ClientError

from airline_ops.producer import generate_events, publish_run

RUN_ID = "f0000000-0000-4000-8000-000000000001"


def test_reproducible_events_have_flight_specific_bookings():
    events = generate_events(RUN_ID, service_date=date(2026, 9, 12))
    assert events == generate_events(RUN_ID, service_date=date(2026, 9, 12))
    assert len(events) == len({event["event_id"] for event in events}) == 28
    assert len({event["flight_id"] for event in events}) == 4
    assert len({event["pax_id"] for event in events if event["pax_id"]}) == 12
    assert all(event["timestamp"].endswith("+00:00") for event in events)


@pytest.mark.parametrize("flights,passengers", [(0, 3), (101, 3), (1, -1), (1, 501)])
def test_invalid_simulation_size(flights, passengers):
    with pytest.raises(ValueError):
        generate_events(RUN_ID, flights, passengers)


def test_different_service_days_have_distinct_flight_ids():
    first = generate_events(RUN_ID, service_date=date(2026, 9, 12))
    second = generate_events(RUN_ID, service_date=date(2026, 9, 13))
    assert {e["flight_id"] for e in first}.isdisjoint({e["flight_id"] for e in second})


def test_failed_delivery_never_writes_completion_manifest():
    settings = MagicMock()
    settings.s3().head_object.side_effect = ClientError({"Error": {"Code": "404"}}, "HeadObject")
    with patch("airline_ops.producer.Producer") as producer:
        producer.return_value.flush.return_value = 1
        with pytest.raises(RuntimeError, match="delivery incomplete"):
            publish_run(settings, run_id=RUN_ID, flight_count=1, interval=0)
    settings.s3().put_object.assert_not_called()


def test_completed_run_id_cannot_be_reused():
    settings = MagicMock()
    with pytest.raises(ValueError, match="already exists"):
        publish_run(settings, run_id=RUN_ID, interval=0)
