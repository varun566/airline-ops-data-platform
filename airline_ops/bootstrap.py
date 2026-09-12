"""Idempotently create the topic, private bucket and database schema."""

from pathlib import Path

from botocore.exceptions import ClientError
from confluent_kafka import KafkaException
from confluent_kafka.admin import AdminClient, NewTopic

from airline_ops.config import Settings, configure_logging


def main():
    configure_logging()
    settings = Settings()
    admin = AdminClient({"bootstrap.servers": settings.bootstrap})
    futures = admin.create_topics([NewTopic(settings.topic, 3, 1)])
    for future in futures.values():
        try:
            future.result(timeout=30)
        except KafkaException as exc:
            if exc.args[0].name() != "TOPIC_ALREADY_EXISTS":
                raise
    s3 = settings.s3()
    try:
        s3.create_bucket(Bucket=settings.bucket)
    except ClientError as exc:
        if exc.response["Error"]["Code"] != "BucketAlreadyOwnedByYou":
            raise
    with settings.connect() as conn:
        conn.execute(Path("sql/001_schema.sql").read_text())
    print("Bootstrap complete: Kafka topic, MinIO bucket, PostgreSQL schema")


if __name__ == "__main__":
    main()
