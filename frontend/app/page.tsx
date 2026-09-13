"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCheck,
  ChevronRight,
  Clock3,
  ExternalLink,
  GitBranch,
  Layers3,
  LayoutDashboard,
  Plane,
  Radio,
  Search,
  ShieldCheck,
  Users,
  Workflow,
  Play,
  RefreshCw,
  LoaderCircle,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
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
  SOURCE,
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
  ArchitectureView,
  FlightDetails,
} from "@/components/platform-views";

const sections = [
  { id: "overview", name: "Overview", icon: LayoutDashboard },
  { id: "flights", name: "Flight operations", icon: Plane },
  { id: "runs", name: "Pipeline runs", icon: Workflow },
  { id: "quality", name: "Data quality", icon: ShieldCheck },
  { id: "architecture", name: "Architecture", icon: Layers3 },
];

function Navigation({
  section,
  onSelect,
  checks,
}: {
  section: string;
  onSelect: (section: string) => void;
  checks: number;
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
            <item.icon size={18} />
            <span>{item.name}</span>
            {item.id === "quality" && checks > 0 && (
              <span className="nav-count">{checks}</span>
            )}
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
    <section className="route-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow light">THE NETWORK</span>
          <h2>Every route. One view.</h2>
        </div>
        <span className="map-tag">US domestic</span>
      </div>
      <svg
        viewBox="0 0 650 320"
        role="img"
        aria-label="Map of the United States showing simulated airline routes"
        className="route-map"
      >
        <defs>
          <pattern
            id="grid"
            width="25"
            height="25"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1" cy="1" r=".7" fill="#52717d" opacity=".35" />
          </pattern>
          <linearGradient id="routeGradient">
            <stop stopColor="#55d6c2" />
            <stop offset="1" stopColor="#b1f1cf" />
          </linearGradient>
        </defs>
        <rect width="650" height="320" fill="url(#grid)" />
        {usMap.map((path, i) => (
          <path
            key={i}
            d={path}
            fill="#18313b"
            stroke="#35535e"
            strokeWidth="1"
          />
        ))}
        {flights.map((f, i) => {
          const [x1, y1] = point(f.origin),
            [x2, y2] = point(f.dest);
          const midX = (x1 + x2) / 2,
            midY = Math.min(y1, y2) - 40;
          return (
            <g
              key={f.flight_id}
              className="map-route"
              onClick={() => onSelect(f)}
            >
              <path
                d={`M${x1},${y1} Q${midX},${midY} ${x2},${y2}`}
                fill="none"
                stroke="url(#routeGradient)"
                strokeWidth="1.6"
                opacity=".85"
                strokeDasharray={i === 0 ? "0" : "4 4"}
              />
              <circle
                cx={(x1 + 2 * midX + x2) / 4}
                cy={(y1 + 2 * midY + y2) / 4}
                r="3"
                fill="#9bf0d7"
              />
            </g>
          );
        })}
        {airports.map((code) => {
          const [x, y] = point(code);
          return (
            <g key={code}>
              <circle cx={x} cy={y} r="7" fill="#65d7ba" opacity=".12" />
              <circle cx={x} cy={y} r="3" fill="#9bf0d7" />
              <text
                x={x + 10}
                y={y + (code === "BOS" ? -6 : 5)}
                fill="#dce9e9"
                fontSize="16"
                fontWeight="600"
              >
                {code}
              </text>
            </g>
          );
        })}
        <text x="105" y="275" fontSize="12" letterSpacing="3" fill="#607b85">
          PACIFIC OCEAN
        </text>
        <text
          x="513"
          y="204"
          fontSize="12"
          letterSpacing="3"
          fill="#607b85"
          transform="rotate(62 513 204)"
        >
          ATLANTIC OCEAN
        </text>
      </svg>
      <div className="map-footer">
        <span>
          <i className="dot mint" />
          {flights.length} flight routes
        </span>
        <span>{airports.length} airports connected</span>
        <span className="map-coordinates">24°N — 49°N</span>
      </div>
    </section>
  );
}

