# Presenting AeroStream to a recruiter

**[Public dashboard](https://aerostream-airline-ops.venkatanagulapalli00.chatgpt.site)** · [Source code](https://github.com/varun566/airline-ops-data-platform)

Start with the dashboard and one concrete result. Use the local dashboard at
http://localhost:8088 for a live interview; the public portfolio demo works without
installing anything and is clearly labeled as recorded synthetic data.

## A 60-second introduction

> I built a containerized airline operations data platform. A Python producer sends
> simulated delays, gate changes, and check-ins to Kafka. A consumer preserves the
> original JSON in MinIO, and PySpark transforms it into constrained PostgreSQL
> tables. I focused on reliability: duplicate messages, out-of-order events,
> failed loads, and safe replay. PyTest verifies counts and constraints against the
> real services and records the results in the database. I built this dashboard so
> you can follow a flight from its original events to its final database state.

## A three-minute demo

1. **Overview, 30 seconds.** Point out four flights, 32 ingested events, 12 bookings,
   and 11 checks for the selected run. Explain that this is a deliberately small
   synthetic sample you can inspect completely.
2. **Flight details, 45 seconds.** Open AO102. Show SFO → SEA, gate B12, a 20-minute
   delay, and its departure. Open an event to show the original JSON and raw key.
   Explain that final state follows event time, even when arrival order is shuffled.
3. **Pipeline runs, 30 seconds.** Show `32 = 28 unique + 4 duplicates + 0 rejected`.
   Explain why the same flight number appears across independent simulations:
   instance IDs include the run UUID. Replaying one existing run keeps rows stable.
4. **Data quality, 45 seconds.** Expand delivery reconciliation, foreign key
   enforcement, atomic rollback, and replay safety. These are actual persisted
   test results, not decorative status indicators.
5. **Architecture, 30 seconds.** Connect the five stages. End with one tradeoff:
   ingestion streams continuously, while transformation uses bounded manifests.

For a live interview, click **Run simulation** before the explanation. When it
finishes, **Latest run** displays the new flight instances and fresh test report.
The public snapshot uses **Project walkthrough** instead.

## Questions to be ready for

- **Exactly once?** Delivery is at least once. The consumer persists before committing
  offsets. Deterministic raw keys and database constraints make retries and replay safe.
- **Why MinIO?** It provides a local S3-compatible raw data lake. ADLS provisioning
  and Azure authentication are not implemented in this project.
- **Why Spark batch jobs?** A completed manifest provides a reproducible boundary.
  Continuous ingestion alone does not schedule transformations.
- **What would change at scale?** Compact small JSON objects into Parquet, schedule
  incremental loads, add a schema registry, replicate services, and measure throughput
  and latency. No production-scale benchmark is claimed here.
- **What does the public link run?** An interactive React UI over a recorded export.
  Docker runs the real pipeline locally; no laptop service is exposed publicly.

## Resume bullets

- Built a Docker Compose airline event platform using Python, Kafka, MinIO,
  PySpark, and PostgreSQL, with raw-event lineage, constrained relational models,
  deduplication, and transactional loads.
- Implemented replay and data-integrity checks with PyTest and GitHub Actions;
  developed a React/TypeScript dashboard for flight drill-downs, pipeline accounting,
  persisted quality reports, and local end-to-end simulations.

Link the public dashboard and GitHub repository next to these bullets. Describe
measured behavior and design choices; avoid invented throughput or business impact.
