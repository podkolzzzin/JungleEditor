import { ref } from 'vue'

export const inputDialogVisible = ref(false)
export const inputDialogTitle = ref('')
export const inputDialogPlaceholder = ref('')
export const inputDialogValue = ref('')

let resolvePromise: ((value: string | null) => void) | null = null

export function showInputDialog(opts: {
  title: string
  placeholder?: string
  value?: string
}): Promise<string | null> {
  // Reject any pending dialog before opening a new one
  if (resolvePromise) {
    resolvePromise(null)
    resolvePromise = null
  }

  inputDialogTitle.value = opts.title
  inputDialogPlaceholder.value = opts.placeholder ?? ''
  inputDialogValue.value = opts.value ?? ''
  inputDialogVisible.value = true

  return new Promise<string | null>((resolve) => {
    resolvePromise = resolve
  })
}

export function confirmInputDialog(value: string) {
  inputDialogVisible.value = false
  resolvePromise?.(value)
  resolvePromise = null
}

export function cancelInputDialog() {
  inputDialogVisible.value = false
  resolvePromise?.(null)
  resolvePromise = null
}
