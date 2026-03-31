import { test, expect } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEST_VIDEO = path.resolve(__dirname, 'fixtures/test-video.mp4')

test.describe('Import Media — Open Video File', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('editor-layout')).toBeVisible()
  })

  test('editor loads with empty media bin', async ({ page }) => {
    await expect(page.getByTestId('media-bin')).toBeVisible()
    await expect(page.getByTestId('media-bin-empty')).toBeVisible()
    await expect(page.getByTestId('timeline-empty')).toBeVisible()
  })

  test('import video via file picker', async ({ page }) => {
    // Listen for the file chooser triggered by the import button
    const fileChooserPromise = page.waitForEvent('filechooser')
    await page.getByTestId('import-media-btn').click()
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles(TEST_VIDEO)

    // Media item should appear in the media bin
    await expect(page.getByTestId('media-item-name').first()).toHaveText('test-video.mp4')

    // Empty state should be gone
    await expect(page.getByTestId('media-bin-empty')).not.toBeVisible()
  })
})
