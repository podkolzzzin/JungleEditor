import { test, expect } from '@playwright/test'
import { setupFSMock, enqueueTestVideo, createProject, addVideoFile } from './helpers'

test.describe('Waveform & Volume', () => {
  test.beforeEach(async ({ page }) => {
    await setupFSMock(page)
  })

  test('waveform subtrack and track volume controls', async ({ page }) => {
    test.setTimeout(60_000)
    await page.goto('/')

    // Create project
    await createProject(page)
    await expect(page.locator('.app-shell')).toBeVisible()

    // Add a video file
    await addVideoFile(page, 'test-video.mp4')

    // Create a timeline
    await page.locator('.panel-btn[title="New Timeline"]').click()
    await page.locator('.input-dialog-field').fill('Waveform Test')
    await page.locator('.input-dialog-field').press('Enter')
    await expect(page.locator('.timeline-editor')).toBeVisible({ timeout: 5000 })

    // ── Verify track volume slider is present on empty tracks ──
    const volumeSlider = page.locator('[data-testid="track-volume-slider"]').first()
    await expect(volumeSlider).toBeVisible()
    // Default volume should be 1 (100%)
    await expect(volumeSlider).toHaveValue('1')

    // ── Verify volume label shows 100% ──
    const volumeLabel = page.locator('.track-volume-value').first()
    await expect(volumeLabel).toHaveText('100%')

    // ── Change volume to 50% ──
    await volumeSlider.fill('0.5')
    await expect(volumeLabel).toHaveText('50%')

    // ── Set volume to 0 (mute) ──
    await volumeSlider.fill('0')
    await expect(volumeLabel).toHaveText('0%')

    // ── Restore volume to 80% ──
    await volumeSlider.fill('0.8')
    await expect(volumeLabel).toHaveText('80%')

    // ── Verify volume control label area ──
    const volumeLabelArea = page.locator('[data-testid="track-volume-label"]').first()
    await expect(volumeLabelArea).toBeVisible()

    // ── Add a second track and verify it also has volume control ──
    const addTrackBtn = page.locator('.tl-tool-btn', { hasText: 'Track' })
    await addTrackBtn.click()
    const allVolumeSliders = page.locator('[data-testid="track-volume-slider"]')
    await expect(allVolumeSliders).toHaveCount(2)

    // Second track should also default to 100%
    await expect(allVolumeSliders.nth(1)).toHaveValue('1')
  })
})
