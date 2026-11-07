<script setup lang="ts">
import { nextTick, onMounted, onBeforeUnmount, reactive, ref } from 'vue';
import type { View } from './types';
import { dayKey } from './lib/dates';
import Navigation from './components/Navigation.vue';
import ReportEditor from './components/ReportEditor.vue';
import MissingReports from './components/MissingReports.vue';
import WeeklyArchive from './components/WeeklyArchive.vue';
import ExportDialog from './components/ExportDialog.vue';
import { useReport } from './composables/useReport';
import { useMissing } from './composables/useMissing';
import { useArchive } from './composables/useArchive';
const descriptions = {
  tagesbericht: ['Tagesbericht', 'Tätigkeiten festhalten und bestehende Berichte bearbeiten.'],
  'offene-berichte': ['Offene Berichte', 'Wähle einen fehlenden Tag, um einen Bericht nachzutragen.'],
  wochenarchiv: ['Wochenarchiv', 'Gespeicherte Berichte lesen und vollständige Wochen exportieren.']
};
function hashView(): View {
  const value = location.hash.slice(1);
  return Object.hasOwn(descriptions, value) ? value as View : 'tagesbericht';
}
const view = ref<View>(hashView()),
  exportOpen = ref(false),
  heading = ref<HTMLElement>(),
  editor = ref<InstanceType<typeof ReportEditor>>();
const missing = reactive(useMissing()),
  archive = reactive(useArchive());
const report = reactive(useReport(async key => {
  await Promise.all([missing.load(), archive.refreshSaved(key)]);
}));
async function navigate(key: View, keyboard = false) {
  view.value = key;
  if (location.hash !== `#${key}`) history.replaceState(null, '', `#${key}`);
  await nextTick();
  window.scrollTo(0, 0);
  if (keyboard) heading.value?.focus({
    preventScroll: true
  });
}
async function openDay(key: string, focus = false) {
  if (report.busy) return;
  await navigate('tagesbericht');
  await report.select(key);
  if (report.day === key && focus) editor.value?.focus();
}
function hashChanged() {
  void navigate(hashView());
}
let today = dayKey();
function visible() {
  if (!document.hidden && today !== dayKey()) {
    today = dayKey();
    void missing.load();
    void report.select(report.day);
  }
}
onMounted(() => {
  void report.select(dayKey());
  void missing.load();
  void archive.load(true);
  window.addEventListener('hashchange', hashChanged);
  document.addEventListener('visibilitychange', visible);
});
onBeforeUnmount(() => {
  window.removeEventListener('hashchange', hashChanged);
  document.removeEventListener('visibilitychange', visible);
});
</script>
<template>
<a class="skip-link" href="#content">Zum Inhalt</a>
<Navigation :current="view" @navigate="navigate"/>
<main id="content" tabindex="-1">
<header class="page-header">
<h1 id="page-title" ref="heading" tabindex="-1">{{descriptions[view][0]}}</h1>
<p>{{descriptions[view][1]}}</p>
</header>
<ReportEditor v-show="view==='tagesbericht'" ref="editor" :day="report.day" :notes="report.notes" :content="report.content" :ai="report.ai" :use-ai="report.useAI" :bypass="report.bypass" :loading="report.loading" :busy="report.busy" :status="report.status" :error="report.error" :length="report.length" :can-save="report.canSave" @select="report.select" @edit="report.edit" @toggle="report.ai=!report.ai" @save="report.save" @stop="report.stop"/>
<MissingReports v-show="view==='offene-berichte'" :groups="missing.groups" :count="missing.dates.length" :loaded="missing.loaded" :loading="missing.loading" :error="missing.error" :selected="report.day" :busy="report.busy" @refresh="missing.load" @open="openDay($event,true)"/>
<WeeklyArchive v-show="view==='wochenarchiv'" :weeks="archive.weeks" :loading="archive.loading" :has-more="archive.hasMore" :error="archive.error" :opened="archive.opened" :busy="report.busy" @refresh="archive.load(true)" @more="archive.load()" @export="exportOpen=true" @open="openDay($event)" @toggle="archive.toggle"/>
</main>
<ExportDialog :open="exportOpen" @close="exportOpen=false"/>
</template>
