<script setup lang="ts">
import Icon from './Icon.vue';
import { dateLabel, shortDate } from '../lib/dates';
defineProps<{
  groups: {
    key: string;
    label: string;
    days: string[];
  }[];
  count: number;
  loaded: boolean;
  loading: boolean;
  error: string;
  selected: string;
  busy: boolean;
}>();
const emit = defineEmits<{
  refresh: [];
  open: [key: string];
}>();
function weekday(key: string) {
  return new Date(`${key}T12:00:00`).toLocaleDateString('de-DE', {
    weekday: 'short'
  });
}
</script>
<template>
<section class="card missing-panel" aria-labelledby="missing-title">
<div class="row missing-heading">
<h2 id="missing-title">Fehlende Berichte <span class="missing-count">{{loaded?count:'–'}}</span>
</h2>
<button type="button" :disabled="loading" @click="emit('refresh')">
<Icon name="refresh"/>{{loading?'Wird geladen …':'Aktualisieren'}}</button>
</div>
<p class="muted" role="status">{{loading?'Fehlende Berichte werden geladen …':loaded?count?`${count} Berichte fehlen.`:'Alles vollständig – keine fehlenden Berichte.':'Noch nicht geladen.'}}</p>
<p v-if="error" class="error" role="alert">{{error}} {{loaded?'Die Liste ist möglicherweise veraltet.':''}}</p>
<div class="missing-months" :aria-busy="loading">
<section v-for="group in groups" :key="group.key" class="missing-month">
<h3>{{group.label}} · {{group.days.length}}</h3>
<div class="missing-date-grid">
<button v-for="key in group.days" :key="key" type="button" class="missing-date" :disabled="busy" :aria-pressed="selected===key" :aria-label="`Bericht schreiben: ${dateLabel(key)}`" @click="emit('open',key)">
<span class="missing-weekday">{{weekday(key)}}</span>
<span>{{shortDate(key)}}</span>
</button>
</div>
</section>
</div>
</section>
</template>
