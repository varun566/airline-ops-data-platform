"use client";

import { useState } from "react";
import {
  Braces,
  Check,
  ChevronRight,
  Clock3,
  Database,
  FileJson,
  Plane,
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

import {
  AIRPORTS,
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
            <h2>Run history</h2>
            <p>Ingestion and transformation results by batch.</p>
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
            <h2>Event reconciliation</h2>
            <p>
              Accepted, duplicate, and rejected records for the selected batch.
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
                ? "All validations passed"
                : "Validation exceptions"}
          </h2>
          <p>
            {pass} of {checks.length} checks passed.
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
            <h2>Validation checks</h2>
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
        <span className="eyebrow">RECORD LINEAGE</span>
        <p>Flight instance</p>
        <code>{flight.flight_id}</code>
        <p>Pipeline run</p>
        <code>{flight.source_run_id}</code>
      </div>
    </div>
  );
}
