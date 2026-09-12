"""Persist real test outcomes with one audit identity per PyTest invocation."""


def record_result(settings, validation_id, run_id, test_name, passed, details):
    with settings.connect() as conn:
        conn.execute(
            """
            INSERT INTO data_quality_report (validation_id, run_id, test_name, passed, details)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (validation_id, run_id, test_name)
            DO UPDATE SET passed=EXCLUDED.passed, details=EXCLUDED.details, checked_at=now()
            """,
            (validation_id, run_id, test_name, passed, details),
        )
