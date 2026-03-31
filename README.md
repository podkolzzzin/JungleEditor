# Jungle Editor

A full-featured, browser-native video editor built with **Vue 3**, **WebGPU**, **WebCodecs**, and modern Web APIs.

## Features (planned)

- Multi-track video & audio timeline
- GPU-accelerated preview rendering (WebGPU)
- Hardware-accelerated decode/encode (WebCodecs)
- Non-destructive editing with full undo/redo
- Real-time audio mixing (Web Audio API)
- Export to MP4/WebM (H.264, H.265, VP9, AV1)
- Effects, transitions, color grading
- Text overlays, titles
- Runs 100% client-side — no server needed

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:5173 in a Chromium-based browser (Chrome 113+ / Edge 113+).

## Tech Stack

- Vue 3 + TypeScript + Vite
- WebGPU for GPU compositing
- WebCodecs for hardware codec access
- Web Audio API for audio mixing
- Web Workers + SharedArrayBuffer for concurrency
- Pinia for state management

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full design document.

## Requirements

- Node.js 20+
- Modern Chromium browser (for WebGPU + WebCodecs)
- HTTPS or localhost (for `SharedArrayBuffer` / COOP+COEP headers)

## License

MIT
