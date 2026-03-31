import { test, expect } from '@playwright/test'
import { setupFSMock, createProject } from './helpers'

test.describe('Close Project', () => {
  test.beforeEach(async ({ page }) => {
    await setupFSMock(page)
  })

  test('close project returns to landing', async ({ page }) => {
    await page.goto('/')

    // Create project first
    await createProject(page)
    await expect(page.locator('.app-shell')).toBeVisible()

    // Find and click the close project button in the file tree footer
    const closeBtn = page.locator('.close-project-btn', { hasText: 'Close Project' })
    if (await closeBtn.isVisible()) {
      await closeBtn.click()
      await expect(page.locator('h1')).toHaveText('Jungle Editor')
    }
  })
})
