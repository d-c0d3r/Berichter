<script setup lang="ts">
import type { Week } from '../types';
import Icon from './Icon.vue';
import { shortDate, shiftDay, dateLabel } from '../lib/dates';
defineProps<{
  weeks: Week[];
  loading: boolean;
  hasMore: boolean;
  error: string;
  opened: Set<string>;
  busy: boolean;
}>();
const emit = defineEmits<{
  refresh: [];
  more: [];
  export: [];
  open: [key: string];
  toggle: [key: string, open: boolean];
}>();
</script>
<template>
<section class="archive" aria-labelledby="weeks-title">
<div class="row section-heading">
<h2 id="weeks-title">Gespeicherte Wochen</h2>
<div class="actions">
<button type="button" :disabled="loading" @click="emit('refresh')">
<Icon name="refresh"/>Aktualisieren</button>
<button type="button" aria-haspopup="dialog" @click="emit('export')">
<Icon name="export"/>Exportieren</button>
</div>
</div>
<p class="muted" role="status">{{loading?'Wochenberichte werden geladen …':weeks.length?`${weeks.length} Wochen angezeigt.`:'Noch keine Wochenberichte vorhanden.'}}</p>
<p v-if="error" class="error" role="alert">{{error}}</p>
<div :aria-busy="loading">
<details v-for="week in weeks" :key="week.week_start" class="week" :open="opened.has(week.week_start)" @toggle="emit('toggle',week.week_start,($event.target as HTMLDetailsElement).open)">
<summary>
<span class="week-title">{{shortDate(week.week_start)}} – {{shortDate(shiftDay(week.week_start,6))}}</span>
<span class="week-meta">{{week.reports.length}} Tagesberichte<span v-if="week.filename"> · {{week.filename}}</span>
</span>
</summary>
<div class="week-content">
<p v-if="!week.reports.length" class="muted">Für diese Woche sind keine Berichte gespeichert.</p>
<article v-for="report in week.reports" :key="report.id" class="day-report">
<div class="row">
<h3>{{dateLabel(report.report_date)}}</h3>
<button type="button" :disabled="busy" @click="emit('open',report.report_date)">Öffnen</button>
</div>
<div class="report">{{report.content}}</div>
</article>
</div>
</details>
</div>
<button type="button" :disabled="loading||!hasMore" @click="emit('more')">{{loading?'Wird geladen …':hasMore?'Weitere Wochen laden':'Alle Wochen geladen'}}</button>
</section>
</template>
