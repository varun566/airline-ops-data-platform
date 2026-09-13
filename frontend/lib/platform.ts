export type Run = {
  run_id: string;
  created_at: string;
  transformed_at: string | null;
  producer_count: number;
  raw_count: number;
  valid_count: number;
  rejected_count: number;
  duplicate_count: number;
  status: string;
  error: string | null;
};
export type Flight = {
  flight_id: string;
  source_run_id: string;
  flight_number: string;
  flight_date: string;
  origin: string;
  dest: string;
  scheduled_dep: string;
  actual_dep: string | null;
  status: string;
  gate: string | null;
  passengers: number;
  delay_min: number | null;
  delay_reason: string | null;
};
export type Check = {
  report_id: number;
  validation_id: string;
  run_id: string;
  test_name: string;
  passed: boolean;
  details: string;
  checked_at: string;
};
export type Event = {
  event_id: string;
  run_id: string;
  event_type: string;
  flight_id: string;
  flight_number: string;
  timestamp: string;
  delay_min: number | null;
  gate: string | null;
  pax_id: string | null;
  raw_key: string;
  [key: string]: unknown;
};
export type Platform = {
  mode: "live" | "snapshot";
  generated_at: string;
  runs: Run[];
  flights: Flight[];
  checks: Check[];
  events: Event[];
  warnings?: string[];
  job?: { state: string; started_at?: string; finished_at?: string };
};
export const AIRPORTS: Record<
  string,
  { name: string; city: string; lon: number; lat: number }
> = {
  JFK: {
    name: "John F. Kennedy International",
    city: "New York",
    lon: -73.78,
    lat: 40.64,
  },
  LAX: {
    name: "Los Angeles International",
    city: "Los Angeles",
    lon: -118.41,
    lat: 33.94,
  },
  BOS: {
    name: "Boston Logan International",
    city: "Boston",
    lon: -71.01,
    lat: 42.36,
  },
  ORD: {
    name: "Chicago O’Hare International",
    city: "Chicago",
    lon: -87.91,
    lat: 41.97,
  },
  SFO: {
    name: "San Francisco International",
    city: "San Francisco",
    lon: -122.38,
    lat: 37.62,
  },
  SEA: {
    name: "Seattle–Tacoma International",
    city: "Seattle",
    lon: -122.31,
    lat: 47.45,
  },
  ATL: {
    name: "Hartsfield–Jackson Atlanta",
    city: "Atlanta",
    lon: -84.43,
    lat: 33.64,
  },
  MIA: { name: "Miami International", city: "Miami", lon: -80.29, lat: 25.79 },
};
export const time = (value?: string | null) =>
  value
    ? new Date(value.replace(" ", "T")).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
      })
    : "—";
export const date = (value?: string | null) =>
  value
    ? new Date(value.replace(" ", "T")).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : "—";
export const shortId = (id: string) => id.slice(0, 8);
export const SOURCE = "https://github.com/varun566/airline-ops-data-platform";
