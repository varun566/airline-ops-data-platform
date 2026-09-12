# Troubleshooting and recovery playbook

Run all commands from the repository root. Start with:

```bash
docker compose ps -a
docker compose logs --tail=100 bootstrap consumer demo
docker info
```

`bootstrap` and `demo` should exit with code 0. The consumer and infrastructure
should stay up. Do not delete volumes as a first response to a failed test.

## Kafka consumer lag or missing raw objects

**Symptoms:** `wait_for_raw` times out, `demo` reports acknowledged records missing
from MinIO, or the consumer stops logging `raw_landed`.

```bash
docker compose exec kafka kafka-consumer-groups --bootstrap-server kafka:29092 \
  --describe --group airline-raw-writer
docker compose logs --tail=100 consumer kafka minio
docker compose exec kafka kafka-topics --bootstrap-server kafka:29092 \
  --describe --topic airline-events
```

1. Compare `CURRENT-OFFSET`, `LOG-END-OFFSET`, and `LAG`. A newly created group may
   not yet have committed offsets. Check MinIO errors before increasing throughput.
2. The consumer commits each message only after a successful `PutObject`. Storage
   errors terminate it; Compose restarts it, and the uncommitted record is retried.
   A commit failure can redeliver an already saved record; the object key is stable.
3. Containers use `kafka:29092`; host clients use `localhost:9092`. Never configure
   a container with `localhost:9092`. If the host port changes, the advertised
   external listener changes through `KAFKA_PORT` too.
4. Inspect available memory and MinIO disk usage. One object and synchronous commit
   per record favors transparent replay semantics over throughput in this demo.
5. Increase the transform wait only after investigating the lag:

```bash
docker compose run --rm transform python -m airline_ops.transform \
  --run-id <RUN_UUID> --timeout 300
```

To replay raw records without changing the primary group's offsets, stop the main
consumer and start a separate temporary group. It will overwrite the same raw keys:

```bash
docker compose stop consumer
docker compose run --rm -e KAFKA_GROUP_ID=airline-recovery consumer
# Stop the temporary consumer with Ctrl-C when it catches up.
docker compose up -d consumer
```

The broker retains records for 24 hours. Kafka-reading integrity checks for an old
run can fail after retention, even though its MinIO objects and PostgreSQL rows
remain. Use a fresh demo for delivery verification; a Spark replay can still use
the raw lake after Kafka retention.

## PostgreSQL connection, authentication, or schema failures

```bash
docker compose exec postgres pg_isready -U airline -d airline
docker compose logs --tail=100 postgres bootstrap
docker compose exec postgres psql -U airline -d airline -c '\dt'
docker compose exec postgres psql -U airline -d airline -c \
  'SELECT run_id, status, error FROM pipeline_runs ORDER BY created_at DESC LIMIT 5'
```

- Host tools connect to `localhost:5433`; application containers connect to
  `postgres:5432`. Check `.env` for an overridden host port.
- The default database/user is `airline`. The local password defaults to
  `airline-local-only`. Changing `POSTGRES_PASSWORD` after volume initialization
  does not change the stored role password. Update the role and app configuration
  together, or intentionally reset the disposable demo volume.
- `bootstrap` reruns the idempotent schema script, including on existing volumes.
  `CREATE TABLE IF NOT EXISTS` is not a schema migration engine. Future table
  changes require numbered SQL migrations; restarting will not alter an old table.
- An FK or check violation makes the **entire final merge roll back**, including
  flight changes made before a child-row failure. Inspect rejected records and the
  error first; do not remove constraints to make a load pass.

## MinIO or S3A failures

```bash
docker compose exec minio curl -f http://localhost:9000/minio/health/live
docker compose logs --tail=100 minio bootstrap
```

`NoSuchBucket` means bootstrap failed or `S3_BUCKET` changed. `AccessDenied` usually
means app credentials disagree with MinIO. `UnknownHostException: airline-raw...`
suggests path-style addressing was disabled. Both boto3 and S3A use path-style
requests against `http://minio:9000` inside Compose.

The Dockerfile fetches matching Hadoop AWS 3.3.4, AWS SDK bundle 1.12.262, and
PostgreSQL JDBC 42.7.8 jars at build time. `ClassNotFoundException` or `NoSuchMethodError`
after dependency changes commonly indicates missing or mismatched jars. Rebuild
the app; do not add an arbitrary second AWS SDK version at runtime.

## PySpark memory, Java, and performance

```bash
docker stats --no-stream
docker compose logs --tail=150 demo
docker compose run --rm --no-deps tests java -version
```

- Exit 137 or an abruptly disconnected Py4J gateway often indicates the container
  was killed for memory usage. Confirm with `docker inspect <container>` and inspect
  `State.OOMKilled`; a gateway error alone does not prove an OOM.
- Allocate 8 GB to Docker. Spark defaults to `local[2]`, a 1 GB driver heap, two
  shuffle partitions, and a 3 GB container limit. Avoid running several Spark test
  containers at once on a laptop.
- For larger runs, set `SPARK_DRIVER_MEMORY=2g` in `.env` and raise `mem_limit` for
  demo/transform/tests to leave room for Python, native memory, and Java overhead.
  Restart the job so the new driver heap takes effect.
- Excess small JSON files increase listing and task overhead. Manifests explicitly
  bound this demo's input; production pipelines should compact small objects and
  use partition pruning and appropriately sized Parquet files.
- Python 3.11 and Java 17 are installed in the app image. Host Python 3.14 is not
  supported by this pinned Spark stack; use the container commands in the README.

## Failed runs, rejected rows, and staging cleanup

```sql
SELECT run_id, raw_key, reason, payload FROM rejected_events;
SELECT test_name, details, checked_at FROM data_quality_report WHERE NOT passed;
SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'stage_%';
```

Each transform writes to a fresh staging schema, then performs one short merge.
Ordinary failures clean up staging in `finally`. A process killed before cleanup
may leave a `stage_<uuid>` schema. Stop or finish all transform jobs, confirm no
active job owns that schema, and drop only the identified stale schema. Replay
the original manifest with `--run-id`; raw data does not need to be republished.

Two simultaneous transforms of the same run produce `already being transformed`.
Wait for the active job. PostgreSQL releases its advisory lock when the connection
closes, including after a crash. A run stuck at `pending` can be retried after its
old job is gone. Historical quality reports remain available after a later success.

Malformed payloads keep their original MinIO objects and get a reason in
`rejected_events`. The built-in simulator expects zero rejects, so a new rejection
fails the expected-count integrity check. Fix the source or transformation logic
and publish a corrected new simulation; do not edit a completed raw manifest.

If PostgreSQL itself is unavailable, PyTest still reports a failure in the console
but cannot persist that outcome to the same unavailable database. The reporting
hook emits a warning, and CI retains the service logs.

## Startup, ports, image downloads, and reset

- `Cannot connect to the Docker daemon`: start Docker Desktop/Engine first.
- `address already in use`: change `KAFKA_PORT`, `POSTGRES_PORT`, `MINIO_PORT`, or
  `MINIO_CONSOLE_PORT` in `.env`. Defaults are 9092, 5433, 9000, and 9001.
- Image pull/build timeout: verify registry connectivity and retry. MinIO is pinned
  to its available Quay image. Maven and PyPI are needed only during image build.
- The first startup can take several minutes. Healthchecks gate bootstrap and the
  consumer; inspect the unhealthy service's own logs before changing retries.
- `docker compose down` preserves data. `docker compose down -v` irreversibly
  removes this project's named volumes; use only for an intentional demo reset.
