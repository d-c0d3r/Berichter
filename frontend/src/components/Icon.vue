<script setup lang="ts">
defineProps<{
  name: string;
}>();
const paths: Record<string, string> = {
  report: 'M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-3 M8 2h8v4H8z M7 11h10 M7 16h7',
  calendar: 'M3 5h18v16H3z M8 3v4 M16 3v4 M3 11h18 M8 15h2 M14 15h2',
  archive: 'M3 3h18v5H3z M5 8v12h14V8 M10 12h4',
  refresh: 'M20 11a8 8 0 0 0-14-5L3 9 M3 3v6h6 M4 13a8 8 0 0 0 14 5l3-3 M21 21v-6h-6',
  copy: 'M8 8h12v13H8z M16 8V3H3v13h5',
  export: 'M12 3v12 M8 11l4 4 4-4 M4 16v5h16v-5',
  ai: 'M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z'
};
</script>
<template>
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<path :d="paths[name] || paths.report" />
</svg>
</template>
