"""At-least-once Kafka consumer with replay-safe raw landing."""

import base64
import logging
import signal
from datetime import UTC, datetime

from confluent_kafka import Consumer, KafkaException

from airline_ops.config import Settings, configure_logging
from airline_ops.lake import put_json, raw_key

LOG = logging.getLogger(__name__)


def land_message(message, s3, bucket):
    """Save before committing. A crash between these steps overwrites the same key."""
    timestamp_ms = max(0, message.timestamp()[1])
    key = raw_key(message.topic(), message.partition(), message.offset(), timestamp_ms)
    value = message.value()
    encoded = None
    try:
        payload = value.decode("utf-8") if value is not None else None
    except UnicodeDecodeError:
        payload = None
        encoded = base64.b64encode(value).decode("ascii")
    envelope = {
        "payload": payload,
        "payload_base64": encoded,
        "topic": message.topic(),
        "partition": message.partition(),
        "offset": message.offset(),
        "kafka_timestamp_ms": timestamp_ms,
        "raw_key": key,
        "ingested_at": datetime.now(UTC).isoformat(),
    }
    put_json(s3, bucket, key, envelope)
    return key


def process_message(message, consumer, s3, bucket):
    key = land_message(message, s3, bucket)
    consumer.commit(message=message, asynchronous=False)
    return key


def main():
    configure_logging()
    settings = Settings()
    consumer = Consumer(
        {
            "bootstrap.servers": settings.bootstrap,
            "group.id": settings.group,
            "auto.offset.reset": "earliest",
            "enable.auto.commit": False,
            "enable.auto.offset.store": False,
            "max.poll.interval.ms": 300000,
        }
    )
    s3 = settings.s3()
    stopping = False

    def stop(_signal, _frame):
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    consumer.subscribe([settings.topic])
    landed = 0
    try:
        while not stopping:
            message = consumer.poll(1)
            if message is None:
                continue
            if message.error():
                raise KafkaException(message.error())
            key = process_message(message, consumer, s3, settings.bucket)
            landed += 1
            LOG.info("raw_landed session_count=%s key=%s", landed, key)
    finally:
        consumer.close()
        LOG.info("consumer_stopped session_count=%s", landed)


if __name__ == "__main__":
    main()
