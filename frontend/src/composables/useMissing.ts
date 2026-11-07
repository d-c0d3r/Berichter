import { computed, ref, onBeforeUnmount } from 'vue';
import { request, message, aborted } from '../lib/api';
import { validDay } from '../lib/dates';
export function useMissing() {
  const dates = ref<string[]>([]),
    loading = ref(false),
    loaded = ref(false),
    error = ref('');
  let controller: AbortController | undefined,
    revision = 0;
  const groups = computed(() => {
    const result = new Map<string, string[]>();
    for (const key of dates.value) {
      const month = key.slice(0, 7);
      if (!result.has(month)) result.set(month, []);
      result.get(month)!.push(key);
    }
    return [...result].map(([key, days]) => ({
      key,
      days,
      label: new Date(`${key}-01T12:00:00`).toLocaleDateString('de-DE', {
        month: 'long',
        year: 'numeric'
      })
    }));
  });
  async function load() {
    controller?.abort();
    controller = new AbortController();
    const version = ++revision;
    loading.value = true;
    error.value = '';
    try {
      const body = await (await request('/reports/missing', {
        signal: controller.signal
      })).json();
      if (!Array.isArray(body?.missing_dates) || !body.missing_dates.every(validDay)) throw new Error('Ungültige Antwort: missing_dates erwartet.');
      if (version !== revision) return;
      dates.value = [...new Set<string>(body.missing_dates)].sort();
      loaded.value = true;
    } catch (e) {
      if (version === revision && !aborted(e)) error.value = message(e);
    } finally {
      if (version === revision) loading.value = false;
    }
  }
  onBeforeUnmount(() => controller?.abort());
  return {
    dates,
    loading,
    loaded,
    error,
    groups,
    load
  };
}
