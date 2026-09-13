"use client";

import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Braces,
  Check,
  CheckCheck,
  ChevronRight,
  Clock3,
  Code2,
  Database,
  FileJson,
  GitBranch,
  Layers3,
  Plane,
  Radio,
  ShieldCheck,
  Users,
  Workflow,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  AIRPORTS,
  SOURCE,
  date,
  shortId,
  time,
  type Check as QualityCheck,
  type Event,
  type Flight,
  type Platform,
  type Run,
} from "@/lib/platform";

const checkNames: Record<string, [string, string]> = {
  test_kafka_delivery_count_matches_consumer_landing: [
    "Kafka → lake delivery",
    "Every acknowledged offset and original payload exists in MinIO.",
  ],
  test_postgres_row_counts: [
    "Relational row counts",
    "Flights, delay observations, and bookings match the producer manifest.",
  ],
  test_no_orphan_delays_or_passengers: [
    "No orphan records",
    "Every delay and passenger booking references an existing flight.",
  ],
  test_foreign_key_is_enforced_by_postgres: [
    "Foreign key enforcement",
    "PostgreSQL rejects a delay referencing a nonexistent flight.",
  ],
  test_negative_delay_is_rejected_by_postgres: [
    "Valid delay values",
    "A database constraint rejects negative delay values.",
  ],
  test_failed_child_load_rolls_back_parent_update: [
    "Atomic rollback",
    "An invalid child row rolls back the parent update in the same transaction.",
  ],
  test_no_duplicate_flight_ids_per_date: [
    "Unique flight instances",
    "Flight instances and flight numbers are unique within each run and date.",
  ],
  test_raw_event_accounting: [
    "Balanced event accounting",
    "Raw events equal unique accepted events, duplicates, and rejects.",
  ],
  test_latest_flight_state_and_types: [
    "Correct final flight state",
    "Departures, gates, service dates, and timestamps are correctly typed.",
  ],
  test_transform_replay_is_idempotent: [
    "Replay safety",
    "Loading the same raw batch again leaves record counts and flight state unchanged.",
  ],
  test_quality_report_persists_results: [
    "Audit report persistence",
    "Test outcomes are committed to the data_quality_report table.",
  ],
};
export const eventLabel = (value: string) =>
  ({
    flight_scheduled: "Flight scheduled",
    flight_delay: "Delay reported",
    gate_change: "Gate updated",
    passenger_checkin: "Passenger checked in",
    flight_departed: "Flight departed",
  })[value] || value;

