import { test, expect } from '@playwright/test'
import { setupFSMock, enqueueTestVideo, createProject, addVideoFile } from './helpers'

test.describe('Compressor', () => {
  test.beforeEach(async ({ page }) => {
    await setupFSMock(page)
  })

  test('right-click context menu opens compressor dialog', async ({ page }) => {
    await page.goto('/')

    // Create project
    await createProject(page)
    await expect(page.locator('.app-shell')).toBeVisible()

    // Add a video file
    await addVideoFile(page, 'test-video.mp4')

    // Right-click the video file in the file tree
    const fileItem = page.locator('.tree-item', { has: page.locator('.label', { hasText: 'test-video.mp4' }) })
    await fileItem.click({ button: 'right' })

    // Context menu should appear with "Compress…" option
    await expect(page.locator('.ctx-menu')).toBeVisible({ timeout: 3000 })
    await expect(page.locator('.ctx-item', { hasText: 'Compress…' })).toBeVisible()

    // Click "Compress…" to open the dialog
    await page.locator('.ctx-item', { hasText: 'Compress…' }).click()

    // CompressorDialog should open
    await expect(page.locator('.compressor-dialog')).toBeVisible({ timeout: 3000 })
    await expect(page.locator('.dialog-title', { hasText: 'Compress Video' })).toBeVisible()
    await expect(page.locator('.source-name', { hasText: 'test-video.mp4' })).toBeVisible()

    // Settings should be visible
    await expect(page.locator('.field-select').first()).toBeVisible()

    // Close the dialog
    await page.locator('.close-btn').click()
    await expect(page.locator('.compressor-dialog')).not.toBeVisible()
  })
})
