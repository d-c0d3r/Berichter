<script setup lang="ts">
import { reactive } from 'vue';
import Modal from './Modal.vue';
import { useExport } from '../composables/useExport';
defineProps<{
  open: boolean;
}>();
const emit = defineEmits<{
  close: [];
}>();
const state = reactive(useExport());
function close() {
  state.cancel();
  emit('close');
}
</script>
<template>
<Modal :open="open" title="Berichte exportieren" @close="close">
<form @submit.prevent="state.download">
<fieldset :disabled="state.busy">
<label class="export-choice">
<input v-model="state.mode" type="radio" value="range">Zeitraum auswählen</label>
<label class="export-choice">
<input v-model="state.mode" type="radio" value="all">Alle verfügbaren Wochen</label>
<div v-if="state.mode==='range'" class="export-dates">
<label>Von (Woche mit diesem Datum)<input v-model="state.start" type="date" required>
</label>
<label>Bis (Woche mit diesem Datum)<input v-model="state.end" type="date" required>
</label>
</div>
<p class="muted">Exportiert werden vollständige Wochen von Montag bis Sonntag.</p>
<p v-if="state.mode==='all'" class="muted">Alle Wochen werden aus der API ermittelt, auch noch nicht angezeigte.</p>
<button class="primary" type="submit">ZIP herunterladen</button>
</fieldset>
<button v-if="state.busy" type="button" @click="state.cancel">Abbrechen</button>
</form>
<p class="muted" role="status">{{state.status}}</p>
<p v-if="state.error" class="error" role="alert">{{state.error}}</p>
</Modal>
</template>
