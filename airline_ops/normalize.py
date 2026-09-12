"""Pure Spark transformations; malformed records remain traceable to the raw lake."""

from dataclasses import dataclass

from pyspark.sql import DataFrame, Window
from pyspark.sql import functions as F
from pyspark.sql.types import StringType, StructField, StructType

EVENT_FIELDS = [
    "schema_version",
    "run_id",
    "event_id",
    "event_type",
    "flight_id",
    "flight_number",
    "timestamp",
    "origin",
    "dest",
    "scheduled_dep",
    "actual_dep",
    "delay_min",
    "reason",
    "gate",
    "pax_id",
    "_corrupt_record",
]
EVENT_SCHEMA = StructType([StructField(name, StringType()) for name in EVENT_FIELDS])
RAW_SCHEMA = StructType([StructField(name, StringType()) for name in ["raw_key", "payload"]])
EVENT_TYPES = [
    "flight_scheduled",
    "flight_delay",
    "gate_change",
    "passenger_checkin",
    "flight_departed",
]


@dataclass
class Normalized:
    events: DataFrame
    accepted: DataFrame
    rejected: DataFrame
    flights: DataFrame
    delays: DataFrame
    passengers: DataFrame


def _first(df, keys, ordering):
    return (
        df.withColumn("_rank", F.row_number().over(Window.partitionBy(*keys).orderBy(*ordering)))
        .filter(F.col("_rank") == 1)
        .drop("_rank")
    )


