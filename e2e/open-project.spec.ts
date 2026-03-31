import { test, expect } from '@playwright/test'
import { setupFSMock, enqueueDirectoryPicker } from './helpers'

test.describe('Open Project', () => {
  test.beforeEach(async ({ page }) => {
    await setupFSMock(page)
  })

  test('open project flow', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Open Project')).toBeVisible()

    // Enqueue a directory picker result
    await enqueueDirectoryPicker(page)
    await page.getByText('Open Project').click()

    // Should transition to editor
    await expect(page.locator('.app-shell')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('.panel-title')).toHaveText('EXPLORER')
  })
})
