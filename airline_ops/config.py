"""Environment-based configuration shared by all entry points."""

import logging
import os
from dataclasses import dataclass, field

import boto3
import psycopg
from botocore.config import Config


@dataclass(frozen=True)
class Settings:
    bootstrap: str = field(
        default_factory=lambda: os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
    )
    topic: str = field(default_factory=lambda: os.getenv("KAFKA_TOPIC", "airline-events"))
    group: str = field(default_factory=lambda: os.getenv("KAFKA_GROUP_ID", "airline-raw-writer"))
    endpoint: str = field(default_factory=lambda: os.getenv("S3_ENDPOINT", "http://localhost:9000"))
    access_key: str = field(default_factory=lambda: os.getenv("S3_ACCESS_KEY", "airline"))
    secret_key: str = field(
        default_factory=lambda: os.getenv("S3_SECRET_KEY", "airline-local-only"), repr=False
    )
    bucket: str = field(default_factory=lambda: os.getenv("S3_BUCKET", "airline-raw"))
    pg_host: str = field(default_factory=lambda: os.getenv("PGHOST", "localhost"))
    pg_port: int = field(default_factory=lambda: int(os.getenv("PGPORT", "5433")))
    pg_database: str = field(default_factory=lambda: os.getenv("PGDATABASE", "airline"))
    pg_user: str = field(default_factory=lambda: os.getenv("PGUSER", "airline"))
    pg_password: str = field(
        default_factory=lambda: os.getenv("PGPASSWORD", "airline-local-only"), repr=False
    )

    @property
    def jdbc_url(self):
        return f"jdbc:postgresql://{self.pg_host}:{self.pg_port}/{self.pg_database}"

    def connect(self, **kwargs):
        return psycopg.connect(
            host=self.pg_host,
            port=self.pg_port,
            dbname=self.pg_database,
            user=self.pg_user,
            password=self.pg_password,
            connect_timeout=10,
            options="-c timezone=UTC",
            **kwargs,
        )

    def s3(self):
        return boto3.client(
            "s3",
            endpoint_url=self.endpoint,
            aws_access_key_id=self.access_key,
            aws_secret_access_key=self.secret_key,
            region_name="us-east-1",
            config=Config(s3={"addressing_style": "path"}, retries={"max_attempts": 5}),
        )


def configure_logging():
    logging.basicConfig(
        level=os.getenv("LOG_LEVEL", "INFO"),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
