-- UTC is used throughout. Migrations must be additive; never let Spark recreate these tables.
CREATE TABLE IF NOT EXISTS pipeline_runs (
    run_id TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    transformed_at TIMESTAMPTZ,
    producer_count BIGINT NOT NULL CHECK (producer_count >= 0),
    raw_count BIGINT NOT NULL DEFAULT 0 CHECK (raw_count >= 0),
    valid_count BIGINT NOT NULL DEFAULT 0 CHECK (valid_count >= 0),
    rejected_count BIGINT NOT NULL DEFAULT 0 CHECK (rejected_count >= 0),
    duplicate_count BIGINT NOT NULL DEFAULT 0 CHECK (duplicate_count >= 0),
    status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
    error TEXT,
    manifest JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS flights (
    flight_id TEXT PRIMARY KEY,
    source_run_id TEXT NOT NULL REFERENCES pipeline_runs(run_id),
    flight_number TEXT NOT NULL,
    flight_date DATE NOT NULL,
    origin VARCHAR(3) NOT NULL CHECK (origin ~ '^[A-Z]{3}$'),
    dest VARCHAR(3) NOT NULL CHECK (dest ~ '^[A-Z]{3}$' AND dest <> origin),
    scheduled_dep TIMESTAMPTZ NOT NULL,
    actual_dep TIMESTAMPTZ,
    status TEXT NOT NULL CHECK (status IN ('scheduled', 'delayed', 'departed')),
    gate TEXT,
    last_event_at TIMESTAMPTZ NOT NULL,
    last_event_id TEXT NOT NULL,
    UNIQUE (source_run_id, flight_number, flight_date),
    CHECK (flight_date = (scheduled_dep AT TIME ZONE 'UTC')::date),
    CHECK ((status = 'departed') = (actual_dep IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS delays (
    delay_id TEXT PRIMARY KEY,
    flight_id TEXT NOT NULL REFERENCES flights(flight_id),
    delay_min INTEGER NOT NULL CHECK (delay_min BETWEEN 0 AND 1440),
    reason TEXT NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    UNIQUE (flight_id, occurred_at)
);

-- pax_id is a synthetic flight-specific booking ID, not a reusable person ID.
CREATE TABLE IF NOT EXISTS passengers (
    pax_id TEXT PRIMARY KEY,
    flight_id TEXT NOT NULL REFERENCES flights(flight_id),
    checkin_time TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS rejected_events (
    rejection_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES pipeline_runs(run_id),
    raw_key TEXT NOT NULL,
    reason TEXT NOT NULL,
    payload TEXT,
    rejected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (run_id, raw_key)
);

CREATE TABLE IF NOT EXISTS data_quality_report (
    report_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    validation_id UUID NOT NULL,
    run_id TEXT NOT NULL REFERENCES pipeline_runs(run_id),
    test_name TEXT NOT NULL,
    passed BOOLEAN NOT NULL,
    details TEXT NOT NULL,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (validation_id, run_id, test_name)
);

CREATE INDEX IF NOT EXISTS delays_flight_idx ON delays(flight_id);
CREATE INDEX IF NOT EXISTS passengers_flight_idx ON passengers(flight_id);
CREATE INDEX IF NOT EXISTS flights_run_idx ON flights(source_run_id);
CREATE INDEX IF NOT EXISTS quality_run_idx ON data_quality_report(run_id, checked_at);
