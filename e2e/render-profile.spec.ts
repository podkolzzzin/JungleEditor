import { test, expect } from '@playwright/test'
import { setupFSMock, createProject } from './helpers'

test.describe('Render Profile', () => {
  test.beforeEach(async ({ page }) => {
    await setupFSMock(page)
  })

  test('create render profile via context menu on timeline', async ({ page }) => {
    await page.goto('/')

    // Create project
    await createProject(page)
    await expect(page.locator('.app-shell')).toBeVisible()

    // Create a timeline
    await page.locator('.panel-btn[title="New Timeline"]').click()
    await page.locator('.input-dialog-field').fill('Render Test')
    await page.locator('.input-dialog-field').press('Enter')
    await expect(page.locator('.timeline-editor')).toBeVisible({ timeout: 5000 })

    // Right-click the timeline file in the file tree
    const timelineItem = page.locator('.tree-item', {
      has: page.locator('.label', { hasText: 'Render Test.timeline' }),
    })
    await timelineItem.click({ button: 'right' })

    // Context menu should appear with "Create Render Profile"
    await expect(page.locator('.ctx-menu')).toBeVisible({ timeout: 3000 })
    await expect(page.locator('.ctx-item', { hasText: 'Create Render Profile' })).toBeVisible()

    // Click "Create Render Profile"
    await page.locator('.ctx-item', { hasText: 'Create Render Profile' }).click()

    // Input dialog should appear for profile name
    await expect(page.locator('.input-dialog-field')).toBeVisible({ timeout: 3000 })
    await page.locator('.input-dialog-field').fill('My Render')
    await page.locator('.input-dialog-field').press('Enter')

    // A .render node should appear in the file tree
    await expect(
      page.locator('.tree-item .label', { hasText: 'My Render.render' }),
    ).toBeVisible({ timeout: 5000 })

    // The render editor should be visible (opened in a tab)
    await expect(page.locator('.render-editor')).toBeVisible({ timeout: 5000 })

    // Verify render editor has key elements
    await expect(page.locator('.render-title')).toContainText('Render Profile')
    await expect(page.locator('.render-timeline')).toContainText('Render Test')
  })

  test('background tasks panel accessible from activity bar', async ({ page }) => {
    await page.goto('/')

    // Create project
    await createProject(page)
    await expect(page.locator('.app-shell')).toBeVisible()

    // Click the tasks icon in the activity bar
    const tasksBtn = page.locator('.ab-btn[title="Background Tasks"]')
    await expect(tasksBtn).toBeVisible()
    await tasksBtn.click()

    // Background tasks panel should be visible
    await expect(page.locator('.bg-tasks-panel')).toBeVisible({ timeout: 3000 })
    await expect(page.locator('.panel-title', { hasText: 'BACKGROUND TASKS' })).toBeVisible()
    await expect(page.locator('.empty-state', { hasText: 'No background tasks' })).toBeVisible()

    // Click back to explorer
    const explorerBtn = page.locator('.ab-btn[title="Explorer"]')
    await explorerBtn.click()
    await expect(page.locator('.panel-title', { hasText: 'EXPLORER' })).toBeVisible()
  })

  test('click .render file opens render editor', async ({ page }) => {
    await page.goto('/')

    // Create project
    await createProject(page)
    await expect(page.locator('.app-shell')).toBeVisible()

    // Create a timeline first
    await page.locator('.panel-btn[title="New Timeline"]').click()
    await page.locator('.input-dialog-field').fill('Test TL')
    await page.locator('.input-dialog-field').press('Enter')
    await expect(page.locator('.timeline-editor')).toBeVisible({ timeout: 5000 })

    // Right-click timeline to create render profile
    const timelineItem = page.locator('.tree-item', {
      has: page.locator('.label', { hasText: 'Test TL.timeline' }),
    })
    await timelineItem.click({ button: 'right' })
    await page.locator('.ctx-item', { hasText: 'Create Render Profile' }).click()
    await page.locator('.input-dialog-field').fill('Export Profile')
    await page.locator('.input-dialog-field').press('Enter')

    // Render editor should open
    await expect(page.locator('.render-editor')).toBeVisible({ timeout: 5000 })

    // Switch back to timeline
    const timelineTab = page.locator('.tab-item', { hasText: 'Test TL.timeline' })
    if (await timelineTab.isVisible()) {
      await timelineTab.click()
      await expect(page.locator('.timeline-editor')).toBeVisible({ timeout: 3000 })
    }

    // Click the .render file in the tree to go back to render editor
    await page.locator('.tree-item .label', { hasText: 'Export Profile.render' }).click()
    await expect(page.locator('.render-editor')).toBeVisible({ timeout: 5000 })
  })
})
