<script setup lang="ts">
import { ref, onBeforeUnmount, nextTick } from 'vue';
import { dayKey, dateLabel, shiftDay } from '../lib/dates';
import { MAX_NOTES } from '../lib/api';
import { copyText } from '../lib/clipboard';
import Icon from './Icon.vue';
import Modal from './Modal.vue';
const props = defineProps<{
  day: string;
  notes: string;
  content: string;
  ai: boolean;
  useAi: boolean;
  bypass: boolean;
  loading: boolean;
  busy: boolean;
  status: string;
  error: string;
  length: number;
  canSave: boolean;
}>();
const emit = defineEmits<{
  select: [key: string];
  edit: [text: string];
  toggle: [];
  save: [];
  stop: [];
}>();
const copySnapshot = ref('');
const copied = ref(false),
  manual = ref(false),
  copyArea = ref<HTMLTextAreaElement>(),
  noteArea = ref<HTMLTextAreaElement>();
let timer: ReturnType<typeof setTimeout> | undefined;
async function copy() {
  if (!props.content) return;
  if (await copyText(props.content)) {
    copied.value = true;
    clearTimeout(timer);
    timer = setTimeout(() => copied.value = false, 1500);
  } else {
    copySnapshot.value = props.content;
    manual.value = true;
    await nextTick();
    copyArea.value?.focus();
    copyArea.value?.select();
  }
}
function focus() {
  noteArea.value?.focus({
    preventScroll: true
  });
}
defineExpose({
  focus
});
onBeforeUnmount(() => clearTimeout(timer));
</script>
<template>
<div class="report-view">
<section class="card editor" aria-labelledby="day-title">
 <div class="row heading">
<div>
<h2 id="day-title">{{day===dayKey()?'Heute':'Ausgewählter Tag'}}</h2>
<p class="greeting">{{dateLabel(day)}}</p>
</div>
 <div class="date-controls">
<div class="date-navigation" role="group" aria-label="Datum wechseln">
 <button v-for="offset in [-7,-1]" :key="offset" type="button" :disabled="busy" :aria-label="`${Math.abs(offset)} Tage zurück`" @click="emit('select',shiftDay(day,offset))">{{offset===-7?'−7':'−1'}}</button>
 <input type="date" aria-label="Berichtsdatum" :value="day" :disabled="busy" @change="emit('select',($event.target as HTMLInputElement).value)">
 <button v-for="offset in [1,7]" :key="offset" type="button" :disabled="busy" :aria-label="`${offset} Tage weiter`" @click="emit('select',shiftDay(day,offset))">+{{offset}}</button>
 <button id="today" type="button" :disabled="busy||day===dayKey()" @click="emit('select',dayKey())">Heute</button>
 </div>
</div>
</div>
 <div class="workspace">
<div class="compose-pane">
 <div class="ai-panel" :data-state="useAi?'on':'off'">
<div class="ai-description">
<span class="ai-orb">
<Icon name="ai"/>
</span>
<div>
<h2 id="ai-label">Mit KI formulieren</h2>
<p id="ai-status">{{bypass?'Urlaub / Krankmeldung · ohne KI':ai?'Notizen automatisch ausformulieren':'Text unverändert speichern'}}</p>
</div>
</div>
<button class="ai-switch" type="button" role="switch" :aria-checked="ai" aria-labelledby="ai-label" aria-describedby="ai-status" :disabled="busy" @click="emit('toggle')">
<span class="ai-switch-thumb"/>
</button>
</div>
 <label class="notes-label" for="notes">{{day===dayKey()?'Was hast du heute gemacht?':'Was hast du an diesem Tag gemacht?'}}</label>
 <textarea id="notes" ref="noteArea" :value="notes" :disabled="busy" aria-describedby="notes-length editor-limit-warning" placeholder="Zum Beispiel:&#10;Linux-Server eingerichtet&#10;DNS-Fehler untersucht&#10;Ergebnisse dokumentiert" @input="emit('edit',($event.target as HTMLTextAreaElement).value)"/>
 <div class="row hint">
<span>Entwurf nur in diesem Tab</span>
<span id="notes-length" :class="{danger:length>MAX_NOTES}">{{length}} / {{MAX_NOTES}}</span>
</div>
 <p v-if="length>MAX_NOTES" id="editor-limit-warning" class="error" role="status">Mehr als {{MAX_NOTES}} Zeichen: Das Backend erlaubt keine längeren Eingaben. Der Text wird nicht gekürzt.</p>
 <div class="row controls">
<div class="actions">
<button class="primary" type="button" :disabled="!canSave" @click="emit('save')">{{busy?'Wird verarbeitet …':useAi?'Bericht mit KI erstellen':'Bericht speichern'}}</button>
<button v-if="busy" type="button" @click="emit('stop')">Stoppen</button>
</div>
<span role="status" class="muted">{{status}}</span>
</div>
 <p v-if="error" class="error" role="alert">{{error}}</p>
 </div>
<div class="preview-pane">
<div class="row">
<h2>Gespeicherter Bericht</h2>
<button type="button" :disabled="!content" @click="copy">
<Icon name="copy"/>{{copied?'Kopiert':'Kopieren'}}</button>
</div>
<div class="report" :class="{empty:!content}" :aria-busy="loading||busy">{{content||(loading?'Bericht wird geladen …':'Für diesen Tag ist noch kein Bericht gespeichert.')}}</div>
</div>
</div>
</section>
<Modal :open="manual" title="Bericht kopieren" @opened="copyArea?.focus();copyArea?.select()" @close="manual=false">
<p class="muted">Automatisches Kopieren ist nicht verfügbar. Text auswählen und mit Strg+C / ⌘C oder dem Kontextmenü kopieren.</p>
<textarea ref="copyArea" :value="copySnapshot" readonly aria-label="Bericht zum Kopieren"/>
<button type="button" @click="copyArea?.focus();copyArea?.select()">Text auswählen</button>
</Modal>
</div>
</template>