function FlightTable({
  flights,
  onSelect,
}: {
  flights: Flight[];
  onSelect: (flight: Flight) => void;
}) {
  return (
    <Table className="flight-table">
      <TableHeader>
        <TableRow>
          <TableHead>Flight</TableHead>
          <TableHead>Route</TableHead>
          <TableHead>Departure · UTC</TableHead>
          <TableHead>Gate</TableHead>
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
                <span className="airline-mark">
                  <Plane size={15} />
                </span>
                {f.flight_number}
              </button>
            </TableCell>
            <TableCell>
              <span className="route-codes">
                {f.origin}
                <ArrowRight size={13} />
                {f.dest}
              </span>
              <small>
                {AIRPORTS[f.origin]?.city} to {AIRPORTS[f.dest]?.city}
              </small>
            </TableCell>
            <TableCell>
              <strong className="tabular">
                {time(f.actual_dep || f.scheduled_dep)}
              </strong>
              <small>Scheduled {time(f.scheduled_dep)}</small>
            </TableCell>
            <TableCell>
              <span className="gate">{f.gate || "—"}</span>
            </TableCell>
            <TableCell>
              <span className="delay-value">+{f.delay_min || 0} min</span>
            </TableCell>
            <TableCell>
              <span className={`status ${f.status}`}>
                <Check size={12} />
                {f.status}
              </span>
            </TableCell>
            <TableCell>
              <button
                className="icon-button"
                aria-label={`View ${f.flight_number} details`}
                onClick={() => onSelect(f)}
              >
                <ChevronRight size={17} />
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
          if (!response.ok) throw new Error("Local API unavailable");
          const live = (await response.json()) as Platform;
          if (live.mode !== "live") throw new Error("Invalid API response");
          setData(live);
          setConnectionNote("");
          setError("");
          return;
        } catch {
          setConnectionNote(
            "Live connection unavailable. Showing a recorded demo snapshot.",
          );
        }
      }
      const response = await fetch("/demo-data.json");
      if (!response.ok)
        throw new Error("Unable to load the demonstration data.");
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
  const eventTypes = [
    ["passenger_checkin", "Passenger check-in"],
    ["flight_delay", "Flight delay"],
    ["flight_scheduled", "Flight scheduled"],
    ["gate_change", "Gate change"],
    ["flight_departed", "Departure"],
  ];
  return (
    <SidebarProvider style={{ "--sidebar-width": "235px" } as CSSProperties}>
      <Sidebar className="app-sidebar">
        <SidebarHeader>
          <a className="brand" href="#" onClick={() => setSection("overview")}>
            <span className="brand-icon">
              <Plane size={23} />
            </span>
            <span>
              AeroStream<small>AIRLINE OPS</small>
            </span>
          </a>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>WORKSPACE</SidebarGroupLabel>
            <Navigation
              section={section}
              onSelect={setSection}
              checks={checks.length}
            />
          </SidebarGroup>
          <div className="sidebar-story">
            <span className="little-icon">
              <GitBranch size={17} />
            </span>
            <h3>Built for reliability.</h3>
            <p>Follow an event from the runway to a trusted database record.</p>
            <button onClick={() => setSection("architecture")}>
              Explore the pipeline <ArrowUpRight size={15} />
            </button>
          </div>
        </SidebarContent>
        <SidebarFooter>
          <a
            className="source-link"
            href={SOURCE}
            target="_blank"
            rel="noreferrer"
          >
            <GitBranch size={17} />
            View project source
            <ExternalLink size={13} />
          </a>
          <div className="profile">
            <span className="avatar">V</span>
            <div>
              <strong>Varun</strong>
              <small>Data engineering portfolio</small>
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <SidebarTrigger className="mobile-trigger" />
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{sections.find((s) => s.id === section)?.name}</strong>
          </div>
          <div className="topbar-right">
            <span className="environment">
              <i className="dot" />{" "}
              {data?.mode === "live" ? "Local platform" : "Portfolio demo"}
            </span>
            <span className="topbar-divider" />
            <span className="topbar-date">{date(run?.created_at)}</span>
            <span className="avatar small">V</span>
          </div>
        </header>
        <main className="main-content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">OPERATIONS INTELLIGENCE</span>
              <h1>
                {section === "overview"
                  ? "Operations overview"
                  : sections.find((s) => s.id === section)?.name}
              </h1>
              <p>Your airline data, from first event to final insight.</p>
            </div>
            <div className="heading-actions">
              <Select value={selectedRun} onValueChange={setSelectedRun}>
                <SelectTrigger
                  aria-label="Select pipeline run"
                  className="run-select"
                >
                  <Clock3 size={15} />
                  <SelectValue />
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
                aria-label="Refresh dashboard"
              >
                <RefreshCw size={15} className={refreshing ? "spin" : ""} />
              </Button>
              {data?.mode === "live" ? (
                <Button
                  className="primary-button"
                  onClick={() => void runSimulation()}
                  disabled={busy}
                >
                  {busy ? (
                    <LoaderCircle size={15} className="spin" />
                  ) : (
                    <Play size={15} />
                  )}{" "}
                  {busy ? "Simulation running" : "Run simulation"}
                </Button>
              ) : (
                <Button
                  className="primary-button"
                  onClick={() => setSection("architecture")}
                >
                  <BookOpen size={15} />
                  Project walkthrough
                  <ArrowUpRight size={14} />
                </Button>
              )}
            </div>
          </div>
          {error && !data ? (
            <div className="notice error" role="alert">
              {error}
              <Button variant="outline" onClick={() => void refresh()}>
                Retry
              </Button>
            </div>
          ) : !data ? (
            <div className="metric-grid">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-32 rounded-xl" />
              ))}
            </div>
          ) : (
            <>
              {(connectionNote || actionError) && (
                <div className="notice warning" role="status">
                  {actionError || connectionNote}
                </div>
              )}
              {busy && (
                <div className="simulation-notice" role="status">
                  <LoaderCircle size={16} className="spin" />
                  <span>
                    New simulation in progress. Events are being published,
                    transformed, and tested. The dashboard refreshes
                    automatically.
                  </span>
                </div>
              )}
              {data.job?.state === "failed" && (
                <div className="notice error" role="alert">
                  The last simulation failed. Check the latest pipeline run and
                  the local API log.
                </div>
              )}
              {data.warnings?.map((w) => (
                <div className="notice warning" key={w}>
                  {w}
                </div>
              ))}
              <div className="data-notice">
                <span>
                  <Radio size={14} />
                  {data.mode === "live"
                    ? "Connected to your Docker platform"
                    : "Recorded demo · real pipeline results, simulated flights"}
                </span>
                <span>
                  Run <code>{shortId(run?.run_id || "")}</code>
                  <i className="dot" />
                  {run?.status === "completed" ? "Completed" : run?.status}
                </span>
              </div>
              <div className="metric-grid">
                {[
                  {
                    label: "Flights tracked",
                    value: flights.length,
                    icon: Plane,
                    foot: `${flights.filter((f) => f.status === "departed").length} departed`,
                    tone: "teal",
                  },
                  {
                    label: "Events ingested",
                    value: run?.raw_count || 0,
                    icon: Activity,
                    foot: "Kafka → MinIO",
                    tone: "blue",
                  },
                  {
                    label: "Passengers checked in",
                    value: flights.reduce((a, f) => a + f.passengers, 0),
                    icon: Users,
                    foot: `Across ${flights.length} flights`,
                    tone: "violet",
                  },
                  {
                    label: "Quality checks passed",
                    value: `${passed}/${checks.length}`,
                    icon: ShieldCheck,
                    foot:
                      passed === checks.length && checks.length
                        ? "All recorded checks passing"
                        : "Review validation results",
                    tone: "teal",
                  },
                ].map((m) => (
                  <section className="metric-card" key={m.label}>
                    <div>
                      <span>{m.label}</span>
                      <span className={`metric-icon ${m.tone}`}>
                        <m.icon size={18} />
                      </span>
                    </div>
                    <strong>{m.value}</strong>
                    <p>
                      <i className={`dot ${m.tone}`} />
                      {m.foot}
                    </p>
                  </section>
                ))}
              </div>
              {(section === "overview" || section === "flights") && (
                <>
                  {section === "overview" && (
                    <div className="visual-grid">
                      <RouteMap
                        flights={flights}
                        onSelect={setSelectedFlight}
                      />
                      <section className="panel event-panel">
                        <div className="panel-heading">
                          <div>
                            <h2>Event breakdown</h2>
                            <p>Every signal, accounted for</p>
                          </div>
                          <span className="subtle-icon">
                            <Activity size={18} />
                          </span>
                        </div>
                        <div className="event-total">
                          <strong>{run?.raw_count}</strong>
                          <span>raw events</span>
                          <span className="tiny-badge">
                            {run?.valid_count} unique
                          </span>
                        </div>
                        <div className="event-bars">
                          {eventTypes.map(([type, label], i) => {
                            const n = events.filter(
                              (e) => e.event_type === type,
                            ).length;
                            return (
                              <div className="event-bar" key={type}>
                                <div>
                                  <span>
                                    <i
                                      style={{
                                        background: [
                                          "#198777",
                                          "#77b7b0",
                                          "#6286ab",
                                          "#b4c7d8",
                                          "#a9b7c8",
                                        ][i],
                                      }}
                                    />
                                    {label}
                                  </span>
                                  <strong>{n}</strong>
                                </div>
                                <div className="bar-track">
                                  <div
                                    style={{
                                      width: `${(n / Math.max(1, ...eventTypes.map(([t]) => events.filter((e) => e.event_type === t).length))) * 100}%`,
                                      background: [
                                        "#198777",
                                        "#77b7b0",
                                        "#6286ab",
                                        "#b4c7d8",
                                        "#a9b7c8",
                                      ][i],
                                    }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="event-foot">
                          <CheckCheck size={15} />
                          {run?.duplicate_count} duplicates safely removed
                        </div>
                      </section>
                    </div>
                  )}
                  <section className="panel board-panel">
                    <div className="panel-heading">
                      <div className="heading-inline">
                        <h2>Flight board</h2>
                        <span className="count-chip">
                          {flights.length} flights
                        </span>
                      </div>
                      <label className="search-field">
                        <Search size={15} />
                        <input
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="Search flights or airports"
                          aria-label="Search flights or airports"
                        />
                      </label>
                    </div>
                    <FlightTable
                      flights={filtered}
                      onSelect={setSelectedFlight}
                    />
                    {filtered.length === 0 && (
                      <p className="empty-state">
                        No flights match your search.
                      </p>
                    )}
                    <div className="table-footer">
                      <span>
                        Showing {filtered.length} flight{" "}
                        {filtered.length === 1 ? "instance" : "instances"} for
                        this run
                      </span>
                      <span>
                        All times UTC <Clock3 size={13} />
                      </span>
                    </div>
                  </section>
                </>
              )}
              {section === "overview" && (
                <section className="pipeline-strip">
                  <div>
                    <Workflow size={18} />
                    <strong>A complete journey for every event</strong>
                  </div>
                  <div className="pipeline-stages">
                    {["Kafka", "MinIO", "PySpark", "PostgreSQL"].map((s, i) => (
                      <span key={s}>
                        {i > 0 && <ArrowRight size={14} />}
                        <span>{s}</span>
                      </span>
                    ))}
                  </div>
                  <button onClick={() => setSection("architecture")}>
                    See how it works
                    <ArrowUpRight size={15} />
                  </button>
                </section>
              )}
              {section === "runs" && (
                <RunsView data={data} run={run} onSelect={setSelectedRun} />
              )}
              {section === "quality" && (
                <QualityView checks={checks} run={run} />
              )}
              {section === "architecture" && (
                <ArchitectureView onExplore={() => setSection("flights")} />
              )}
              <footer className="page-footer">
                <span>AeroStream · Airline Ops Data Platform</span>
                <span>Python · Kafka · MinIO · PySpark · PostgreSQL</span>
              </footer>
            </>
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
              {selectedFlight?.flight_number} · Flight details
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
