/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

// WebCodecs API type augmentations
interface VideoFrame {
  readonly codedWidth: number
  readonly codedHeight: number
  readonly timestamp: number
  close(): void
}

// WebGPU type augmentations (basic — full types come from @webgpu/types)
interface GPU {
  requestAdapter(options?: GPURequestAdapterOptions): Promise<GPUAdapter | null>
}
