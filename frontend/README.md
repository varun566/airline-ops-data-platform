# AeroStream frontend

A React / TypeScript operations dashboard with a Vinext static export, Tailwind CSS,
Radix UI components, and Lucide icons. Docker builds and serves it with nginx.

## Run with the live platform

From the repository root:

```bash
docker compose up --build -d
```

Open http://localhost:8088. nginx forwards `/api/*` to the local Python API.
All published ports bind to loopback. The backend uses existing database and
object-storage configuration; credentials never enter browser bundles.

## Frontend development

Use Node 22.13 or newer. Keep the Docker API running:

```bash
docker compose up -d api
cd frontend
npm ci
npm run dev -- --host 127.0.0.1 --port 3100
```

The Vite proxy forwards `/api/*` to localhost:8010. Restart the dev server if that
port changes. The standard Compose dashboard is independent of this dev server.

```bash
npm run typecheck
npm run build
```

Static output is in `dist/client`. nginx can serve it without Node in production.
The public deployment has no backend: `/demo-data.json` contains results recorded
from the synthetic pipeline. Public hosts always use snapshot mode. localhost and
127.0.0.1 try the live API first, with an explicit fallback message on failure.

## Refresh the recorded dataset

From the repository root, after a successful simulation:

```bash
docker compose exec -T api python -m airline_ops.export_demo > /tmp/airline-demo-data.json
python3 -m json.tool /tmp/airline-demo-data.json > frontend/public/demo-data.json
```

The exporter labels the data `snapshot` and removes local job state. It reads the
latest 12 runs and at most 500 raw events per run. Commit the export, rebuild, and
publish the new static artifact to update the public demo. This application is
intended only for the simulator's synthetic dataset.

## API

- `GET /api/health`: process health.
- `GET /api/dashboard`: runs, normalized flights, latest validation per run, raw events, and current job state.
- `POST /api/simulations` with `{}` and `Content-Type: application/json`: starts the fixed Python demo command. Returns 202, or 409 when a dashboard job is active.

Simulation requests must use a local Host and matching Origin. There is no CORS
allowlist or Docker socket mount. This is a local demo service, not an authenticated
multi-user job scheduler. HTTP behavior is tested in `tests/unit/test_api.py`.

The US outline in `lib/us-map.json` is derived from the public-domain
[Natural Earth country boundaries](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_admin_0_countries.geojson).
Airport coordinates are for a route overview, not navigation.
