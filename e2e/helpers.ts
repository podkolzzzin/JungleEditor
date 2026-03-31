import { Page } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const TEST_VIDEO_PATH = path.resolve(__dirname, 'fixtures/test-video.mp4')
const FS_MOCK_PATH = path.resolve(__dirname, 'fs-mock-init.js')

/** Inject the File System Access API mock before the app loads. */
export async function setupFSMock(page: Page) {
  await page.addInitScript({ path: FS_MOCK_PATH })
}

/**
 * Push the test video file into the mock FS queue so the next
 * `showOpenFilePicker` returns it. Must be called *after* page.goto().
 */
export async function enqueueTestVideo(page: Page, filename = 'test-video.mp4') {
  const videoBytes = fs.readFileSync(TEST_VIDEO_PATH)
  const base64 = videoBytes.toString('base64')

  await page.evaluate(
    ({ name, b64 }) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      ;(window as any).__fsMock.enqueueFilePicker(name, bytes, 'video/mp4')
    },
    { name: filename, b64: base64 },
  )
}

/** Enqueue a directory-picker result so `showDirectoryPicker` succeeds. */
export async function enqueueDirectoryPicker(page: Page) {
  await page.evaluate(() => {
    ;(window as any).__fsMock.enqueueDirectoryPicker()
  })
}

/** Create a project by enqueuing a directory picker and clicking "Create Project". */
export async function createProject(page: Page) {
  await enqueueDirectoryPicker(page)
  await page.getByText('Create Project').click()
}
