import base64
import json
from unittest.mock import MagicMock

import pytest

from airline_ops.consumer import land_message, process_message
from airline_ops.lake import raw_key, wait_for_raw


@pytest.fixture
def message():
    msg = MagicMock()
    msg.topic.return_value = "airline-events"
    msg.partition.return_value = 2
    msg.offset.return_value = 17
    msg.timestamp.return_value = (1, 1789257599000)  # Stable across midnight redeliveries.
    msg.value.return_value = b'{"event_type":"flight_delay"}'
    return msg


def test_commit_only_after_successful_storage(message):
    calls = MagicMock()
    consumer, s3 = calls.consumer, calls.s3
    process_message(message, consumer, s3, "raw")
    assert [call[0] for call in calls.mock_calls] == ["s3.put_object", "consumer.commit"]
    consumer.commit.assert_called_once_with(message=message, asynchronous=False)


def test_storage_failure_does_not_acknowledge_message(message):
    s3, consumer = MagicMock(), MagicMock()
    s3.put_object.side_effect = ConnectionError("MinIO unavailable")
    with pytest.raises(ConnectionError):
        process_message(message, consumer, s3, "raw")
    consumer.commit.assert_not_called()


def test_commit_failure_redelivery_reuses_raw_object(message):
    s3, consumer = MagicMock(), MagicMock()
    consumer.commit.side_effect = [RuntimeError("rebalance"), None]
    with pytest.raises(RuntimeError):
        process_message(message, consumer, s3, "raw")
    process_message(message, consumer, s3, "raw")
    keys = [call.kwargs["Key"] for call in s3.put_object.call_args_list]
    assert len(set(keys)) == 1
    assert "partition=2/offset=00000000000000000017.json" in keys[0]


def test_non_utf8_payload_is_preserved(message):
    s3 = MagicMock()
    message.value.return_value = b"\xff\xfe"
    land_message(message, s3, "raw")
    envelope = json.loads(s3.put_object.call_args.kwargs["Body"])
    assert envelope["payload"] is None
    assert base64.b64decode(envelope["payload_base64"]) == b"\xff\xfe"


def test_partition_date_uses_utc():
    assert raw_key("events", 0, 0, 0).startswith("raw/date=1970-01-01/")


def test_wait_for_raw_fails_on_incomplete_run():
    from botocore.exceptions import ClientError

    settings = MagicMock()
    settings.s3().head_object.side_effect = ClientError({"Error": {"Code": "404"}}, "HeadObject")
    with pytest.raises(TimeoutError, match="1 acknowledged Kafka records"):
        wait_for_raw(settings, {"raw_keys": ["missing.json"]}, timeout=0)
