import { ref, onBeforeUnmount } from 'vue';
import { request, getWeeks, archiveFilename, message, aborted } from '../lib/api';
import { monday, shiftDay, validDay, shortDate, dayKey } from '../lib/dates';
export function useExport() {
  const mode = ref<'range' | 'all'>('range'),
    start = ref(monday(dayKey())),
    end = ref(dayKey());
  const busy = ref(false),
    status = ref(''),
    error = ref('');
  let controller: AbortController | undefined;
  async function download() {
    if (busy.value) return;
    error.value = '';
    let first = start.value,
      last = end.value;
    if (mode.value === 'range' && (!validDay(first) || !validDay(last) || monday(first) > monday(last))) {
      error.value = 'Bitte einen gültigen Zeitraum wählen.';
      return;
    }
    const ctrl = new AbortController();
    controller = ctrl;
    busy.value = true;
    status.value = 'Export wird vorbereitet …';
    try {
      if (mode.value === 'all') {
        const seen = new Set<string>();
        let offset = 0;
        while (true) {
          const items = await getWeeks(offset, 100, ctrl.signal);
          if (!items.length) break;
          const size = seen.size;
          for (const item of items) seen.add(item.week_start);
          if (seen.size === size) throw new Error('Die API wiederholt dieselben Wochen. Pagination prüfen.');
          offset += items.length;
          status.value = `${seen.size} Wochen ermittelt …`;
        }
        const keys = [...seen].sort();
        if (!keys.length) throw new Error('Keine Wochenberichte zum Exportieren vorhanden.');
        first = keys[0];
        last = keys[keys.length - 1];
      }
      first = monday(first);
      last = shiftDay(monday(last), 6);
      status.value = `ZIP für ${shortDate(first)} – ${shortDate(last)} wird erstellt …`;
      const params = new URLSearchParams({
        start_date: first,
        end_date: last
      });
      const response = await request(`/report-files/archive?${params}`, {
        method: 'POST',
        headers: {
          Accept: 'application/zip, application/octet-stream'
        },
        signal: ctrl.signal
      });
      if (/json|text\/html/i.test(response.headers.get('Content-Type') || '')) throw new Error('Die API hat kein ZIP-Archiv zurückgegeben.');
      const blob = await response.blob();
      if (!blob.size) throw new Error('Das Archiv ist leer.');
      const url = URL.createObjectURL(blob),
        link = document.createElement('a');
      link.href = url;
      link.download = archiveFilename(response.headers.get('Content-Disposition'));
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      status.value = 'Download gestartet.';
    } catch (e) {
      status.value = aborted(e) ? 'Export abgebrochen.' : 'Export fehlgeschlagen.';
      if (!aborted(e)) error.value = message(e);
    } finally {
      busy.value = false;
      controller = undefined;
    }
  }
  function cancel() {
    controller?.abort();
  }
  onBeforeUnmount(cancel);
  return {
    mode,
    start,
    end,
    busy,
    status,
    error,
    download,
    cancel
  };
}
