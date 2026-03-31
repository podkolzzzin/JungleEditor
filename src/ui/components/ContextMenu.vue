<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue'

export interface ContextMenuItem {
  label: string
  icon?: string
  disabled?: boolean
  action: () => void
}

const props = defineProps<{
  items: ContextMenuItem[]
  x: number
  y: number
}>()

const emit = defineEmits<{
  close: []
}>()

function onItemClick(item: ContextMenuItem) {
  if (item.disabled) return
  item.action()
  emit('close')
}

function onClickOutside() {
  emit('close')
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('close')
  }
}

onMounted(() => {
  window.addEventListener('click', onClickOutside)
  window.addEventListener('keydown', onKeyDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('click', onClickOutside)
  window.removeEventListener('keydown', onKeyDown)
})
</script>

<template>
  <Teleport to="body">
    <div
      class="ctx-menu"
      :style="{ left: props.x + 'px', top: props.y + 'px' }"
      @click.stop
    >
      <button
        v-for="(item, i) in items"
        :key="i"
        class="ctx-item"
        :class="{ disabled: item.disabled }"
        @click="onItemClick(item)"
      >
        {{ item.label }}
      </button>
    </div>
  </Teleport>
</template>
