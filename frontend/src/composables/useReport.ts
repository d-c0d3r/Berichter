import { computed, ref, shallowReactive, onBeforeUnmount } from 'vue';
import { dayKey, validDay } from '../lib/dates';
import { MAX_NOTES, getReport, request, readGenerated, message, aborted } from '../lib/api';
export function useReport(onSaved: (key: string) => Promise<void>) {
  const day = ref(dayKey()),
    notes = ref(''),
    content = ref(''),
    ai = ref(false);
  const loading = ref(false),
    busy = ref(false),
    status = ref(''),
    error = ref('');
  const drafts = shallowReactive(new Map<string, string>());
  const baselines = new Map<string, string>();
  let dayController: AbortController | undefined,
    generation: AbortController | undefined,
    revision = 0;
  const length = computed(() => Array.from(notes.value).length);
  const bypass = computed(() => ['urlaub', 'krankmeldung'].includes(notes.value.trim().toLowerCase()));
  const useAI = computed(() => ai.value && !bypass.value);
  const canSave = computed(() => !busy.value && !loading.value && !!notes.value.trim() && length.value <= MAX_NOTES);
  function edit(value: string) {
    notes.value = value;
    if (baselines.has(day.value) && value === baselines.get(day.value)) drafts.delete(day.value);else drafts.set(day.value, value);
  }
  async function select(key: string) {
    if (busy.value || !validDay(key)) return;
    const version = ++revision;
    dayController?.abort();
    const controller = new AbortController();
    dayController = controller;
    day.value = key;
    notes.value = drafts.get(key) ?? '';
    content.value = '';
    error.value = '';
    loading.value = true;
    status.value = 'Bericht wird geladen …';
    try {
      const saved = await getReport(key, controller.signal);
      if (version !== revision) return;
      content.value = saved?.content || '';
      baselines.set(key, content.value);
      if (!drafts.has(key)) notes.value = content.value;else if (drafts.get(key) === content.value) drafts.delete(key);
      status.value = saved ? 'Aus Datenbank geladen' : 'Noch kein Bericht gespeichert';
    } catch (e) {
      if (version === revision && !aborted(e)) {
        error.value = message(e);
        status.value = 'Ladefehler';
      }
    } finally {
      if (version === revision) loading.value = false;
    }
  }
  async function save() {
    if (!canSave.value) return;
    const key = day.value,
      input = notes.value.trim(),
      previous = content.value;
    const controller = new AbortController();
    generation = controller;
    busy.value = true;
    error.value = '';
    status.value = 'Verbindung wird hergestellt …';
    let output = '';
    try {
      const params = new URLSearchParams({
        target_date: key,
        use_ai: String(useAI.value)
      });
      const response = await request(`/reports/?${params}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(input),
        signal: controller.signal
      });
      status.value = 'Bericht wird geschrieben …';
      content.value = '';
      output = await readGenerated(response, text => {
        output = text;
        content.value = text;
      });
      if (!output.trim()) throw new Error('Der Server hat keinen Bericht zurückgegeben.');
      status.value = 'Speicherung wird geprüft …';
      const saved = await getReport(key, controller.signal);
      if (!saved || saved.content !== output) throw new Error('Speicherung nicht bestätigt. Angezeigten Text als Sicherung kopieren.');
      content.value = saved.content;
      notes.value = saved.content;
      baselines.set(key, saved.content);
      drafts.delete(key);
      status.value = 'In Datenbank gespeichert';
    } catch (e) {
      status.value = aborted(e) ? 'Gestoppt · Speicherung nicht bestätigt' : 'Fehler · Speicherung nicht bestätigt';
      error.value = aborted(e) ? 'Der Abbruch bestätigt nicht, ob der Bericht gespeichert wurde. Text bei Bedarf kopieren.' : message(e);
      if (!output.trim()) content.value = previous;
    } finally {
      busy.value = false;
      generation = undefined;
      // Each refresh handles its own UI error and never changes the selected day.
      await onSaved(key);
    }
  }
  function stop() {
    generation?.abort();
  }
  function beforeUnload(event: BeforeUnloadEvent) {
    if (busy.value || drafts.size) {
      event.preventDefault();
      event.returnValue = '';
    }
  }
  window.addEventListener('beforeunload', beforeUnload);
  onBeforeUnmount(() => {
    dayController?.abort();
    generation?.abort();
    window.removeEventListener('beforeunload', beforeUnload);
  });
  return {
    day,
    notes,
    content,
    ai,
    loading,
    busy,
    status,
    error,
    length,
    bypass,
    useAI,
    canSave,
    select,
    save,
    stop,
    edit
  };
}
export type ReportState = ReturnType<typeof useReport>;
