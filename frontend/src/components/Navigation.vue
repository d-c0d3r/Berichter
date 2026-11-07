<script setup lang="ts">
import Icon from './Icon.vue';
import type { View } from '../types';
defineProps<{
  current: View;
}>();
const emit = defineEmits<{
  navigate: [view: View, keyboard: boolean];
}>();
const items: {
  key: View;
  label: string;
  icon: string;
}[] = [{
  key: 'tagesbericht',
  label: 'Tagesbericht',
  icon: 'report'
}, {
  key: 'offene-berichte',
  label: 'Offene Berichte',
  icon: 'calendar'
}, {
  key: 'wochenarchiv',
  label: 'Wochenarchiv',
  icon: 'archive'
}];
function activate(event: MouseEvent, key: View) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  emit('navigate', key, event.detail === 0);
}
</script>
<template>
<aside class="sidebar">
<a class="brand" href="#tagesbericht" @click="activate($event,'tagesbericht')">
<span class="brand-mark">b</span>berichter.</a>
<p class="brand-caption">Dein digitales Berichtsheft</p>
<p class="nav-caption">ARBEITSBEREICH</p>
<nav aria-label="Hauptnavigation">
<a v-for="item in items" :key="item.key" :href="`#${item.key}`" class="nav-link" :class="{active:current===item.key}" :aria-current="current===item.key?'page':undefined" @click="activate($event,item.key)">
<Icon :name="item.icon"/>
<span>{{item.label}}</span>
</a>
</nav>
</aside>
</template>
