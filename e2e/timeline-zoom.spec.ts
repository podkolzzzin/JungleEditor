import { test, expect } from '@playwright/test'
import { setupFSMock, createProject } from './helpers'

test.describe('Timeline Zoom', () => {
  test.beforeEach(async ({ page }) => {
    await setupFSMock(page)
  })

  test('timeline zoom controls', async ({ page }) => {
    await page.goto('/')

    // Create project
    await createProject(page)
    await expect(page.locator('.app-shell')).toBeVisible()

    // Create a timeline
    await page.evaluate(() => {
      window.prompt = () => 'Zoom Test'
    })
    await page.locator('.panel-btn[title="New Timeline"]').click()
    await expect(page.locator('.timeline-editor')).toBeVisible({ timeout: 5000 })

    // Zoom in
    const zoomIn = page.locator('.zoom-controls .tl-tool-btn.small').last()
    const zoomOut = page.locator('.zoom-controls .tl-tool-btn.small').first()
    const label = page.locator('.zoom-label')

    await expect(label).toHaveText('100%')

    await zoomIn.click()
    const afterZoomIn = await label.textContent()
    expect(parseInt(afterZoomIn!)).toBeGreaterThan(100)

    await zoomOut.click()
    await zoomOut.click()
    const afterZoomOut = await label.textContent()
    expect(parseInt(afterZoomOut!)).toBeLessThan(parseInt(afterZoomIn!))

    // Reset
    await label.click()
    await expect(label).toHaveText('100%')
  })
})
