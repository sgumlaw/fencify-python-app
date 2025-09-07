Blueprint Processing System – Codebase Overview

This system is composed of two services that work together to handle blueprint uploads, storage, and image processing:

Node.js Backend API

Handles client requests (upload, process).

Manages persistence with PostgreSQL (via Prisma).

Stores images in DigitalOcean Spaces (S3-compatible).

Orchestrates calls to the Python microservice.

Python Processing Microservice

Encapsulates image-processing logic using OpenCV, Tesseract OCR, and Pillow.

Exposes a simple HTTP API (Flask).

Processes blueprints based on prompts (e.g., scale, highlight, isolate).

Node.js Backend

Stack: TypeScript, Express, Prisma, PostgreSQL, AWS SDK (Spaces), Multer, Axios

Key Responsibilities

File Uploads

Receives uploaded blueprints (/api/blueprints/upload).

Uses Multer with memoryStorage.

Generates unique filenames and uploads directly to DigitalOcean Spaces.

Saves metadata in PostgreSQL via Prisma.

Blueprint Processing

Endpoint: /api/blueprints/process.

Retrieves blueprint metadata by ID.

Calls the Python microservice with the blueprint URL + prompt.

Receives a Base64-encoded processed image, uploads to Spaces, and updates DB record.

Database Schema (Prisma)

model Blueprint {
id String @id @default(uuid())
originalUrl String
processedUrl String?
name String?
uploadedAt DateTime @default(now())
lastProcessedAt DateTime?
}

Deployment Notes

Runs as a Node.js process (systemd or PM2 recommended).

Serves Vue frontend (if built) via express.static in production.

Uses .env for DB, Spaces, and microservice config.

Python Microservice

Stack: Python 3.12, Flask, OpenCV (headless), NumPy, Pillow, PyTesseract

Key Responsibilities

Image Download

Fetches the original blueprint from Spaces via HTTP.

Legend Scale Extraction

Attempts OCR on the lower-right corner of the image.

Supports simple formats (1:100, 1/4" = 1'-0").

Returns a numeric scale factor.

Processing Modes (via prompt)

scale: Resizes image by percentage factor.

highlight: Detects edges/contours and overlays highlight color.

isolate: Extracts lines (walls) onto a blank canvas.

Default: Marks as “Unknown Abstraction”.

Endpoints

POST /process_blueprint → JSON body with image_url + prompt.
Returns: Base64-encoded PNG of processed image.

GET /health → Simple health check { "ok": true }.

Deployment Notes

Installed in /opt/blueprint-processor.

Virtual environment: /opt/blueprint-processor/venv.

Managed by systemd (blueprint-processor.service).

Service binds to 0.0.0.0:5000 (accessible only locally or via private networking).

System Integration Flow

User uploads a blueprint via frontend → Node.js API.

Node saves file to DigitalOcean Spaces + DB.

User requests processing with prompt → Node.js API.

Node calls Python service with the blueprint URL + prompt.

Python processes the image → returns Base64 PNG.

Node uploads processed image to Spaces + updates DB.

API responds with processed image URL.

Operations & Deployment

DigitalOcean Droplet

Ubuntu 22.04, Node + Python + Tesseract installed.

Node API (port 3000) and Python microservice (port 5000).

Both managed by systemd.

Nginx reverse proxy routes public traffic to Node API only; Python stays internal.

Security

Secrets (DATABASE_URL, Spaces keys, microservice URL) stored in .env.

Files stored in Spaces with public-read ACL (adjust as needed).

Firewall (UFW or DO Cloud Firewall) should block direct access to Python port.

Scaling Strategy

Co-locate Node + Python on one droplet for simplicity.

Move Python service to a dedicated droplet if CPU-intensive processing increases.

Use DO VPC networking to connect Node and Python droplets privately.

Quick Health Checks

Node API:

curl -i http://localhost:3000/api/blueprints/upload
curl -i http://localhost:3000/api/blueprints/process

Python Service:

curl -s http://localhost:5000/health

Would you like me to extend this .md with concrete systemd unit file snippets for both services (Node + Python) so future deployments are copy-paste ready?
