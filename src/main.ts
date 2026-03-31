import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import * as store from './store'

createApp(App).mount('#app')

// Expose store for E2E testing
if (import.meta.env.DEV) {
  ;(window as any).__store = store
}
