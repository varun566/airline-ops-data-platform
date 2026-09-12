"""Generate bounded, reproducible flights; stream successive runs with --continuous."""

import argparse
import json
import logging
import random
import time
from datetime import UTC, date, datetime, timedelta
from uuid import NAMESPACE_URL, UUID, uuid4, uuid5

from confluent_kafka import Producer

from airline_ops.config import Settings, configure_logging
from airline_ops.lake import put_json, raw_key

LOG = logging.getLogger(__name__)


def generate_events(run_id: str, flight_count=4, passengers_per_flight=3, service_date=None):
    """One schedule, gate change, delay and departure per flight, plus check-ins."""
    if not 1 <= flight_count <= 100 or not 0 <= passengers_per_flight <= 500:
        raise ValueError("flight_count must be 1..100; passengers_per_flight must be 0..500")
    run_id = str(UUID(run_id))
    day = service_date or datetime.now(UTC).date()
    events = []
    routes = [("JFK", "LAX"), ("BOS", "ORD"), ("SFO", "SEA"), ("ATL", "MIA")]
    for i in range(flight_count):
        scheduled = datetime.combine(day, datetime.min.time(), UTC) + timedelta(hours=12, minutes=i)
        flight_number = f"AO{i + 100}"
        flight_id = f"{flight_number}-{day}-{run_id}"
        origin, dest = routes[i % len(routes)]
        base = {
            "schema_version": 1,
            "run_id": run_id,
            "flight_id": flight_id,
            "flight_number": flight_number,
            "origin": origin,
            "dest": dest,
            "scheduled_dep": scheduled.isoformat(),
            "actual_dep": None,
            "delay_min": None,
            "reason": None,
            "gate": None,
            "pax_id": None,
        }

        def event(kind, minutes, *, base=base, scheduled=scheduled, flight_id=flight_id, **fields):
            row = dict(
                base,
                event_type=kind,
                timestamp=(scheduled + timedelta(minutes=minutes)).isoformat(),
                **fields,
            )
            identity = f"{run_id}/{flight_id}/{kind}/{minutes}/{fields.get('pax_id', '')}"
            row["event_id"] = str(uuid5(NAMESPACE_URL, identity))
            return row

        delay = 10 + 5 * i
        gate = f"B{i + 10}"
        events.append(event("flight_scheduled", -120, gate=f"A{i + 1}"))
        events.append(event("gate_change", -90, gate=gate))
        for p in range(passengers_per_flight):
            events.append(
                event("passenger_checkin", -60 + p / 1000, pax_id=f"{flight_id}-P{p + 1:03d}")
            )
        events.append(
            event(
                "flight_delay",
                -20,
                delay_min=delay,
                reason=["weather", "crew", "maintenance", "late_inbound"][i % 4],
            )
        )
        events.append(
            event(
                "flight_departed",
                delay,
                gate=gate,
                actual_dep=(scheduled + timedelta(minutes=delay)).isoformat(),
            )
        )
    return events


def publish_run(
    settings,
    *,
    run_id=None,
    flight_count=4,
    passengers_per_flight=3,
    service_date=None,
    interval=0.02,
    duplicates=True,
    shuffle=False,
):
    run_id = str(UUID(run_id)) if run_id else str(uuid4())
    s3 = settings.s3()
    # Do not replace a completed producer manifest when a caller reuses a run ID.
    from botocore.exceptions import ClientError

    try:
        s3.head_object(Bucket=settings.bucket, Key=f"manifests/{run_id}.json")
    except ClientError as exc:
        if exc.response["Error"]["Code"] not in ("404", "NoSuchKey", "NotFound"):
            raise
    else:
        raise ValueError(f"Run {run_id} already exists; replay it through the transform command")
    events = generate_events(run_id, flight_count, passengers_per_flight, service_date)
    unique_count = len(events)
    if duplicates:
        events += [dict(e) for e in events if e["event_type"] == "flight_delay"]
    if shuffle:
        random.Random(42).shuffle(events)
    producer = Producer(
        {
            "bootstrap.servers": settings.bootstrap,
            "enable.idempotence": True,
            "acks": "all",
            "delivery.timeout.ms": 60000,
            "client.id": "airline-simulator",
        }
    )
    delivered, errors = [], []

    def callback(timestamp_ms):
        def delivered_message(error, message):
            if error:
                errors.append(str(error))
            else:
                delivered.append(
                    raw_key(message.topic(), message.partition(), message.offset(), timestamp_ms)
                )

        return delivered_message

    for event in events:
        timestamp_ms = int(time.time() * 1000)
        producer.produce(
            settings.topic,
            key=event["flight_id"].encode(),
            value=json.dumps(event).encode(),
            timestamp=timestamp_ms,
            on_delivery=callback(timestamp_ms),
        )
        producer.poll(0)
        if interval:
            time.sleep(interval)
    remaining = producer.flush(70)
    if remaining or errors or len(delivered) != len(events):
        raise RuntimeError(f"Kafka delivery incomplete: pending={remaining}, errors={errors}")
    manifest = {
        "run_id": run_id,
        "created_at": datetime.now(UTC).isoformat(),
        "producer_count": len(delivered),
        "unique_event_count": unique_count,
        "expected_duplicates": len(events) - unique_count,
        "expected_rejected": 0,
        "expected_flights": flight_count,
        "expected_delays": flight_count,
        "expected_passengers": flight_count * passengers_per_flight,
        "raw_keys": sorted(delivered),
        "flight_ids": sorted({e["flight_id"] for e in events}),
    }
    put_json(s3, settings.bucket, f"manifests/{run_id}.json", manifest)
    LOG.info("producer_complete run_id=%s acknowledged=%s", run_id, len(delivered))
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--continuous", action="store_true")
    parser.add_argument("--interval", type=float, default=0.02)
    parser.add_argument("--flights", type=int, default=4)
    parser.add_argument("--passengers", type=int, default=3)
    parser.add_argument("--date", type=date.fromisoformat)
    parser.add_argument("--run-id", type=lambda value: str(UUID(value)))
    parser.add_argument("--shuffle", action="store_true")
    parser.add_argument("--no-duplicates", action="store_true")
    args = parser.parse_args()
    if args.interval < 0 or (args.continuous and args.run_id):
        parser.error("interval must be nonnegative; --run-id cannot be used with --continuous")
    configure_logging()
    while True:
        manifest = publish_run(
            Settings(),
            run_id=args.run_id,
            flight_count=args.flights,
            passengers_per_flight=args.passengers,
            service_date=args.date,
            interval=args.interval,
            duplicates=not args.no_duplicates,
            shuffle=args.shuffle,
        )
        print(json.dumps(manifest, indent=2))
        if not args.continuous:
            break


if __name__ == "__main__":
    main()
