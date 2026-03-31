import { test, expect } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEST_VIDEO = path.resolve(__dirname, 'fixtures/test-video.mp4')

test.describe('Export / Render', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('editor-layout')).toBeVisible()

    // Import a video
    const fileChooserPromise = page.waitForEvent('filechooser')
    await page.getByTestId('import-media-btn').click()
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles(TEST_VIDEO)
    await expect(page.getByTestId('media-item-name').first()).toBeVisible()

    // Add to timeline
    await page.locator('[data-testclass="add-to-timeline-btn"]').first().click()
    await expect(page.locator('[data-testclass="clip"]').first()).toBeVisible()
  })

  test('export dialog opens when clicking Export button', async ({ page }) => {
    await page.getByTestId('export-btn').click()
    await expect(page.getByTestId('export-dialog')).toBeVisible()
  })

  test('export dialog shows project settings', async ({ page }) => {
    await page.getByTestId('export-btn').click()
    const dialog = page.getByTestId('export-dialog')
    await expect(dialog).toContainText('1920')
    await expect(dialog).toContainText('1080')
    await expect(dialog).toContainText('30')
  })

  test('export dialog can be closed', async ({ page }) => {
    await page.getByTestId('export-btn').click()
    await expect(page.getByTestId('export-dialog')).toBeVisible()

    await page.getByTestId('export-close-btn').click()
    await expect(page.getByTestId('export-dialog')).not.toBeVisible()
  })

  test('full export flow completes with progress', async ({ page }) => {
    await page.getByTestId('export-btn').click()
    await expect(page.getByTestId('export-dialog')).toBeVisible()

    // Start the export
    await page.getByTestId('start-export-btn').click()

    // Progress should appear
    await expect(page.getByTestId('export-progress-text')).toBeVisible()

    // Wait for completion (the simulated export takes ~2s)
    await expect(page.getByTestId('export-done-message')).toBeVisible({ timeout: 10000 })

    // Close the dialog
    await page.getByTestId('export-done-close-btn').click()
    await expect(page.getByTestId('export-dialog')).not.toBeVisible()
  })
})
