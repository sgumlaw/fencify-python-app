### Fencify Application – Implementation Guide

#### Overview

- **Frontend**: Vue 3 + Vite, Pinia store, empty router. Entry at `src/main.ts`, root component `src/App.vue`.
- **Backend API**: Express server in `src/app.ts`. Handles file upload and blueprint processing.
- **Storage**: DigitalOcean Spaces (S3-compatible) for original and processed images.
- **Database**: PostgreSQL via Prisma. Model `Blueprint` persists file URLs and timestamps.
- **External Service**: Python microservice called to process images.

#### Architecture

- **Frontend build** served by Vite during development. In production, `src/app.ts` can serve built assets from `dist/` when `NODE_ENV=production`.
- **API** exposes two endpoints under `/api/blueprints`:
  - `POST /upload` – upload a blueprint image; stores in DO Spaces; creates DB record.
  - `POST /process` – calls Python service to transform the image; stores result in DO Spaces; updates DB record.

#### Database (Prisma)

- Schema: `prisma/schema.prisma`
  - `Blueprint`: `id (uuid)`, `originalUrl`, `processedUrl?`, `name?`, `uploadedAt`, `lastProcessedAt?`.
- Generated client located at `src/generated/prisma` (configured via `generator client` output).

#### Backend API (src/app.ts)

- Loads env via `dotenv/config`.
- Uploads use `multer.memoryStorage()` (no local disk writes).
- DigitalOcean Spaces via `@aws-sdk/client-s3` with public-read ACL.
- Errors are logged and returned with messages; Axios errors are type-narrowed using `axios.isAxiosError`.

Endpoints

1. `POST /api/blueprints/upload`
   - Form-data field: `blueprint` (file)
   - Response: `{ id: string, url: string, message: string }`

2. `POST /api/blueprints/process`
   - JSON body: `{ blueprintId: string, prompt: string }`
   - Invokes Python at `${PYTHON_MICROSERVICE_URL}/process_blueprint`
   - Python response expected: `{ processed_image_base64: string }`
   - Response: `{ url: string | null, message: string }`

Python Microservice Contract

- Request body sent from Node:

```json
{
  "image_url": "<public-URL-to-original-image>",
  "prompt": "<instructions>"
}
```

- Response body expected from Python:

```json
{
  "processed_image_base64": "<base64 PNG data>"
}
```

#### Storage Layout (DigitalOcean Spaces)

- Original uploads: `blueprints/original/<uuid>.<ext>`
- Processed outputs: `blueprints/processed/<uuid>.png`
- Public URLs are constructed as `${DO_SPACES_ENDPOINT}/${DO_SPACES_BUCKET}/${key}`.

#### Environment Variables (.env)

- `PORT` – API port (default 3000)
- `DATABASE_URL` – PostgreSQL connection for Prisma
- `DO_SPACES_ENDPOINT` – e.g., `https://nyc3.digitaloceanspaces.com`
- `DO_SPACES_KEY` / `DO_SPACES_SECRET` – DO Spaces credentials
- `DO_SPACES_BUCKET` – bucket name
- `PYTHON_MICROSERVICE_URL` – base URL of the Python service

Example

```bash
PORT=3000
DATABASE_URL=postgresql://user:pass@host:5432/db
DO_SPACES_ENDPOINT=https://nyc3.digitaloceanspaces.com
DO_SPACES_KEY=...
DO_SPACES_SECRET=...
DO_SPACES_BUCKET=fencify
PYTHON_MICROSERVICE_URL=http://localhost:8000
```

#### Running Locally

- Install: `npm install`
- Frontend dev server: `npm run dev`
- Backend API (TypeScript): `npx ts-node src/app.ts`
- Type-check: `npm run type-check`
- Lint: `npm run lint`

Notes

- In production, build the frontend (`vite build`) and run the backend with a Node-compatible build of `src/app.ts` (e.g., via `tsc` or a bundler) if not using ts-node in production.

#### Testing

- Unit tests: Vitest (`npm run test:unit`). Test tsconfig in `tsconfig.vitest.json` includes `.vue` files.
- E2E: Playwright (`npm run test:e2e`). Config at `playwright.config.ts` auto-starts the Vite dev/preview server.

#### Frontend

- Minimal starter: `src/App.vue` shows a placeholder message.
- Router: `src/router/index.ts` currently has no routes.
- State: sample Pinia store at `src/stores/counter.ts`.

#### Error Handling & Logging

- API returns 4xx for invalid input and 5xx for unexpected failures.
- Processing errors surface Python error payloads when available.

#### Directory Pointers

- Backend API: `src/app.ts`
- Frontend app: `src/` (entry `main.ts`, components in `App.vue`)
- Prisma schema: `prisma/schema.prisma`
- Generated Prisma client: `src/generated/prisma`
- E2E tests: `e2e/`