export function RunsView({
  data,
  run,
  onSelect,
}: {
  data: Platform;
  run?: Run;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="view-stack">
      <section className="panel">
        <div className="panel-heading section-heading">
          <div>
            <h2>Pipeline history</h2>
            <p>
              Each simulation has its own manifest, raw offsets, and flight
              instances.
            </p>
          </div>
          <span className="count-chip">{data.runs.length} runs</span>
        </div>
        <Table className="flight-table runs-table">
          <TableHeader>
            <TableRow>
              <TableHead>Run</TableHead>
              <TableHead>Started · UTC</TableHead>
              <TableHead>Raw</TableHead>
              <TableHead>Unique</TableHead>
              <TableHead>Duplicates</TableHead>
              <TableHead>Rejected</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.runs.map((r) => (
              <TableRow
                key={r.run_id}
                data-state={r.run_id === run?.run_id ? "selected" : undefined}
              >
                <TableCell>
                  <button
                    className="run-id-button"
                    onClick={() => onSelect(r.run_id)}
                  >
                    <Workflow size={16} />
                    <code>{shortId(r.run_id)}</code>
                    {r.run_id === run?.run_id && (
                      <span className="selected-tag">Selected</span>
                    )}
                  </button>
                </TableCell>
                <TableCell>
                  <strong>{date(r.created_at)}</strong>
                  <small>{time(r.created_at)}</small>
                </TableCell>
                <TableCell>{r.raw_count}</TableCell>
                <TableCell>{r.valid_count}</TableCell>
                <TableCell>{r.duplicate_count}</TableCell>
                <TableCell>{r.rejected_count}</TableCell>
                <TableCell>
                  <span
                    className={`status ${r.status === "completed" ? "departed" : r.status}`}
                  >
                    {r.status === "completed" ? (
                      <Check size={12} />
                    ) : (
                      <Clock3 size={12} />
                    )}{" "}
                    {r.status}
                  </span>
                </TableCell>
                <TableCell>
                  <button
                    className="icon-button"
                    onClick={() => onSelect(r.run_id)}
                    aria-label={`Select run ${shortId(r.run_id)}`}
                  >
                    <ChevronRight size={16} />
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
      {run && (
        <section className="panel accounting-panel">
          <div>
            <span className="eyebrow">RUN {shortId(run.run_id)}</span>
            <h2>Nothing gets lost between stages.</h2>
            <p>
              Every landed event is accounted for before the database merge.
            </p>
          </div>
          <div className="accounting-equation">
            <span>
              <strong>{run.raw_count}</strong>Raw events
            </span>
            <b>=</b>
            <span className="good">
              <strong>{run.valid_count}</strong>Unique accepted
            </span>
            <b>+</b>
            <span>
              <strong>{run.duplicate_count}</strong>Duplicates
            </span>
            <b>+</b>
            <span>
              <strong>{run.rejected_count}</strong>Rejected
            </span>
          </div>
          {run.error && <p className="inline-error">{run.error}</p>}
        </section>
      )}
      <section className="context-note">
        <GitBranch size={20} />
        <div>
          <h3>Same flight number. Different simulation.</h3>
          <p>
            AO100 can appear in several runs. Each flight’s ID includes its
            service date and run UUID, so repeating the demo creates a new
            flight instance. Replaying an existing run keeps its rows unchanged.
          </p>
        </div>
      </section>
    </div>
  );
}

export function QualityView({
  checks,
  run,
}: {
  checks: QualityCheck[];
  run?: Run;
}) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const pass = checks.filter((c) => c.passed).length;
  return (
    <div className="view-stack">
      <section className="quality-summary panel">
        <span
          className={`quality-emblem ${pass !== checks.length ? "warn" : ""}`}
        >
          <ShieldCheck size={35} />
        </span>
        <div>
          <span className="eyebrow">LATEST VALIDATION FOR THIS RUN</span>
          <h2>
            {checks.length === 0
              ? "Awaiting validation"
              : pass === checks.length
                ? "Data you can trace. Checks you can verify."
                : "Some checks need attention."}
          </h2>
          <p>
            {pass} of {checks.length} recorded checks passed. Outcomes come
            directly from PyTest and PostgreSQL.
          </p>
        </div>
        <div className="quality-percent">
          <strong>
            {checks.length ? Math.round((pass / checks.length) * 100) : 0}%
          </strong>
          <span>pass rate</span>
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading section-heading">
          <div>
            <h2>Integrity checks</h2>
            <p>
              Validation{" "}
              {checks[0] ? shortId(checks[0].validation_id) : "pending"} · Run{" "}
              {run ? shortId(run.run_id) : "—"}
            </p>
          </div>
          <span className="recorded-label">
            <Database size={14} /> Persisted results
          </span>
        </div>
        <div className="check-list">
          {checks.map((c) => {
            const key = c.test_name.split("::").at(-1) || c.test_name;
            const [title, description] = checkNames[key] || [
              key.replaceAll("_", " "),
              "Recorded pipeline assertion.",
            ];
            return (
              <div className="check-item" key={c.report_id}>
                <button
                  className="check-row"
                  onClick={() =>
                    setExpanded(expanded === c.report_id ? null : c.report_id)
                  }
                  aria-expanded={expanded === c.report_id}
                >
                  <span className={`check-symbol ${c.passed ? "" : "failed"}`}>
                    {c.passed ? <Check size={16} /> : <X size={16} />}
                  </span>
                  <span className="check-copy">
                    <strong>{title}</strong>
                    <span>{description}</span>
                  </span>
                  <span
                    className={`status ${c.passed ? "departed" : "failed"}`}
                  >
                    {c.passed ? "Passed" : "Failed"}
                  </span>
                  <ChevronRight
                    size={15}
                    className={expanded === c.report_id ? "rotated" : ""}
                  />
                </button>
                {expanded === c.report_id && (
                  <div className="check-detail">
                    <code>{c.test_name}</code>
                    <p>{c.details}</p>
                    <small>
                      Checked {date(c.checked_at)} at {time(c.checked_at)} UTC
                    </small>
                  </div>
                )}
              </div>
            );
          })}
          {!checks.length && (
            <p className="empty-state">
              No quality report has been recorded for this run yet.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

const stages = [
  {
    name: "Simulate",
    tech: "Python + Kafka",
    icon: Radio,
    number: "01",
    title: "Operational signals become an event stream.",
    description:
      "The producer generates flight schedules, gate changes, delays, departures, and passenger check-ins. A manifest records only acknowledged Kafka offsets. Flight ID keys keep each flight’s records on one partition.",
    proof: "32 acknowledged records per default run",
    file: "airline_ops/producer.py",
  },
  {
    name: "Land",
    tech: "Python + MinIO",
    icon: FileJson,
    number: "02",
    title: "Persist first. Acknowledge second.",
    description:
      "The consumer archives the original JSON before committing its Kafka offset. Date, topic, partition, and offset form a deterministic object key. Redelivery writes to the same key, including across midnight.",
    proof: "Raw payload bytes and Kafka offsets verified",
    file: "airline_ops/consumer.py",
  },
  {
    name: "Transform",
    tech: "PySpark",
    icon: Workflow,
    number: "03",
    title: "Turn noisy events into a coherent data model.",
    description:
      "Spark casts types, validates routes and timestamps, quarantines invalid records, and removes duplicate IDs and composite keys. Event time determines the final flight state, even when arrival order is shuffled.",
    proof: "28 unique events · 4 duplicates removed",
    file: "airline_ops/normalize.py",
  },
  {
    name: "Model",
    tech: "PostgreSQL + JDBC",
    icon: Database,
    number: "04",
    title: "Enforce integrity where the records live.",
    description:
      "Spark writes to isolated staging tables via JDBC. PostgreSQL merges parents and children in one transaction with primary keys, foreign keys, and check constraints intact. Reprocessing a run keeps its rows stable.",
    proof: "Atomic rollback and replay verified by tests",
    file: "airline_ops/transform.py",
  },
  {
    name: "Validate",
    tech: "PyTest",
    icon: ShieldCheck,
    number: "05",
    title: "Make reliability visible and repeatable.",
    description:
      "Tests read real Kafka offsets, compare raw payloads, verify database counts and constraints, and replay the transformation. Each test outcome is saved to data_quality_report. GitHub Actions runs the entire stack.",
    proof: "Unit coverage + 11 pipeline integration tests",
    file: "tests/integration/test_pipeline.py",
  },
];

export function ArchitectureView({ onExplore }: { onExplore: () => void }) {
  const [active, setActive] = useState(0);
  const stage = stages[active];
  return (
    <div className="view-stack">
      <section className="architecture-intro">
        <div>
          <span className="eyebrow">THE ENGINEERING BEHIND THE BOARD</span>
          <h2>
            From operational noise
            <br />
            to dependable records.
          </h2>
          <p>
            A containerized data platform with a streaming ingestion layer, a
            raw data lake, and a tested relational model.
          </p>
        </div>
        <a
          className="architecture-source"
          href={SOURCE}
          target="_blank"
          rel="noreferrer"
        >
          <GitBranch size={20} />
          <span>
            Explore the implementation<small>Open source on GitHub</small>
          </span>
          <ArrowUpRight size={20} />
        </a>
      </section>
      <section className="panel architecture-panel">
        <div className="stage-tabs" role="tablist" aria-label="Pipeline stages">
          {stages.map((s, i) => (
            <button
              role="tab"
              aria-selected={i === active}
              aria-controls="stage-details"
              tabIndex={i === active ? 0 : -1}
              onKeyDown={(event) => {
                const next =
                  event.key === "ArrowRight"
                    ? (i + 1) % stages.length
                    : event.key === "ArrowLeft"
                      ? (i + stages.length - 1) % stages.length
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? stages.length - 1
                          : null;
                if (next !== null) {
                  event.preventDefault();
                  setActive(next);
                  document.getElementById(`stage-${next}`)?.focus();
                }
              }}
              id={`stage-${i}`}
              key={s.name}
              onClick={() => setActive(i)}
              className={i === active ? "active" : ""}
            >
              <span className="stage-number">{s.number}</span>
              <s.icon size={24} />
              <strong>{s.name}</strong>
              <small>{s.tech}</small>
              {i < 4 && <ArrowRight className="stage-arrow" size={15} />}
            </button>
          ))}
        </div>
        <div
          className="stage-details"
          role="tabpanel"
          id="stage-details"
          aria-labelledby={`stage-${active}`}
        >
          <div>
            <span className="eyebrow">{stage.tech}</span>
            <h3>{stage.title}</h3>
            <p>{stage.description}</p>
            <a
              href={`${SOURCE}/blob/main/${stage.file}`}
              target="_blank"
              rel="noreferrer"
            >
              <Code2 size={15} />
              Read the source <ArrowUpRight size={14} />
            </a>
          </div>
          <div className="stage-proof">
            <CheckCheck size={25} />
            <strong>Evidence, built in.</strong>
            <p>{stage.proof}</p>
          </div>
        </div>
      </section>
      <Tabs defaultValue="present" className="architecture-bottom">
        <TabsList className="story-tabs">
          <TabsTrigger value="present">Present the project</TabsTrigger>
          <TabsTrigger value="schema">Data model</TabsTrigger>
          <TabsTrigger value="tradeoffs">Design decisions</TabsTrigger>
        </TabsList>
        <TabsContent value="present">
          <section className="presentation-panel panel">
            <div>
              <span className="eyebrow">YOUR 60-SECOND INTRODUCTION</span>
              <h3>“I built a replay-safe airline data platform.”</h3>
              <p>
                “It simulates operational events in Kafka, preserves raw JSON in
                MinIO, and uses PySpark to normalize the data into PostgreSQL. I
                focused on what happens when messages arrive twice, arrive out
                of order, or fail during a load. Automated tests verify the
                delivery counts, constraints, and replay behavior—and this
                dashboard makes the results easy to inspect.”
              </p>
              <Button className="primary-button" onClick={onExplore}>
                Show the flight board
                <ArrowRight size={15} />
              </Button>
            </div>
            <ol>
              <li>
                <span>01</span>
                <div>
                  <strong>Start with the outcome</strong>
                  <p>
                    Show one flight, its gate, and its final departure state.
                  </p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <strong>Follow the evidence</strong>
                  <p>
                    Open its event history and explain raw → normalized data.
                  </p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <strong>Show the reliability work</strong>
                  <p>
                    Explain duplicate handling, rollback, and the quality
                    report.
                  </p>
                </div>
              </li>
            </ol>
          </section>
        </TabsContent>
        <TabsContent value="schema">
          <section className="schema-grid">
            {[
              {
                name: "flights",
                key: "flight_id",
                fields: [
                  "origin · dest",
                  "scheduled_dep · actual_dep",
                  "status · gate",
                  "source_run_id → pipeline_runs",
                ],
              },
              {
                name: "delays",
                key: "delay_id",
                fields: [
                  "flight_id → flights",
                  "delay_min: 0–1440",
                  "reason · occurred_at",
                  "UNIQUE (flight_id, occurred_at)",
                ],
              },
              {
                name: "passengers",
                key: "pax_id",
                fields: [
                  "flight_id → flights",
                  "checkin_time",
                  "Flight-specific booking ID",
                  "Earliest valid check-in wins",
                ],
              },
            ].map((t) => (
              <article className="panel schema-card" key={t.name}>
                <Database size={19} />
                <h3>{t.name}</h3>
                <div className="pk">
                  <span>PK</span>
                  <code>{t.key}</code>
                </div>
                {t.fields.map((f) => (
                  <p key={f}>{f}</p>
                ))}
              </article>
            ))}
          </section>
        </TabsContent>
        <TabsContent value="tradeoffs">
          <section className="decision-grid">
            {[
              [
                "At-least-once delivery",
                "Kafka and MinIO do not share a transaction. Commit after persistence and deterministic object keys make retries safe.",
              ],
              [
                "Batch transformations",
                "Kafka ingestion is continuous. Spark processes completed manifests in bounded batches for reproducible counts.",
              ],
              [
                "Small, inspectable runs",
                "The demo uses 32 records per run to expose every state transition. It does not claim production-scale performance.",
              ],
              [
                "Local system, public evidence",
                "Docker runs the live stack. This public demo shows a recorded snapshot of synthetic events without exposing the database.",
              ],
            ].map(([title, body]) => (
              <article className="panel decision-card" key={title}>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function FlightDetails({
  flight,
  events,
}: {
  flight: Flight;
  events: Event[];
}) {
  const [jsonEvent, setJsonEvent] = useState<Event | null>(null);
  const unique = [
    ...new Map(
      events
        .filter((e) => e.flight_id === flight.flight_id)
        .map((e) => [e.event_id, e]),
    ).values(),
  ].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  return (
    <div className="sheet-body">
      <div className="flight-route-detail">
        <div>
          <strong>{flight.origin}</strong>
          <span>{AIRPORTS[flight.origin]?.city}</span>
        </div>
        <Plane size={24} />
        <div>
          <strong>{flight.dest}</strong>
          <span>{AIRPORTS[flight.dest]?.city}</span>
        </div>
      </div>
      <div className="flight-detail-facts">
        <span>
          <Clock3 size={15} />
          <strong>{time(flight.actual_dep)}</strong>UTC departure
        </span>
        <span>
          <Users size={15} />
          <strong>{flight.passengers}</strong>checked in
        </span>
      </div>
      <dl className="details-grid">
        <div>
          <dt>Status</dt>
          <dd>
            <span className={`status ${flight.status}`}>{flight.status}</span>
          </dd>
        </div>
        <div>
          <dt>Gate</dt>
          <dd>{flight.gate || "—"}</dd>
        </div>
        <div>
          <dt>Scheduled</dt>
          <dd>{time(flight.scheduled_dep)} UTC</dd>
        </div>
        <div>
          <dt>Delay</dt>
          <dd>
            +{flight.delay_min || 0} min ·{" "}
            {flight.delay_reason?.replaceAll("_", " ") || "none"}
          </dd>
        </div>
      </dl>
      <div className="timeline-heading">
        <h3>Event history</h3>
        <span>{unique.length} unique events</span>
      </div>
      <div className="timeline">
        {unique.map((e) => (
          <button
            key={e.event_id}
            className="timeline-event"
            onClick={() =>
              setJsonEvent(jsonEvent?.event_id === e.event_id ? null : e)
            }
            aria-expanded={jsonEvent?.event_id === e.event_id}
          >
            <span
              className={`timeline-dot ${e.event_type === "flight_departed" ? "final" : ""}`}
            />
            <span>
              <strong>{eventLabel(e.event_type)}</strong>
              <small>
                {e.gate
                  ? `Gate ${e.gate}`
                  : e.delay_min
                    ? `+${e.delay_min} minutes`
                    : e.pax_id
                      ? `Booking ${e.pax_id.split("-").at(-1)}`
                      : "Operational event"}
                <span>{time(e.timestamp)} UTC</span>
              </small>
            </span>
            <Braces size={14} />
          </button>
        ))}
      </div>
      {jsonEvent && (
        <div className="json-viewer">
          <div>
            <FileJson size={15} />
            Original event payload
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setJsonEvent(null)}
              aria-label="Close event JSON"
            >
              <X size={14} />
            </Button>
          </div>
          <pre>{JSON.stringify(jsonEvent, null, 2)}</pre>
        </div>
      )}
      <div className="lineage-card">
        <span className="eyebrow">TRACEABLE BY DESIGN</span>
        <p>Flight instance</p>
        <code>{flight.flight_id}</code>
        <p>Pipeline run</p>
        <code>{flight.source_run_id}</code>
      </div>
    </div>
  );
}
