// Workers directory — Web Worker scripts for off-main-thread processing
// Each worker runs in its own thread via `new Worker(new URL('./foo.worker.ts', import.meta.url))`
// Common workers: waveform generation, thumbnail extraction, encoding
export {}
