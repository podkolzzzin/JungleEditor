import { test, expect } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEST_VIDEO = path.resolve(__dirname, 'fixtures/test-video.mp4')

test.describe('Cut (Split) Clip', () => {
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

  test('split clip at playhead creates two clips', async ({ page }) => {
    // Select the clip
    await page.locator('[data-testclass="clip"]').first().click()

    // Set playhead to the middle of the clip (1.5s for a ~3s video) via the store
    // We expose the store through the app's Pinia instance
    await page.evaluate(() => {
      // Access the Pinia store from the Vue app
      const app = (document.querySelector('#app') as any).__vue_app__
      const pinia = app.config.globalProperties.$pinia
      const store = pinia._s.get('project')
      store.currentTime = 1.5
    })

    // Click the split button
    await page.getByTestId('split-btn').click()

    // Should now have 2 clips
    await expect(page.locator('[data-testclass="clip"]')).toHaveCount(2)
  })

  test('cut tool splits clip on click', async ({ page }) => {
    // Activate the cut tool
    await page.getByTestId('cut-tool-btn').click()

    // Click in the middle of the clip to split it
    const clip = page.locator('[data-testclass="clip"]').first()
    const clipBox = await clip.boundingBox()
    expect(clipBox).toBeTruthy()

    await clip.click({
      position: {
        x: clipBox!.width / 2,
        y: clipBox!.height / 2,
      },
    })

    // Should now have 2 clips
    await expect(page.locator('[data-testclass="clip"]')).toHaveCount(2)
  })
})
