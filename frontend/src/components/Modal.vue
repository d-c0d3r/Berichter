<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
const props = defineProps<{
  open: boolean;
  title: string;
}>();
const emit = defineEmits<{
  close: [];
  opened: [];
}>();
const dialog = ref<HTMLDialogElement>();
let previous: HTMLElement | null = null;
watch(() => props.open, async open => {
  await nextTick();
  if (open) {
    previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.value?.open) dialog.value?.showModal();
    emit('opened');
  } else dialog.value?.close();
}, {
  immediate: true
});
function closed() {
  previous?.focus({
    preventScroll: true
  });
  emit('close');
}
</script>
<template>
<dialog ref="dialog" :aria-label="title" @close="closed">
<div class="export-panel">
<button class="dialog-close" type="button" aria-label="Schließen" @click="dialog?.close()">×</button>
<h2>{{title}}</h2>
<slot/>
</div>
</dialog>
</template>