def normalize(raw: DataFrame, run_id: str) -> Normalized:
    df = raw.select("raw_key", "payload", F.from_json("payload", EVENT_SCHEMA).alias("event"))
    df = df.select("raw_key", "payload", "event.*")
    for name in EVENT_FIELDS:
        df = df.withColumn(name, F.when(F.length(F.trim(F.col(name))) > 0, F.trim(F.col(name))))
    df = (
        df.withColumn("event_at", F.to_timestamp("timestamp"))
        .withColumn("scheduled_at", F.to_timestamp("scheduled_dep"))
        .withColumn("actual_at", F.to_timestamp("actual_dep"))
        .withColumn(
            "delay_value",
            F.when(F.col("delay_min").rlike(r"^\d+$"), F.col("delay_min").cast("int")),
        )
    )
    checks = []

    def require(condition, reason):
        checks.append(F.when(~F.coalesce(condition, F.lit(False)), F.lit(reason)))

    require(F.col("payload").isNotNull() & F.col("_corrupt_record").isNull(), "malformed_json")
    require(F.col("schema_version") == "1", "unsupported_schema")
    require(F.col("run_id") == run_id, "run_id_mismatch")
    for name in ["event_id", "flight_id", "flight_number"]:
        require(F.col(name).isNotNull() & (F.length(name) <= 128), f"invalid_{name}")
    require(F.col("event_type").isin(EVENT_TYPES), "unknown_event_type")
    require(
        F.col("origin").rlike("^[A-Z]{3}$")
        & F.col("dest").rlike("^[A-Z]{3}$")
        & (F.col("origin") != F.col("dest")),
        "invalid_route",
    )
    tz_pattern = r"(Z|[+-]\d{2}:\d{2})$"
    for source, casted in [("timestamp", "event_at"), ("scheduled_dep", "scheduled_at")]:
        require(F.col(source).rlike(tz_pattern) & F.col(casted).isNotNull(), f"invalid_{source}")
    delay = F.col("event_type") == "flight_delay"
    departure = F.col("event_type") == "flight_departed"
    checkin = F.col("event_type") == "passenger_checkin"
    require(~delay | F.col("delay_value").between(0, 1440), "invalid_delay_min")
    require(
        ~departure
        | (
            F.col("actual_at").isNotNull()
            & F.col("actual_dep").rlike(tz_pattern)
            & (F.col("actual_at") == F.col("event_at"))
        ),
        "invalid_actual_dep",
    )
    require(
        ~checkin | (F.col("pax_id").isNotNull() & (F.length("pax_id") <= 200)), "invalid_pax_id"
    )
    require((F.col("event_type") != "gate_change") | F.col("gate").isNotNull(), "missing_gate")
    df = (
        df.withColumn("validation_error", F.concat_ws(";", *checks))
        .withColumn("pax_id", F.when(checkin, F.col("pax_id")))
        .cache()
    )
    invalid = df.filter(F.col("validation_error") != "")
    eligible = df.filter(F.col("validation_error") == "")
    # Require an explicit schedule in the same source run. Route/schedule disagreements
    # are quarantined instead of silently creating a parent from a check-in or delay.
    parents = _first(
        eligible.filter(F.col("event_type") == "flight_scheduled"),
        ["flight_id"],
        [F.col("event_at").asc(), F.col("event_id").asc()],
    )
    parent_cols = ["origin", "dest", "scheduled_at", "flight_number"]
    parent_keys = parents.select("flight_id", *[F.col(c).alias(f"parent_{c}") for c in parent_cols])
    eligible = eligible.join(parent_keys, "flight_id", "left")
    consistent = F.col("parent_scheduled_at").isNotNull()
    for name in parent_cols:
        consistent = consistent & (F.col(name) == F.col(f"parent_{name}"))
    eligible = eligible.withColumn(
        "validation_error",
        F.when(F.coalesce(consistent, F.lit(False)), F.lit("")).otherwise(
            F.lit("missing_or_conflicting_schedule")
        ),
    ).cache()
    invalid = invalid.unionByName(
        eligible.filter(F.col("validation_error") != ""), allowMissingColumns=True
    )
    accepted = eligible.filter(F.col("validation_error") == "")
    # A booking ID belongs to one flight. Reject every conflicting assignment.
    conflicting_pax = (
        accepted.filter(F.col("event_type") == "passenger_checkin")
        .groupBy("pax_id")
        .agg(F.countDistinct("flight_id").alias("n"))
        .filter("n > 1")
        .select("pax_id")
        .withColumn("conflict", F.lit(True))
    )
    accepted = accepted.join(conflicting_pax, "pax_id", "left")
    invalid = invalid.unionByName(
        accepted.filter(F.col("conflict").isNotNull()).withColumn(
            "validation_error", F.lit("booking_assigned_to_multiple_flights")
        ),
        allowMissingColumns=True,
    )
    accepted = accepted.filter(F.col("conflict").isNull()).drop("conflict")
    # Drop producer retries by ID, then natural duplicates even with a new event_id.
    # Hash order makes tie-breaking independent of Kafka arrival or Spark partition order.
    accepted = accepted.withColumn("payload_hash", F.sha2("payload", 256)).cache()
    events = _first(accepted, ["event_id"], [F.col("payload_hash").asc(), F.col("raw_key").asc()])
    events = _first(
        events,
        ["event_type", "flight_id", "event_at", "pax_id"],
        [F.col("event_id").asc(), F.col("raw_key").asc()],
    ).cache()
    latest_order = [F.col("event_at").desc(), F.col("event_id").desc()]
    states = _first(
        events.filter(
            F.col("event_type").isin("flight_scheduled", "flight_delay", "flight_departed")
        ),
        ["flight_id"],
        latest_order,
    )
    gates = _first(events.filter(F.col("gate").isNotNull()), ["flight_id"], latest_order)
    flights = states.select(
        "flight_id",
        F.lit(run_id).alias("source_run_id"),
        "flight_number",
        F.to_date("scheduled_at").alias("flight_date"),
        "origin",
        "dest",
        F.col("scheduled_at").alias("scheduled_dep"),
        F.when(F.col("event_type") == "flight_departed", F.col("actual_at")).alias("actual_dep"),
        F.when(F.col("event_type") == "flight_departed", "departed")
        .when(F.col("event_type") == "flight_delay", "delayed")
        .otherwise("scheduled")
        .alias("status"),
        F.col("event_at").alias("last_event_at"),
        F.col("event_id").alias("last_event_id"),
    ).join(gates.select("flight_id", "gate"), "flight_id", "left")
    delays = events.filter(F.col("event_type") == "flight_delay").select(
        F.sha2(F.to_json(F.struct("flight_id", "event_at")), 256).alias("delay_id"),
        "flight_id",
        F.col("delay_value").alias("delay_min"),
        F.coalesce("reason", F.lit("unspecified")).alias("reason"),
        F.col("event_at").alias("occurred_at"),
    )
    passengers = _first(
        events.filter(F.col("event_type") == "passenger_checkin"),
        ["pax_id"],
        [F.col("event_at").asc(), F.col("event_id").asc()],
    ).select(
        "pax_id",
        "flight_id",
        F.col("event_at").alias("checkin_time"),
    )
    rejected = invalid.select(
        F.sha2(F.concat(F.lit(run_id), F.col("raw_key")), 256).alias("rejection_id"),
        F.lit(run_id).alias("run_id"),
        "raw_key",
        F.col("validation_error").alias("reason"),
        "payload",
    )
    return Normalized(events, accepted, rejected, flights, delays, passengers)
