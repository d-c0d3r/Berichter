import { ref, onBeforeUnmount } from 'vue';
import type { Week } from '../types';
import { getWeeks, request, validateWeek, message, aborted } from '../lib/api';
import { monday } from '../lib/dates';
export function useArchive() {
  const weeks = ref<Week[]>([]),
    loading = ref(false),
    hasMore = ref(true),
    error = ref(''),
    opened = ref(new Set<string>());
  let offset = 0,
    revision = 0,
    controller: AbortController | undefined;
  async function load(reset = false) {
    if (!reset && (loading.value || !hasMore.value)) return;
    controller?.abort();
    controller = new AbortController();
    const version = ++revision,
      pageOffset = reset ? 0 : offset;
    loading.value = true;
    error.value = '';
    try {
      const items = await getWeeks(pageOffset, 10, controller.signal);
      if (version !== revision) return;
      const merged = new Map((reset ? [] : weeks.value).map(w => [w.week_start, w]));
      for (const item of items) merged.set(item.week_start, item);
      weeks.value = [...merged.values()].sort((a, b) => b.week_start.localeCompare(a.week_start));
      offset = pageOffset + items.length;
      hasMore.value = items.length === 10;
    } catch (e) {
      if (version === revision && !aborted(e)) error.value = message(e);
    } finally {
      if (version === revision) loading.value = false;
    }
  }
  async function refreshSaved(key: string) {
    // Reload the first page, then insert the saved week even when it is older.
    await load(true);
    const version = revision;
    try {
      const week = validateWeek(await (await request(`/report-files/${monday(key)}`)).json());
      if (version !== revision) return;
      if (week.week_start !== monday(key)) throw new Error('Die Antwort enthält eine andere Woche.');
      weeks.value = [...weeks.value.filter(w => w.week_start !== week.week_start), week].sort((a, b) => b.week_start.localeCompare(a.week_start));
      opened.value = new Set([...opened.value, week.week_start]);
    } catch (e) {
      if (version === revision) error.value = message(e);
    }
  }
  function toggle(key: string, open: boolean) {
    const next = new Set(opened.value);
    if (open) next.add(key);else next.delete(key);
    opened.value = next;
  }
  onBeforeUnmount(() => controller?.abort());
  return {
    weeks,
    loading,
    hasMore,
    error,
    opened,
    load,
    refreshSaved,
    toggle
  };
}
