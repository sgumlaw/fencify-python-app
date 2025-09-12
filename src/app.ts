import 'dotenv/config' // Load .env first
import express from 'express'
import multer from 'multer'
import { S3Client } from '@aws-sdk/client-s3'
import { httpClient } from './http/axios'
import { putPublicObject } from './s3/upload'
import path from 'path'
import crypto from 'crypto' // For generating unique filenames

const app = express()
const port = process.env.PORT || 3000

// In-memory map to track uploaded blueprint URLs by ID (non-persistent)
const blueprintStore = new Map<string, { url: string; name?: string }>()

// Multer storage with limits
const storage = multer.memoryStorage()
const upload = multer({
  storage: storage,
  limits: { fileSize: 25 * 1024 * 1024, files: 1, fieldSize: 1 * 1024 * 1024 },
  fileFilter: (
    _req: any,
    file: { mimetype: string },
    cb: (arg0: Error | null, arg1: boolean) => void,
  ) => {
    const ok = /pdf|png|jpe?g/i.test(file.mimetype)
    cb(ok ? null : new Error('Unsupported file type'), ok)
  },
})

// DigitalOcean Spaces client setup
const s3Client = new S3Client({
  endpoint: process.env.DO_SPACES_ENDPOINT,
  region: 'us-east-1', // Your DO Space region (e.g., 'nyc3', 'sfo3')
  credentials: {
    accessKeyId: process.env.DO_SPACES_KEY!,
    secretAccessKey: process.env.DO_SPACES_SECRET!,
  },
})

const DO_SPACES_BUCKET = process.env.DO_SPACES_BUCKET!
const DO_SPACES_PUBLIC_BASE = process.env.DO_SPACES_PUBLIC_BASE
const PYTHON_MICROSERVICE_URL = process.env.PYTHON_MICROSERVICE_URL!

// Middleware
app.set('trust proxy', 1)
app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true, limit: '1mb' }))

// Serve static Vue.js files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../dist')))
  app.get('/', (req, res) => {
    res.sendFile(path.resolve(__dirname, '../dist', 'index.html'))
  })
}

// --- API Endpoints ---

// POST /api/blueprints/upload
app.post('/api/blueprints/upload', upload.single('blueprint'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No blueprint file provided.' })
  }

  try {
    const file = req.file as Express.Multer.File
    const originalFileName = file.originalname
    const fileExtension = path.extname(originalFileName)
    const uniqueFileName = `${crypto.randomUUID()}${fileExtension}`
    const filePath = `blueprints/original/${uniqueFileName}`
    const fileUrl = DO_SPACES_PUBLIC_BASE
      ? `${DO_SPACES_PUBLIC_BASE}/${filePath}`
      : `${process.env.DO_SPACES_ENDPOINT}/${DO_SPACES_BUCKET}/${filePath}`

    // Upload to DigitalOcean Spaces with cache headers; rely on bucket policy for public-read
    await putPublicObject(s3Client, DO_SPACES_BUCKET, filePath, file.buffer, file.mimetype)

    // Track in memory for subsequent processing requests
    const id = crypto.randomUUID()
    blueprintStore.set(id, { url: fileUrl, name: originalFileName })

    res.status(201).json({ id, url: fileUrl, message: 'Blueprint uploaded successfully.' })
  } catch (error: unknown) {
    let errorMessage = 'Unknown error'
    if (error instanceof Error) {
      errorMessage = error.message
    }
    console.error('Error uploading blueprint:', error)
    res.status(500).json({ message: 'Failed to upload blueprint.', error: errorMessage })
  }
})

// POST /api/blueprints/process
app.post('/api/blueprints/process', async (req, res) => {
  const { blueprintId, originalUrl, prompt } = req.body as {
    blueprintId?: string
    originalUrl?: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prompt?: any
  }

  if (!prompt) {
    return res.status(400).json({ message: 'Prompt is required.' })
  }

  // Resolve source image URL either from request or in-memory store
  let sourceUrl: string | undefined = originalUrl
  if (!sourceUrl && blueprintId) {
    sourceUrl = blueprintStore.get(blueprintId)?.url
  }
  if (!sourceUrl) {
    return res
      .status(400)
      .json({ message: 'Provide originalUrl or a known blueprintId from a prior upload.' })
  }

  try {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`Calling Python microservice for blueprint ${sourceUrl} with prompt:`, prompt)
    }

    const body = {
      mode: 'fence_extract',
      inputType: 'layout',
      image_url: sourceUrl,
      progressive: true,
      want: { overlayPng: false, geometryJson: true },
      ...prompt,
    }

    const r = await httpClient.post<Record<string, unknown>>(
      `${PYTHON_MICROSERVICE_URL}/process_blueprint`,
      body,
      { responseType: 'json' },
    )

    if (!r.data || (r.data as Record<string, unknown>).error) {
      const errMsg = (r.data as Record<string, unknown>)?.error as string | undefined
      throw new Error(errMsg || 'Processor error')
    }

    const jsonKey = `blueprints/processed/${crypto.randomUUID()}.json`
    const jsonString = JSON.stringify(r.data)
    await putPublicObject(s3Client, DO_SPACES_BUCKET, jsonKey, jsonString, 'application/json')
    const processedJsonUrl = DO_SPACES_PUBLIC_BASE
      ? `${DO_SPACES_PUBLIC_BASE}/${jsonKey}`
      : `${process.env.DO_SPACES_ENDPOINT}/${DO_SPACES_BUCKET}/${jsonKey}`

    return res
      .status(200)
      .json({ url: processedJsonUrl, message: 'Blueprint processed successfully.' })
  } catch (error: unknown) {
    const err = error as { response?: { data?: unknown }; message?: string } | unknown
    const asObj = err as { response?: { data?: unknown }; message?: string }
    const payload = asObj?.response?.data || asObj?.message || String(error)
    console.error('Error processing blueprint:', payload)
    return res.status(500).json({ message: 'Failed to process blueprint.', error: payload })
  }
})

// Start server
app.listen(port, () => {
  console.log(`Node.js API listening on port ${port}`)
})

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down.')
  process.exit(0)
})
process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down.')
  process.exit(0)
})
