### Fencify Layout Gateway – Implementation Guide

#### Overview

- **Frontend**: Vue 3 + Vite, Pinia store, empty router. Entry at `src/main.ts`, root component `src/App.vue`.
- **Backend API**: Express server in `src/app.ts`. Handles file upload and blueprint processing.
- **Storage**: DigitalOcean Spaces (S3-compatible) for original uploads and processed JSON results.
- **External Service**: Python microservice called to process blueprints and return JSON (no base64 image).

#### Architecture

- **Frontend build** served by Vite during development. In production, `src/app.ts` can serve built assets from `dist/` when `NODE_ENV=production`.
- **API** exposes two endpoints under `/api/blueprints`:
  - `POST /upload` – upload a blueprint image; stores in DO Spaces; returns `{ id, url }` (id is in-memory only).
  - `POST /process` – calls the processor to transform the image; uploads JSON result to DO Spaces; returns result URL. Accepts `originalUrl` directly or a prior `blueprintId`.

#### Database

No database is used in this app. An in-memory map tracks `blueprintId -> originalUrl` for the current process lifetime only. The recommended production pattern is to pass `originalUrl` directly to the processing endpoint.

#### Backend API (src/app.ts)

- Loads env via `dotenv/config`.
- Uploads use `multer.memoryStorage()` (no local disk writes) with file size and type limits.
- DigitalOcean Spaces via `@aws-sdk/client-s3`; uploads performed with multipart helper `putPublicObject` (`src/s3/upload.ts`) and long-lived cache headers. Prefer bucket policy over per-object ACLs.
- Public URLs are formed using `DO_SPACES_PUBLIC_BASE` when set (CDN or Spaces origin), falling back to `${DO_SPACES_ENDPOINT}/${DO_SPACES_BUCKET}`.
- Shared axios client with HTTP keep-alive at `src/http/axios.ts` to reduce socket churn.
- Errors are logged and returned with messages. In non-production, the outgoing Python payload is logged; production avoids logging large prompts.
- `PORT` is coerced to a number to avoid bad values from `.env` (e.g., inline comments).

Endpoints

1. `POST /api/blueprints/upload`
   - Form-data field: `blueprint` (file)
   - Response: `{ id: string, url: string, message: string }` (id is ephemeral)

2. `POST /api/blueprints/process`
   - JSON body: `{ originalUrl?: string, blueprintId?: string, prompt: object }`
   - Invokes Python at `${PYTHON_MICROSERVICE_URL}/process_blueprint` using the keep-alive HTTP client
   - Python returns JSON (no base64). The JSON is optionally versioned by uploading to Spaces as `application/json`.
   - Response: `{ url: string | null, message: string }` (URL points to JSON)

Python Microservice Contract

- Request body sent from Node (expects JSON result, no base64):

```json
{
  "mode": "fence_extract",
  "inputType": "layout",
  "image_url": "<public-URL-to-original-image>",
  "progressive": true,
  "want": { "overlayPng": false, "geometryJson": true },
  "prompt": {}
}
```

- Response body expected from Python:

```json
{
  "geometry": {},
  "meta": {}
}
```

#### Storage Layout (DigitalOcean Spaces)

- Original uploads: `blueprints/original/<uuid>.<ext>`
- Processed outputs (JSON): `blueprints/processed/<uuid>.json`
- Public URLs are constructed as `${DO_SPACES_PUBLIC_BASE}/${key}` when set, otherwise `${DO_SPACES_ENDPOINT}/${DO_SPACES_BUCKET}/${key}`.

#### Environment Variables (.env)

- `PORT` – API port (default 3000)
- `DO_SPACES_ENDPOINT` – e.g., `https://nyc3.digitaloceanspaces.com`
- `DO_SPACES_KEY` / `DO_SPACES_SECRET` – DO Spaces credentials
- `DO_SPACES_BUCKET` – bucket name
- `PYTHON_MICROSERVICE_URL` – base URL of the Python service
- `DO_SPACES_PUBLIC_BASE` – public base (CDN or Spaces origin) used to form object URLs

Example

