"""Spark session with build-time S3A and PostgreSQL driver dependencies."""

import os
from pathlib import Path

from pyspark.sql import SparkSession


def create_spark(settings, name="airline-ops"):
    jars = sorted(Path(os.getenv("SPARK_JARS_DIR", "/opt/spark-jars")).glob("*.jar"))
    builder = (
        SparkSession.builder.appName(name)
        .master(os.getenv("SPARK_MASTER", "local[2]"))
        .config("spark.driver.memory", os.getenv("SPARK_DRIVER_MEMORY", "1g"))
        .config("spark.sql.session.timeZone", "UTC")
        .config("spark.sql.ansi.enabled", "false")
        .config("spark.sql.shuffle.partitions", "2")
        .config("spark.default.parallelism", "2")
        .config("spark.ui.enabled", "false")
        .config("spark.hadoop.fs.s3a.endpoint", settings.endpoint)
        .config("spark.hadoop.fs.s3a.access.key", settings.access_key)
        .config("spark.hadoop.fs.s3a.secret.key", settings.secret_key)
        .config("spark.hadoop.fs.s3a.path.style.access", "true")
        .config(
            "spark.hadoop.fs.s3a.connection.ssl.enabled",
            str(settings.endpoint.startswith("https:")).lower(),
        )
        .config(
            "spark.hadoop.fs.s3a.aws.credentials.provider",
            "org.apache.hadoop.fs.s3a.SimpleAWSCredentialsProvider",
        )
        .config("spark.hadoop.fs.s3a.impl", "org.apache.hadoop.fs.s3a.S3AFileSystem")
    )
    if jars:
        builder = builder.config("spark.jars", ",".join(str(jar) for jar in jars))
    spark = builder.getOrCreate()
    spark.sparkContext.setLogLevel("WARN")
    return spark
