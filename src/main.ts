import { createApp } from 'vue'
import './ui/style.css'
import App from './ui/App.vue'
import * as store from './ui/store'

createApp(App).mount('#app')

// Expose store for E2E testing
if (import.meta.env.DEV) {
  ;(window as any).__store = store
}
