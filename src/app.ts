import 'dotenv/config' // Load .env first
import express from 'express'
import multer from 'multer'
import { PrismaClient } from '@prisma/client'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import axios from 'axios'
import path from 'path'
import crypto from 'crypto' // For generating unique filenames

const app = express()
const port = process.env.PORT || 3000
const prisma = new PrismaClient()

// Multer storage: Using memoryStorage to directly upload to S3 without saving locally
const storage = multer.memoryStorage()
const upload = multer({ storage: storage })

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
const PYTHON_MICROSERVICE_URL = process.env.PYTHON_MICROSERVICE_URL!

// Middleware
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

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
    const file = req.file
    const originalFileName = file.originalname
    const fileExtension = path.extname(originalFileName)
    const uniqueFileName = `${crypto.randomUUID()}${fileExtension}`
    const filePath = `blueprints/original/${uniqueFileName}`
    const fileUrl = `${process.env.DO_SPACES_ENDPOINT}/${DO_SPACES_BUCKET}/${filePath}`

    // Upload to DigitalOcean Spaces
    await s3Client.send(
      new PutObjectCommand({
        Bucket: DO_SPACES_BUCKET,
        Key: filePath,
        Body: file.buffer,
        ACL: 'public-read', // Make the file publicly accessible
        ContentType: file.mimetype,
      }),
    )

    // Save blueprint metadata to PostgreSQL
    const newBlueprint = await prisma.blueprint.create({
      data: {
        originalUrl: fileUrl,
        name: originalFileName,
      },
    })

    res.status(201).json({
      id: newBlueprint.id,
      url: newBlueprint.originalUrl,
      message: 'Blueprint uploaded successfully.',
    })
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
  const { blueprintId, prompt } = req.body

  if (!blueprintId || !prompt) {
    return res.status(400).json({ message: 'Blueprint ID and prompt are required.' })
  }

  try {
    const blueprint = await prisma.blueprint.findUnique({ where: { id: blueprintId } })

    if (!blueprint) {
      return res.status(404).json({ message: 'Blueprint not found.' })
    }

    // Call Python Microservice
    console.log(
      `Calling Python microservice for blueprint ${blueprint.originalUrl} with prompt:`,
      prompt,
    )
    const pythonResponse = await axios.post<{ processed_image_base64: string }>(
      `${PYTHON_MICROSERVICE_URL}/process_blueprint`,
      {
        image_url: blueprint.originalUrl, // Pass URL to Python service
        prompt: prompt,
      },
    )

    const processedImageBase64 = pythonResponse.data.processed_image_base64
    if (!processedImageBase64) {
      throw new Error('Python microservice did not return processed image.')
    }

    // Convert base64 to Buffer and upload to DO Spaces
    const processedImageBuffer = Buffer.from(processedImageBase64, 'base64')
    const processedFileName = `blueprints/processed/${crypto.randomUUID()}.png` // Assuming PNG output
    const processedFileUrl = `${process.env.DO_SPACES_ENDPOINT}/${DO_SPACES_BUCKET}/${processedFileName}`

    await s3Client.send(
      new PutObjectCommand({
        Bucket: DO_SPACES_BUCKET,
        Key: processedFileName,
        Body: processedImageBuffer,
        ACL: 'public-read',
        ContentType: 'image/png', // Or detect from base64 string
      }),
    )

    // Update blueprint in DB with new processed image URL
    const updatedBlueprint = await prisma.blueprint.update({
      where: { id: blueprintId },
      data: {
        processedUrl: processedFileUrl,
        lastProcessedAt: new Date(),
      },
    })

    res
      .status(200)
      .json({ url: updatedBlueprint.processedUrl, message: 'Blueprint processed successfully.' })
  } catch (error: unknown) {
    if (error instanceof Error) {
      // error is an Error object
      // Try to get response data if error is an AxiosError
      const responseData = axios.isAxiosError(error) ? error.response?.data : undefined
      console.error('Error processing blueprint:', responseData || error.message)
      res.status(500).json({
        message: 'Failed to process blueprint.',
        error: responseData || error.message,
      })
    } else {
      // error is not an Error object
      console.error('Error processing blueprint:', error)
      res.status(500).json({
        message: 'Failed to process blueprint.',
        error: String(error),
      })
    }
  }
})

// Start server
app.listen(port, () => {
  console.log(`Node.js API listening on port ${port}`)
})

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Closing database connection.')
  await prisma.$disconnect()
  process.exit(0)
})
