"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  Clock3,
  Database,
  Layers3,
  LoaderCircle,
  Map,
  Plane,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  Workflow,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AIRPORTS,
  date,
  shortId,
  time,
  type Flight,
  type Platform,
} from "@/lib/platform";
import usMap from "@/lib/us-map.json";
import {
  RunsView,
  QualityView,
  FlightDetails,
} from "@/components/platform-views";

const sections = [
  { id: "overview", name: "Network", icon: Map },
  { id: "flights", name: "Flights", icon: Plane },
  { id: "runs", name: "Pipeline", icon: Workflow },
  { id: "quality", name: "Quality", icon: ShieldCheck },
];
const titles: Record<string, string> = {
  overview: "Network operations",
  flights: "Flight board",
  runs: "Pipeline activity",
  quality: "Data quality",
};
const eventTypes = [
  ["passenger_checkin", "Check-ins"],
  ["flight_delay", "Delays"],
  ["flight_scheduled", "Scheduled"],
  ["gate_change", "Gate changes"],
  ["flight_departed", "Departures"],
];

function Navigation({
  section,
  onSelect,
}: {
  section: string;
  onSelect: (section: string) => void;
}) {
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarMenu>
      {sections.map((item) => (
        <SidebarMenuItem key={item.id}>
          <SidebarMenuButton
            className="nav-item"
            isActive={section === item.id}
            onClick={() => {
              onSelect(item.id);
              setOpenMobile(false);
            }}
          >
            <item.icon />
            <span>{item.name}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}

function RouteMap({
  flights,
  onSelect,
}: {
  flights: Flight[];
  onSelect: (flight: Flight) => void;
}) {
  const point = (code: string) => {
    const a = AIRPORTS[code];
    return a ? [((a.lon + 128) / 65) * 650, ((53 - a.lat) / 32) * 320] : [0, 0];
  };
  const airports = [...new Set(flights.flatMap((f) => [f.origin, f.dest]))];
  return (
    <section className="network-map panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">ROUTE NETWORK</span>
          <h2>United States</h2>
        </div>
        <span className="map-region">
          <span className="crosshair" />
          Domestic operations
        </span>
      </div>
      <svg
        viewBox="0 0 650 320"
        aria-label="US route network"
        className="route-map"
      >
        <defs>
          <pattern
            id="grid"
            width="26"
            height="26"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M26 0H0V26"
              fill="none"
              stroke="#20313d"
              strokeWidth=".6"
            />
          </pattern>
          <radialGradient id="mapglow">
            <stop stopColor="#263747" stopOpacity=".8" />
            <stop offset="1" stopColor="#131d28" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="650" height="320" fill="url(#grid)" />
        <ellipse cx="325" cy="145" rx="325" ry="180" fill="url(#mapglow)" />
        {usMap.map((d, i) => (
          <path key={i} d={d} fill="#1b2834" stroke="#3b4b59" strokeWidth="1" />
        ))}
        {flights.map((f, i) => {
          const [x1, y1] = point(f.origin),
            [x2, y2] = point(f.dest);
          const mx = (x1 + x2) / 2,
            my = Math.min(y1, y2) - 32;
          const path = `M${x1},${y1} Q${mx},${my} ${x2},${y2}`;
          return (
            <g
              key={f.flight_id}
              className="map-route"
              role="button"
              tabIndex={0}
              aria-label={`Open route ${f.flight_number}, ${f.origin} to ${f.dest}`}
              onClick={() => onSelect(f)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(f);
                }
              }}
            >
              <path
                d={path}
                fill="none"
                stroke="transparent"
                strokeWidth="16"
              />
              <path
                d={path}
                fill="none"
                stroke={i % 2 ? "#86a9c9" : "#f6ae57"}
                strokeWidth="1.7"
              />
              <circle
                cx={(x1 + 2 * mx + x2) / 4}
                cy={(y1 + 2 * my + y2) / 4}
                r="3"
                fill={i % 2 ? "#abc5dc" : "#f6ae57"}
              />
            </g>
          );
        })}
        {airports.map((code) => {
          const [x, y] = point(code);
          return (
            <g key={code}>
              <circle cx={x} cy={y} r="7" fill="#f6ae57" opacity=".14" />
              <circle cx={x} cy={y} r="2.5" fill="#f7c484" />
              <text
                x={x + 9}
                y={y + (code === "BOS" ? -6 : 5)}
                fill="#d8e0e8"
                fontSize="12"
                fontWeight="600"
              >
                {code}
              </text>
            </g>
          );
        })}
        <text x="65" y="257" fill="#687c8e" fontSize="12" letterSpacing="2">
          PACIFIC OCEAN
        </text>
        <text
          x="502"
          y="218"
          fill="#687c8e"
          fontSize="12"
          letterSpacing="2"
          transform="rotate(65 502 218)"
        >
          ATLANTIC OCEAN
        </text>
      </svg>
      <div className="map-footer">
        <span>
          <i className="route-key" />
          {flights.length} routes
        </span>
        <span>{airports.length} airports</span>
        <span className="map-footer-end">Route view · UTC</span>
      </div>
    </section>
  );
}

function FlightTable({
  flights,
  onSelect,
  compact = false,
}: {
  flights: Flight[];
  onSelect: (flight: Flight) => void;
  compact?: boolean;
}) {
  return (
    <Table className={`flight-table ${compact ? "compact-table" : ""}`}>
      <TableHeader>
        <TableRow>
          <TableHead>Flight / Route</TableHead>
          <TableHead>Departure</TableHead>
          {!compact && <TableHead>Gate</TableHead>}
          <TableHead>Delay</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>
            <span className="sr-only">Details</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {flights.map((f) => (
          <TableRow key={f.flight_id}>
            <TableCell>
              <button className="flight-number" onClick={() => onSelect(f)}>
                {f.flight_number}
              </button>
              <small className="route-codes">
                {f.origin}
                <ArrowRight size={11} />
                {f.dest}
              </small>
            </TableCell>
            <TableCell>
              <strong className="tabular">
                {time(f.actual_dep || f.scheduled_dep)}
              </strong>
              <small>
                {compact
                  ? `Gate ${f.gate || "—"}`
                  : `Scheduled ${time(f.scheduled_dep)}`}
              </small>
            </TableCell>
            {!compact && (
              <TableCell>
                <span className="gate">{f.gate || "—"}</span>
              </TableCell>
            )}
            <TableCell>
              <span className="delay-value">
                +{f.delay_min || 0}
                <small className="inline-unit"> min</small>
              </span>
            </TableCell>
            <TableCell>
              <span className={`status ${f.status}`}>{f.status}</span>
            </TableCell>
            <TableCell>
              <button
                className="icon-button"
                aria-label={`View ${f.flight_number} details`}
                onClick={() => onSelect(f)}
              >
                <ArrowUpRight size={15} />
              </button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function Home() {
  const [data, setData] = useState<Platform | null>(null);
  const [section, setSection] = useState("overview");
  const [selectedRun, setSelectedRun] = useState("latest");
  const [selectedFlight, setSelectedFlight] = useState<Flight | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [connectionNote, setConnectionNote] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [simulationStarting, setSimulationStarting] = useState(false);
  const [actionError, setActionError] = useState("");
  const refresh = useCallback(async () => {
    setRefreshing(true);
    const local = ["localhost", "127.0.0.1"].includes(window.location.hostname);
    try {
      if (local) {
        try {
          const response = await fetch("/api/dashboard", {
            signal: AbortSignal.timeout(15000),
          });
          if (!response.ok) throw new Error("API unavailable");
          const live = (await response.json()) as Platform;
          if (live.mode !== "live") throw new Error("Invalid response");
          setData(live);
          setConnectionNote("");
          setError("");
          return;
        } catch {
          setConnectionNote(
            "Live connection unavailable. Displaying the last recorded dataset.",
          );
        }
      }
      const response = await fetch("/demo-data.json");
      if (!response.ok) throw new Error("Unable to load operations data.");
      setData(await response.json());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load data.");
    } finally {
      setRefreshing(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    if (["localhost", "127.0.0.1"].includes(window.location.hostname)) {
      const timer = setInterval(() => void refresh(), 12000);
      return () => clearInterval(timer);
    }
  }, [refresh]);
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [section]);
  async function runSimulation() {
    setSimulationStarting(true);
    setActionError("");
    try {
      const response = await fetch("/api/simulations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok) {
        const result = (await response.json()) as { error?: string };
        throw new Error(result.error || "Unable to start simulation");
      }
      setSelectedRun("latest");
      await refresh();
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Simulation could not start.",
      );
    } finally {
      setSimulationStarting(false);
    }
  }
  const busy = simulationStarting || data?.job?.state === "running";
  const run = data?.runs.find((r) => r.run_id === selectedRun) || data?.runs[0];
  const flights = (data?.flights || []).filter(
    (f) => f.source_run_id === run?.run_id,
  );
  const checks = (data?.checks || []).filter((c) => c.run_id === run?.run_id);
  const passed = checks.filter((c) => c.passed).length;
  const events = (data?.events || []).filter((e) => e.run_id === run?.run_id);
  const filtered = flights.filter((f) =>
    `${f.flight_number} ${f.origin} ${f.dest} ${AIRPORTS[f.origin]?.city} ${AIRPORTS[f.dest]?.city}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const averageDelay = flights.length
    ? flights.reduce((n, f) => n + (f.delay_min || 0), 0) / flights.length
    : 0;
  const passengerCount = flights.reduce((n, f) => n + f.passengers, 0);
  const departed = flights.filter((f) => f.status === "departed").length;
  return (
    <SidebarProvider style={{ "--sidebar-width": "88px" } as CSSProperties}>
      <Sidebar className="app-sidebar">
        <SidebarHeader>
          <button
            className="brand-mark"
            aria-label="AeroStream network"
            onClick={() => setSection("overview")}
          >
            <Plane size={27} />
          </button>
        </SidebarHeader>
        <SidebarContent>
          <Navigation section={section} onSelect={setSection} />
        </SidebarContent>
        <SidebarFooter>
          <div className="rail-footer">
            <Radio size={19} />
            <span>UTC</span>
          </div>
        </SidebarFooter>
      </Sidebar>
      <div className="workspace">
        <header className="topbar">
          <div className="brand-lockup">
            <SidebarTrigger className="mobile-trigger" />
            <strong>
              AEROSTREAM<span className="brand-period">.</span>
            </strong>
            <span className="brand-divider" />
            <span>OPERATIONS CONTROL</span>
          </div>
          <div className="topbar-right">
            <span className="data-mode">
              <i />
              {data?.mode === "live" ? "Local connection" : "Simulated dataset"}
            </span>
            <span className="topbar-date">{date(run?.created_at)}</span>
          </div>
        </header>
        <main className="main-content">
          <div className="page-heading">
            <div className="title-block">
              <span className="section-index">
                {String(
                  sections.findIndex((s) => s.id === section) + 1,
                ).padStart(2, "0")}{" "}
                / OPERATIONS
              </span>
              <h1>{titles[section]}</h1>
            </div>
            <div className="heading-actions">
              <Select value={selectedRun} onValueChange={setSelectedRun}>
                <SelectTrigger
                  aria-label="Select pipeline run"
                  className="run-select"
                >
                  <Layers3 size={15} />
                  <SelectValue placeholder="Select run" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="latest">Latest run</SelectItem>
                  {data?.runs.map((r) => (
                    <SelectItem key={r.run_id} value={r.run_id}>
                      {date(r.created_at)} · {shortId(r.run_id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                className="refresh-button"
                onClick={() => void refresh()}
                disabled={refreshing}
                aria-label="Refresh operations data"
              >
                <RefreshCw size={15} className={refreshing ? "spin" : ""} />
              </Button>
              {data?.mode === "live" && (
                <Button
                  className="primary-button"
                  onClick={() => void runSimulation()}
                  disabled={busy}
                >
                  {busy ? (
                    <LoaderCircle size={15} className="spin" />
                  ) : (
                    <Radio size={15} />
                  )}{" "}
                  {busy ? "Processing" : "Run simulation"}
                </Button>
              )}
            </div>
          </div>
          {(connectionNote || error || actionError) && (
            <div className="notice" role="status">
              {error || actionError || connectionNote}
              {error && <button onClick={() => void refresh()}>Retry</button>}
            </div>
          )}
          {busy && (
            <div className="notice" role="status">
              <LoaderCircle size={16} className="spin" />
              Processing events and validating the new run.
            </div>
          )}
          {data?.job?.state === "failed" && (
            <div className="notice error" role="alert">
              The last simulation failed. Check the pipeline logs and retry.
            </div>
          )}
          {data?.warnings?.map((w) => (
            <div className="notice" role="status" key={w}>
              {w}
            </div>
          ))}
          {!data && !error ? (
            <div className="loading-grid" aria-label="Loading operations data">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="loading-tile" />
              ))}
            </div>
          ) : (
            data && (
              <>
                <section className="metrics" aria-label="Operational summary">
                  <div className="metric">
                    <div>
                      <span>Scheduled flights</span>
                      <Plane size={17} />
                    </div>
                    <strong>
                      {flights.length.toString().padStart(2, "0")}
                    </strong>
                    <p>
                      <span className="mint">{departed} departed</span>
                      <span>{flights.length - departed} remaining</span>
                    </p>
                  </div>
                  <div className="metric">
                    <div>
                      <span>Average delay</span>
                      <Clock3 size={17} />
                    </div>
                    <strong className="amber">
                      {Number(averageDelay.toFixed(1))}
                      <em>min</em>
                    </strong>
                    <p>
                      {flights.filter((f) => (f.delay_min || 0) > 0).length}{" "}
                      flights with recorded delays
                    </p>
                  </div>
                  <div className="metric">
                    <div>
                      <span>Passengers checked in</span>
                      <Users size={17} />
                    </div>
                    <strong>
                      {passengerCount.toString().padStart(2, "0")}
                    </strong>
                    <p>Across {flights.length} flight instances</p>
                  </div>
                  <div className="metric">
                    <div>
                      <span>Validation status</span>
                      <ShieldCheck size={17} />
                    </div>
                    <strong
                      className={
                        passed === checks.length && checks.length ? "mint" : ""
                      }
                    >
                      {passed}
                      <em>/ {checks.length}</em>
                    </strong>
                    <p>
                      {checks.length === 0
                        ? "Awaiting validation"
                        : passed === checks.length
                          ? "All checks passed"
                          : `${checks.length - passed} checks require attention`}
                    </p>
                  </div>
                </section>
                {section === "overview" && (
                  <div className="operations-grid">
                    <RouteMap flights={flights} onSelect={setSelectedFlight} />
                    <section className="panel departure-panel">
                      <div className="panel-heading">
                        <div>
                          <span className="eyebrow">FLIGHT MOVEMENTS</span>
                          <h2>Departure board</h2>
                        </div>
                        <button
                          className="text-button"
                          onClick={() => setSection("flights")}
                        >
                          View all <ArrowUpRight size={15} />
                        </button>
                      </div>
                      <FlightTable
                        flights={flights}
                        onSelect={setSelectedFlight}
                        compact
                      />
                      <div className="board-note">
                        <Clock3 size={13} />
                        Times UTC · delays in min
                        <span>{flights.length} flights</span>
                      </div>
                    </section>
                  </div>
                )}
                {section === "flights" && (
                  <section className="panel board-panel">
                    <div className="panel-heading">
                      <div className="heading-inline">
                        <h2>All flights</h2>
                        <span className="count-chip">{flights.length}</span>
                      </div>
                      <label className="search-field">
                        <Search size={16} />
                        <input
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="Flight, airport or city"
                          aria-label="Search flights or airports"
                        />
                      </label>
                    </div>
                    <FlightTable
                      flights={filtered}
                      onSelect={setSelectedFlight}
                    />
                    {!filtered.length && (
                      <p className="empty-state">
                        No flights match your search.
                      </p>
                    )}
                    <div className="table-footer">
                      <span>
                        {filtered.length} of {flights.length} flights
                      </span>
                      <span>Times UTC · delays in min</span>
                    </div>
                  </section>
                )}
                {section === "overview" && (
                  <div className="bottom-grid">
                    <section className="panel ingestion-panel">
                      <div className="panel-heading">
                        <div>
                          <span className="eyebrow">EVENT INGESTION</span>
                          <h2>Event distribution</h2>
                        </div>
                        <span className="data-total">
                          <strong>{run?.raw_count ?? 0}</strong> records
                        </span>
                      </div>
                      <div className="event-segments">
                        {eventTypes.map(([type, label], i) => {
                          const count = events.filter(
                            (e) => e.event_type === type,
                          ).length;
                          return (
                            <div
                              key={type}
                              style={{
                                flex: count,
                                background: [
                                  "#eead66",
                                  "#7799bb",
                                  "#557186",
                                  "#455967",
                                  "#35454f",
                                ][i],
                              }}
                              title={`${label}: ${count}`}
                            />
                          );
                        })}
                      </div>
                      <div className="event-legend">
                        {eventTypes.map(([type, label], i) => (
                          <div key={type}>
                            <i
                              style={{
                                background: [
                                  "#eead66",
                                  "#7799bb",
                                  "#557186",
                                  "#455967",
                                  "#35454f",
                                ][i],
                              }}
                            />
                            <span>{label}</span>
                            <strong>
                              {
                                events.filter((e) => e.event_type === type)
                                  .length
                              }
                            </strong>
                          </div>
                        ))}
                      </div>
                    </section>
                    <section className="panel reconciliation-panel">
                      <div className="panel-heading">
                        <div>
                          <span className="eyebrow">PIPELINE ACCOUNTING</span>
                          <h2>Batch reconciliation</h2>
                        </div>
                        <button
                          className="icon-button"
                          aria-label="Open pipeline activity"
                          onClick={() => setSection("runs")}
                        >
                          <ArrowUpRight size={17} />
                        </button>
                      </div>
                      <div className="reconciliation">
                        <div>
                          <ArrowDownToLine size={16} />
                          <strong>{run?.raw_count ?? 0}</strong>
                          <span>Ingested</span>
                        </div>
                        <ChevronRight size={15} />
                        <div>
                          <Database size={16} />
                          <strong>{run?.valid_count ?? 0}</strong>
                          <span>Accepted</span>
                        </div>
                        <div className="removed">
                          <strong>{run?.duplicate_count ?? 0}</strong>
                          <span>Duplicates</span>
                        </div>
                        <div className="removed">
                          <strong>{run?.rejected_count ?? 0}</strong>
                          <span>Rejected</span>
                        </div>
                      </div>
                    </section>
                  </div>
                )}
                {section === "runs" && (
                  <RunsView data={data} run={run} onSelect={setSelectedRun} />
                )}
                {section === "quality" && (
                  <QualityView checks={checks} run={run} />
                )}
                <footer className="page-footer">
                  <span>
                    <span
                      className={`run-indicator ${run?.status === "completed" ? "complete" : ""}`}
                    />
                    {run?.status === "completed"
                      ? "Batch completed"
                      : run?.status || "No completed batch"}
                    <code>{run ? shortId(run.run_id) : "—"}</code>
                  </span>
                  <span>
                    {data.mode === "snapshot"
                      ? "Recorded synthetic data"
                      : "Synthetic event stream"}
                    <span className="footer-divider">/</span>Processed{" "}
                    {date(run?.transformed_at)} · {time(run?.transformed_at)}{" "}
                    UTC
                  </span>
                </footer>
              </>
            )
          )}
        </main>
      </div>
      <Sheet
        open={!!selectedFlight}
        onOpenChange={(open) => {
          if (!open) setSelectedFlight(null);
        }}
      >
        <SheetContent className="flight-sheet">
          <SheetHeader>
            <SheetTitle>
              {selectedFlight?.flight_number}
              <span className="sheet-title-label">Flight details</span>
            </SheetTitle>
            <SheetDescription>
              {selectedFlight?.origin} → {selectedFlight?.dest} ·{" "}
              {date(selectedFlight?.scheduled_dep)}
            </SheetDescription>
          </SheetHeader>
          {selectedFlight && (
            <FlightDetails
              key={selectedFlight.flight_id}
              flight={selectedFlight}
              events={events}
            />
          )}
        </SheetContent>
      </Sheet>
    </SidebarProvider>
  );
}
