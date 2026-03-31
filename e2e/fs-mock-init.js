/**
 * In-memory mock of the File System Access API.
 * Injected via page.addInitScript({ path }) before the app loads.
 *
 * This is plain JavaScript — no TypeScript, no imports.
 */

(function () {
  // ── In-memory file system ──

  function makeDir() {
    return { kind: 'directory', children: new Map() }
  }

  function makeFile(data, type) {
    return { kind: 'file', data: data || new Uint8Array(0), type: type || '' }
  }

  // Root of the in-memory project folder
  const projectRoot = makeDir()

  // ── Writable stream mock ──
  class MockWritableFileStream {
    constructor(node) {
      this._node = node
      this._chunks = []
    }

    async write(data) {
      if (typeof data === 'string') {
        this._chunks.push(new TextEncoder().encode(data))
      } else if (data instanceof Uint8Array) {
        this._chunks.push(data)
      } else if (data instanceof ArrayBuffer) {
        this._chunks.push(new Uint8Array(data))
      } else if (data instanceof Blob) {
        const buf = await data.arrayBuffer()
        this._chunks.push(new Uint8Array(buf))
      }
    }

    async close() {
      const totalLen = this._chunks.reduce((s, c) => s + c.length, 0)
      const merged = new Uint8Array(totalLen)
      let offset = 0
      for (const c of this._chunks) {
        merged.set(c, offset)
        offset += c.length
      }
      this._node.data = merged
    }
  }

  // ── File handle mock ──
  class MockFileHandle {
    constructor(name, node) {
      this.kind = 'file'
      this.name = name
      this._node = node
    }

    async getFile() {
      return new File([this._node.data], this.name, { type: this._node.type })
    }

    async createWritable() {
      return new MockWritableFileStream(this._node)
    }

    async requestPermission() {
      return 'granted'
    }

    async queryPermission() {
      return 'granted'
    }
  }

  // ── Directory handle mock ──
  class MockDirectoryHandle {
    constructor(name, node) {
      this.kind = 'directory'
      this.name = name
      this._node = node
    }

    async getDirectoryHandle(name, opts) {
      let child = this._node.children.get(name)
      if (!child) {
        if (opts && opts.create) {
          child = makeDir()
          this._node.children.set(name, child)
        } else {
          throw new DOMException('Directory "' + name + '" not found', 'NotFoundError')
        }
      }
      if (child.kind !== 'directory') {
        throw new DOMException('"' + name + '" is not a directory', 'TypeMismatchError')
      }
      return new MockDirectoryHandle(name, child)
    }

    async getFileHandle(name, opts) {
      let child = this._node.children.get(name)
      if (!child) {
        if (opts && opts.create) {
          child = makeFile()
          this._node.children.set(name, child)
        } else {
          throw new DOMException('File "' + name + '" not found', 'NotFoundError')
        }
      }
      if (child.kind !== 'file') {
        throw new DOMException('"' + name + '" is not a file', 'TypeMismatchError')
      }
      return new MockFileHandle(name, child)
    }

    async removeEntry(name) {
      this._node.children.delete(name)
    }

    async requestPermission() {
      return 'granted'
    }

    async queryPermission() {
      return 'granted'
    }

    entries() {
      const children = this._node.children
      const iterator = children.entries()

      return {
        [Symbol.asyncIterator]() {
          return this
        },
        async next() {
          const result = iterator.next()
          if (result.done) {
            return { done: true, value: undefined }
          }
          const [name, child] = result.value
          if (child.kind === 'file') {
            return { done: false, value: [name, new MockFileHandle(name, child)] }
          } else {
            return { done: false, value: [name, new MockDirectoryHandle(name, child)] }
          }
        },
      }
    }

    values() {
      const children = this._node.children
      const iterator = children.values()
      const names = Array.from(children.keys())
      let index = 0

      return {
        [Symbol.asyncIterator]() {
          return this
        },
        async next() {
          const result = iterator.next()
          if (result.done) {
            return { done: true, value: undefined }
          }
          const child = result.value
          const name = names[index++]
          if (child.kind === 'file') {
            return { done: false, value: new MockFileHandle(name, child) }
          } else {
            return { done: false, value: new MockDirectoryHandle(name, child) }
          }
        },
      }
    }

    keys() {
      const children = this._node.children
      const iterator = children.keys()

      return {
        [Symbol.asyncIterator]() {
          return this
        },
        async next() {
          return iterator.next()
        },
      }
    }

    [Symbol.asyncIterator]() {
      return this.entries()[Symbol.asyncIterator]()
    }
  }

  // ── Queue for picker results ──
  const _directoryPickerQueue = []
  const _filePickerQueue = []

  // Expose on window for test interaction
  window.__fsMock = {
    projectRoot: projectRoot,

    enqueueDirectoryPicker: function () {
      const handle = new MockDirectoryHandle('TestProject', projectRoot)
      _directoryPickerQueue.push(handle)
      return handle
    },

    enqueueFilePicker: function (name, data, mimeType) {
      const node = makeFile(data, mimeType)
      const handle = new MockFileHandle(name, node)
      _filePickerQueue.push([handle])
      return handle
    },
  }

  // ── Replace browser APIs ──
  window.showDirectoryPicker = async function () {
    const handle = _directoryPickerQueue.shift()
    if (!handle) throw new DOMException('User cancelled', 'AbortError')
    return handle
  }

  window.showOpenFilePicker = async function () {
    const handles = _filePickerQueue.shift()
    if (!handles) throw new DOMException('User cancelled', 'AbortError')
    return handles
  }

  console.log('[E2E] File System Access API mock installed')
})()
