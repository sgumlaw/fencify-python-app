import { test, expect } from '@playwright/test'
import path from 'path'

const LIVE = process.env.LIVE_API === '1'

test.describe('Blueprint upload + process flow', () => {
  test('uploads a blueprint and highlights fence lines', async ({ page }) => {
    // --- MOCK API (default) ---
    // eslint-disable-next-line playwright/no-conditional-in-test
    if (!LIVE) {
      // Mock /api/blueprints/upload
      await page.route('**/api/blueprints/upload', async (route) => {
        // Simulate the Node API returning an id + public originalUrl
        const fake = {
          id: 'bp_12345',
          url: 'https://example.org/fake-original.png',
          message: 'Blueprint uploaded successfully.',
        }
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(fake),
        })
      })

      // Mock /api/blueprints/process
      await page.route('**/api/blueprints/process', async (route) => {
        // Return a "processed" image URL (pretend Spaces URL)
        const body = JSON.parse(route.request().postData() || '{}')
        // eslint-disable-next-line playwright/no-conditional-expect
        expect(body).toMatchObject({
          blueprintId: 'bp_12345',
          prompt: { type: 'highlight' },
        })

        const fake = {
          url: 'https://example.org/fake-processed.png',
          message: 'Blueprint processed successfully.',
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(fake),
        })
      })

      // Optional: stub the fake image responses so <img> shows as loaded
      await page.route('https://example.org/*.png', async (route) => {
        // tiny 1x1 png
        const pixel =
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII='
        await route.fulfill({
          status: 200,
          headers: { 'content-type': 'image/png' },
          body: Buffer.from(pixel, 'base64'),
        })
      })
    }

    // --- VISIT APP ---
    await page.goto('/')

    // Expect the uploader exists
    const fileInput = page.locator('input[type="file"]')
    await expect(fileInput).toBeVisible()

    // Upload file
    const fixturePath = path.join(__dirname, 'fixtures', 'blueprint-sample.png')
    await fileInput.setInputFiles(fixturePath)

    // Expect UI reflects "uploaded"
    await expect(page.getByText(/uploaded/i)).toBeVisible()

    // Choose options (default target=fence, choose color)
    const colorInput = page.locator('input[type="color"]')
    // eslint-disable-next-line playwright/no-conditional-in-test
    if (await colorInput.isVisible()) {
      await colorInput.fill('#FF0000')
    }

    // Click "Run highlight"
    const runBtn = page.getByRole('button', { name: /run highlight/i })
    await runBtn.click()

    // Wait for processing to complete
    // If mocked, we immediately get processedUrl; if live, allow more time
    const processedImg = page.locator('img[alt="processed"]')
    await expect(processedImg).toBeVisible({ timeout: LIVE ? 30_000 : 5_000 })

    // Basic sanity: the processed image has a src
    await expect(processedImg).toHaveAttribute('src', /https?:\/\//)

    // Optional: Visual check that original also visible
    const originalImg = page.locator('img[alt="original"]')
    await expect(originalImg).toBeVisible()
  })
})
