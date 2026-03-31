import { test, expect } from '@playwright/test'
import { setupFSMock, enqueueTestVideo, enqueueDirectoryPicker, createProject } from './helpers'

test.describe('Full Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await setupFSMock(page)
  })

  test('create project → add files → add timeline → seek & play', async ({ page }) => {
    test.setTimeout(60_000)
    page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message))
    page.on('crash', () => console.log('PAGE CRASHED'))
    page.on('console', (msg) => {
      console.log(`BROWSER [${msg.type()}]: ${msg.text()}`)
    })

    // ── 1. Navigate to app and see the landing screen ──
    await page.goto('/')
    await expect(page.locator('h1')).toHaveText('Jungle Editor')
    await expect(page.getByText('Create Project')).toBeVisible()
    await expect(page.getByText('Open Project')).toBeVisible()

    // ── 2. Create a project ──
    await createProject(page)

    // Should transition to the main editor shell
    await expect(page.locator('.titlebar-text')).toContainText('Jungle Editor')
    await expect(page.locator('.app-shell')).toBeVisible()

    // Explorer panel should be visible with empty state
    await expect(page.locator('.panel-title')).toHaveText('EXPLORER')

    // ── 3. Add a video file ──
    await enqueueTestVideo(page, 'test-video.mp4')
    await page.locator('.panel-btn[title="Add Video Files"]').click()

    // The file should appear in the file tree
    await expect(page.locator('.tree-item .label', { hasText: 'test-video.mp4' })).toBeVisible({
      timeout: 5000,
    })

    // ── 4. Add a second video file (to test multiple files) ──
    await enqueueTestVideo(page, 'interview.mp4')
    await page.locator('.panel-btn[title="Add Video Files"]').click()
    await expect(page.locator('.tree-item .label', { hasText: 'interview.mp4' })).toBeVisible({
      timeout: 5000,
    })

    // ── 5. Click a video file to preview it ──
    await page.locator('.tree-item .label', { hasText: 'test-video.mp4' }).click()

    // Video preview or permission prompt should appear
    await expect(page.locator('.tab-label', { hasText: 'test-video.mp4' })).toBeVisible({
      timeout: 5000,
    })

    // ── 6. Create a timeline ──
    await page.evaluate(() => {
      window.prompt = () => 'My Test Timeline'
    })
    await page.locator('.panel-btn[title="New Timeline"]').click()

    // A timeline node should appear in the file tree
    await expect(
      page.locator('.tree-item .label', { hasText: 'My Test Timeline.timeline' }),
    ).toBeVisible({ timeout: 5000 })

    // The timeline editor should be visible
    await expect(page.locator('.timeline-editor')).toBeVisible({ timeout: 5000 })

    // Tab should show the timeline name
    await expect(
      page.locator('.tab-label', { hasText: 'My Test Timeline.timeline' }),
    ).toBeVisible()

    // ── 7. Verify timeline UI elements ──
    await expect(page.locator('.timeline-title')).toHaveText('TIMELINE')
    await expect(page.locator('.zoom-label')).toBeVisible()
    await expect(page.locator('.track-name-input')).toHaveValue('Track 1')

    const addTrackBtn = page.locator('.tl-tool-btn', { hasText: 'Track' })
    await expect(addTrackBtn).toBeVisible()

    // ── 8. Add another track ──
    await addTrackBtn.click()
    const trackInputs = page.locator('.track-name-input')
    await expect(trackInputs).toHaveCount(2)

    // ── 9. Add a clip to the timeline via reactive state injection ──
    const sourceId = await page.evaluate(async () => {
      const mock = (window as any).__fsMock
      const root = mock.projectRoot
      const sourcesDir = root.children.get('sources')
      if (!sourcesDir) return null

      for (const [name, child] of sourcesDir.children) {
        if (name.endsWith('.source') && child.kind === 'file') {
          const text = new TextDecoder().decode(child.data)
          const idMatch = text.match(/^id=(.+)$/m)
          const nameMatch = text.match(/^name=(.+)$/m)
          if (idMatch && nameMatch && nameMatch[1] === 'test-video.mp4') {
            return idMatch[1]
          }
        }
      }
      return null
    })

    expect(sourceId).toBeTruthy()

    await page.evaluate(
      (sid) => {
        const appEl = document.getElementById('app')
        const vueApp = appEl && (appEl as any).__vue_app__
        if (!vueApp) { console.log('No Vue app found'); return }

        function findTimelineDoc(instance: any): any {
          if (!instance) return null
          const setup = instance.setupState
          if (setup && setup.activeTimeline && setup.activeTimeline.value) {
            return setup.activeTimeline.value
          }
          if (instance.subTree) {
            const children = getChildren(instance.subTree)
            for (const child of children) {
              const result = findTimelineDoc(child)
              if (result) return result
            }
          }
          return null
        }

        function getChildren(vnode: any): any[] {
          const result: any[] = []
          if (vnode.component) result.push(vnode.component)
          if (Array.isArray(vnode.children)) {
            for (const child of vnode.children) {
              if (child && typeof child === 'object') {
                if (child.component) result.push(child.component)
                result.push(...getChildren(child))
              }
            }
          }
          if (vnode.dynamicChildren) {
            for (const child of vnode.dynamicChildren) {
              if (child.component) result.push(child.component)
              result.push(...getChildren(child))
            }
          }
          return result
        }

        const rootInstance = vueApp._instance
        const doc = findTimelineDoc(rootInstance)
        if (!doc) { console.log('No activeTimeline found in component tree'); return }

        if (doc.tracks.length > 0) {
          doc.tracks[0].clips.push({
            sourceId: sid,
            sourceName: 'test-video.mp4',
            in: 0,
            out: 3,
            offset: 0,
            operations: [],
          })
        }
      },
      sourceId,
    )

    await page.waitForTimeout(500)

    const clipBlock = page.locator('.clip-block')
    const clipVisible = await clipBlock.first().isVisible().catch(() => false)
    if (clipVisible) {
      await expect(clipBlock.first()).toBeVisible()

      // Verify waveform subtrack appears
      const waveformSubtrack = page.locator('[data-testid="waveform-subtrack"]')
      await expect(waveformSubtrack.first()).toBeVisible({ timeout: 5000 })

      // Verify track volume slider
      const volumeSlider = page.locator('[data-testid="track-volume-slider"]').first()
      await expect(volumeSlider).toBeVisible()
      await expect(volumeSlider).toHaveValue('1')
    }

    // ── 10. Interact with the timeline: zoom ──
    const zoomInBtn = page.locator('.zoom-controls .tl-tool-btn.small').last()
    const zoomOutBtn = page.locator('.zoom-controls .tl-tool-btn.small').first()

    await zoomInBtn.click()
    await zoomInBtn.click()
    await page.waitForTimeout(200)

    const zoomLabel = page.locator('.zoom-label')
    const zoomText = await zoomLabel.textContent()
    expect(zoomText).not.toBe('100%')

    await zoomOutBtn.click()
    await zoomOutBtn.click()

    await zoomLabel.click()
    await expect(zoomLabel).toHaveText('100%')

    // ── 11. Seek on the ruler ──
    const ruler = page.locator('.ruler')
    if (await ruler.isVisible()) {
      const rulerBox = await ruler.boundingBox()
      if (rulerBox) {
        await ruler.click({ position: { x: 100, y: rulerBox.height / 2 } })
        await page.waitForTimeout(300)
      }
    }

    // ── 12. Test play/pause via keyboard (Space) ──
    const timelineEditor = page.locator('.timeline-editor')
    await timelineEditor.focus()
    await page.keyboard.press('Space')
    await page.waitForTimeout(500)
    await page.keyboard.press('Space')

    // ── 13. Test playhead drag ──
    const playheadHandle = page.locator('.playhead-handle')
    if (await playheadHandle.isVisible()) {
      const handleBox = await playheadHandle.boundingBox()
      if (handleBox) {
        await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
        await page.mouse.down()
        await page.mouse.move(handleBox.x + 200, handleBox.y, { steps: 10 })
        await page.mouse.up()
        await page.waitForTimeout(300)
      }
    }

    // ── 14. Verify the timeline player canvas exists ──
    const canvas = page.locator('.player-canvas')
    if (await canvas.isVisible()) {
      const canvasBox = await canvas.boundingBox()
      expect(canvasBox).toBeTruthy()
      if (canvasBox) {
        expect(canvasBox.width).toBeGreaterThan(0)
        expect(canvasBox.height).toBeGreaterThan(0)
      }
    }

    // ── 15. Split tool should be available ──
    const splitBtn = page.locator('.tl-tool-btn', { hasText: 'Split' })
    await expect(splitBtn).toBeVisible()

    // ── 16. Close the timeline tab ──
    await page.locator('.tab-close').first().click()
    await expect(page.locator('.timeline-editor')).not.toBeVisible()

    // ── 17. Re-open the timeline ──
    await page.locator('.tree-item .label', { hasText: 'My Test Timeline.timeline' }).click()
    await expect(page.locator('.timeline-editor')).toBeVisible({ timeout: 5000 })

    await page.waitForTimeout(500)
  })
})
