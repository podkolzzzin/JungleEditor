import { test, expect } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEST_VIDEO = path.resolve(__dirname, 'fixtures/test-video.mp4')

test.describe('Add Media to Timeline', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('editor-layout')).toBeVisible()

    // Import a video first
    const fileChooserPromise = page.waitForEvent('filechooser')
    await page.getByTestId('import-media-btn').click()
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles(TEST_VIDEO)
    await expect(page.getByTestId('media-item-name').first()).toBeVisible()
  })

  test('add video to timeline via button', async ({ page }) => {
    // Click the "Add to Timeline" button on the media item
    await page.locator('[data-testclass="add-to-timeline-btn"]').first().click()

    // A track should appear
    await expect(page.locator('[data-testclass="track"]').first()).toBeVisible()

    // A clip should appear on the track
    await expect(page.locator('[data-testclass="clip"]').first()).toBeVisible()

    // The timeline empty state should be gone
    await expect(page.getByTestId('timeline-empty')).not.toBeVisible()
  })

  test('add video to timeline via double-click', async ({ page }) => {
    // Double-click the media item
    await page.locator('[data-testclass="media-item"]').first().dblclick()

    // A clip should appear
    await expect(page.locator('[data-testclass="clip"]').first()).toBeVisible()
  })

  test('clip displays media name', async ({ page }) => {
    await page.locator('[data-testclass="add-to-timeline-btn"]').first().click()

    const clip = page.locator('[data-testclass="clip"]').first()
    await expect(clip).toBeVisible()
    await expect(clip).toContainText('test-video.mp4')
  })

  test('adding same media twice creates two clips', async ({ page }) => {
    await page.locator('[data-testclass="add-to-timeline-btn"]').first().click()
    await page.locator('[data-testclass="add-to-timeline-btn"]').first().click()

    const clips = page.locator('[data-testclass="clip"]')
    await expect(clips).toHaveCount(2)
  })
})