```bash
PORT=3000
DO_SPACES_ENDPOINT=https://nyc3.digitaloceanspaces.com
DO_SPACES_KEY=...
DO_SPACES_SECRET=...
DO_SPACES_BUCKET=fencify
PYTHON_MICROSERVICE_URL=http://localhost:8000
DO_SPACES_PUBLIC_BASE=https://your-bucket.nyc3.cdn.digitaloceanspaces.com
```

#### Running Locally

- Install: `npm install`
- Frontend dev server: `npm run dev`
- Backend API (TypeScript): `npx ts-node src/app.ts` (or compile with a bundler like `tsup` and run Node on the output)
- Type-check: `npm run type-check`
- Lint: `npm run lint`

Notes

- In production, build the frontend (`vite build`) and run the backend with a Node-compatible build of `src/app.ts` (e.g., via `tsc` or a bundler) if not using ts-node in production.

#### Deployment (systemd)

- Systemd unit (paths may vary):

```ini
[Unit]
Description=Fencify Layout Gateway API
After=network.target

[Service]
WorkingDirectory=/root/fencify-layout-gateway
User=root
Environment=NODE_ENV=production
# Read environment variables from file (PORT, DO_SPACES_*, PYTHON_MICROSERVICE_URL, etc.)
EnvironmentFile=-/root/fencify-layout-gateway/.env.production
# Use absolute Node path or set PATH and use /usr/bin/env node
ExecStart=/root/.nvm/versions/node/v22.12.0/bin/node /root/fencify-layout-gateway/dist/app.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

- Build server bundle and restart:

```bash
cd /root/fencify-layout-gateway
env -u NODE_ENV npm ci --include=dev --no-audit --no-fund || npm install --include=dev
# Build UI
npm run build
# Build server with LOCAL tsup so it can resolve local typescript
npx --no-install tsup src/app.ts --format esm --target node22 --out-dir dist
sudo systemctl daemon-reload
sudo systemctl restart fencify-layout-gateway
sudo systemctl status fencify-layout-gateway
```

Troubleshooting

- Cannot find module 'typescript' when running tsup

```bash
env -u NODE_ENV npm i -D typescript tsup
npx --no-install tsup src/app.ts --format esm --target node22 --out-dir dist
```

- Systemd warning: Ignoring invalid environment assignment

Ensure the unit uses only `Environment=` KEY=VALUE lines and an `EnvironmentFile` reference. Do not embed shell commands in `Environment=`. Put values in `/root/fencify-layout-gateway/.env.production` instead, e.g.:

```bash
PORT=3000
DO_SPACES_ENDPOINT=...
DO_SPACES_KEY=...
DO_SPACES_SECRET=...
DO_SPACES_BUCKET=...
DO_SPACES_PUBLIC_BASE=...
PYTHON_MICROSERVICE_URL=...
```

#### Testing

- Unit tests: Vitest (`npm run test:unit`). Test tsconfig in `tsconfig.vitest.json` includes `.vue` files.
- E2E: Playwright (`npm run test:e2e`). Config at `playwright.config.ts` auto-starts the Vite dev/preview server.

#### Frontend

- Upload input accepts PDFs and images: `<input type="file" accept=".pdf,image/*" />`.
- Processed results may be JSON; when the URL ends in `.json`, the UI links to view the JSON, otherwise it renders an image.
- Router: `src/router/index.ts` currently has no routes.
- State: sample Pinia store at `src/stores/counter.ts`.

#### Performance Improvements (2025-09)

- JSON-only processing: removed base64 image shuttling between services.
- Streaming-friendly S3 uploads via `@aws-sdk/lib-storage` with long-lived cache headers.
- HTTP keep-alive axios client to minimize connection overhead.
- Size limits and file type filters applied to uploads; small JSON body limits for API.
- Public URL construction via `DO_SPACES_PUBLIC_BASE` (prefer bucket policy/CDN over per-object ACLs).
- Graceful shutdown extended to handle `SIGINT` in addition to `SIGTERM`.

#### Error Handling & Logging

- API returns 4xx for invalid input and 5xx for unexpected failures.
- Processing errors surface Python error payloads when available.

#### Directory Pointers

- Backend API: `src/app.ts`
- Frontend app: `src/` (entry `main.ts`, components in `App.vue`)
- E2E tests: `e2e/`
