"use strict";

const API_BASE = "http://localhost:8000/api/v1";
const MAX_NOTES = 400;
const WEEKS_LIMIT = 10;

const $ = id => document.getElementById(id);

const drafts = new Map();
const weeks = new Map();

const openedWeeks = new Set();

let day = "";
let busy = false;
let loadingDay = false;
let dayVersion = 0;

let dayController = null;
let generationController = null;

let weeksOffset = 0;
let weeksHasMore = true;
let weeksLoading = false;

let historyVersion = 0;
let historyController = null;

let weekRequestVersion = 0;
const latestWeekRequests = new Map();

let lastToday = dayKey();

function dayKey(value = new Date()) {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0"),
  ].join("-");
}

function validDay(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const parsed = new Date(`${value}T12:00:00`);

  return (
    !Number.isNaN(parsed.getTime()) &&
    dayKey(parsed) === value
  );
}

function shiftDay(key, days) {
  const value = new Date(`${key}T12:00:00`);
  value.setDate(value.getDate() + days);
  return dayKey(value);
}

function monday(key) {
  const value = new Date(`${key}T12:00:00`);
  return shiftDay(key, -((value.getDay() + 6) % 7));
}

function dateLabel(key) {
  return new Date(`${key}T12:00:00`).toLocaleDateString(
    "de-DE",
    {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }
  );
}

function shortDate(key) {
  return new Date(`${key}T12:00:00`)
    .toLocaleDateString("de-DE");
}

function api(path) {
  return API_BASE.replace(/\/$/, "") + path;
}

async function httpError(response) {
  const body = await response.text();
  let detail;

  try {
    const value = JSON.parse(body);

    detail = typeof value.detail === "string"
      ? value.detail
      : JSON.stringify(value.detail || value);
  } catch {
    detail = /<(?:!doctype|html)/i.test(body)
      ? "HTML statt API-Antwort erhalten. Nginx-Konfiguration prüfen."
      : body.slice(0, 500);
  }

  return new Error(`HTTP ${response.status}: ${detail}`);
}

function errorText(error) {
  return error instanceof TypeError
    ? "Backend nicht erreichbar. Verbindung und API-Konfiguration prüfen."
    : error.message;
}

function validateReport(value) {
  if (
    !value ||
    !validDay(value.report_date) ||
    typeof value.content !== "string"
  ) {
    throw new Error(
      "Ungültiger Tagesbericht: report_date und content erwartet."
    );
  }

  return value;
}

function normalizeWeek(value, requestedMonday = null) {
  if (
    !value ||
    !validDay(value.week_start) ||
    !Array.isArray(value.reports)
  ) {
    throw new Error(
      "Ungültige Wochenantwort. Erwartet: " +
      "{week_start, filename, reports: [{report_date, content}]}"
    );
  }

  const key = value.week_start;

  if (monday(key) !== key) {
    throw new Error(
      "Ungültige Wochenantwort: week_start muss ein Montag sein."
    );
  }

  if (requestedMonday !== null && key !== requestedMonday) {
    throw new Error(
      "Das Backend hat eine andere Woche zurückgegeben."
    );
  }

  const reports = value.reports.map(validateReport);

  if (
    reports.some(report => monday(report.report_date) !== key)
  ) {
    throw new Error(
      "Ein Tagesbericht gehört nicht zur angegebenen Woche."
    );
  }

  return {
    week_start: key,
    filename: typeof value.filename === "string"
      ? value.filename
      : "",
    reports: reports.sort(
      (a, b) => a.report_date.localeCompare(b.report_date)
    ),
  };
}

function emptyWeek(key) {
  return {
    week_start: key,
    filename: "",
    reports: [],
  };
}

async function fetchReport(key, signal) {
  const response = await fetch(
    api(`/reports/${encodeURIComponent(key)}`),
    {
      signal,
      cache: "no-store",
    }
  );

  if (response.status === 404) return null;
  if (!response.ok) throw await httpError(response);

  const report = validateReport(await response.json());

  if (report.report_date !== key) {
    throw new Error("Die Antwort enthält ein anderes Datum.");
  }

  return report;
}

function showReport(
  text = "",
  placeholder = "Für diesen Tag ist noch kein Bericht gespeichert."
) {
  $("report").textContent = text || placeholder;
  $("report").classList.toggle("empty", !text);
  $("copy").disabled = !text;
}

function updateControls() {
  const length = Array.from($("notes").value).length;

  $("length").textContent = `${length} / ${MAX_NOTES}`;
  $("length").classList.toggle("danger", length > MAX_NOTES);

  const invalid =
    !$("notes").value.trim() ||
    length > MAX_NOTES;

  $("generate").disabled = busy || loadingDay || invalid;

  $("notes").disabled = busy;
  $("selected-date").disabled = busy;
  $("today").disabled = busy || day === dayKey();
  $("stop").hidden = !busy;

  document.querySelectorAll("[data-open-day]").forEach(button => {
    button.disabled = busy;
  });
}

function updateHistoryControls() {
  $("refresh").disabled = weeksLoading;

  $("older").disabled =
    weeksLoading ||
    !weeksHasMore;

  $("older").textContent = weeksLoading
    ? "Wird geladen …"
    : weeksHasMore
      ? "Weitere Wochen laden"
      : "Alle Wochen geladen";
}

function updateDateLabels() {
  $("greeting").textContent = dateLabel(day);
  $("selected-date").value = day;

  $("day-title").textContent =
    day === dayKey() ? "Heute" : "Ausgewählter Tag";

  $("notes-label").textContent = day === dayKey()
    ? "Was hast du heute gemacht?"
    : "Was hast du an diesem Tag gemacht?";
}

async function selectDay(next) {
  if (busy) return;

  if (!validDay(next)) {
    $("selected-date").value = day;
    return;
  }

  if (day) {
    drafts.set(day, $("notes").value);
  }

  day = next;
  const version = ++dayVersion;

  dayController?.abort();
  dayController = new AbortController();

  loadingDay = true;

  $("notes").value = drafts.get(day) || "";
  $("error").textContent = "";
  $("status").textContent = "Bericht wird geladen …";

  showReport("", "Bericht wird aus der Datenbank geladen …");
  updateDateLabels();
  updateControls();

  try {
    const report = await fetchReport(
      next,
      dayController.signal
    );

    if (version !== dayVersion) return;

    showReport(report?.content || "");

    $("status").textContent = report
      ? "Aus Datenbank geladen"
      : "Noch kein Bericht";
  } catch (error) {
    if (
      version !== dayVersion ||
      error.name === "AbortError"
    ) {
      return;
    }

    showReport("", "Der Bericht konnte nicht geladen werden.");
    $("status").textContent = "Ladefehler";
    $("error").textContent = errorText(error);
  } finally {
    if (version === dayVersion) {
      loadingDay = false;
      updateControls();
    }
  }
}

function renderWeeks() {
  const container = $("weeks");
  const fragment = document.createDocumentFragment();

  for (const key of [...weeks.keys()].sort().reverse()) {
    const entry = weeks.get(key);

    const details = document.createElement("details");
    details.className = "week";
    details.open = openedWeeks.has(key);

    details.addEventListener("toggle", () => {
      if (!details.isConnected) return;

      if (details.open) {
        openedWeeks.add(key);
      } else {
        openedWeeks.delete(key);
      }
    });

    const summary = document.createElement("summary");

    const title = document.createElement("span");
    title.className = "week-title";
    title.textContent =
      `${shortDate(key)} – ${shortDate(shiftDay(key, 6))}`;

    const meta = document.createElement("span");
    meta.className = "week-meta";

    if (entry.loading) {
      meta.textContent = "Wird geladen …";
    } else if (entry.error) {
      meta.textContent = "Laden fehlgeschlagen";
    } else {
      const data = entry.data;
      meta.textContent =
        `${data.reports.length} Tagesberichte` +
        (data.filename ? ` · ${data.filename}` : "");
    }

    summary.append(title, meta);
    details.append(summary);

    const content = document.createElement("div");
    content.className = "week-content";

    if (entry.error) {
      const text = document.createElement("p");
      text.className = "error";
      text.textContent = entry.error;

      const retry = document.createElement("button");
      retry.type = "button";
      retry.textContent = "Erneut laden";
      retry.onclick = () => ensureWeek(key, true, true);

      content.append(text, retry);
    } else if (!entry.loading) {
      if (!entry.data.reports.length) {
        const text = document.createElement("p");
        text.className = "muted";
        text.textContent =
          "Für diese Woche sind keine Berichte gespeichert.";
        content.append(text);
      }

      for (const report of entry.data.reports) {
        const article = document.createElement("article");
        article.className = "day-report";

        const heading = document.createElement("div");
        heading.className = "row";

        const label = document.createElement("h3");
        label.textContent = dateLabel(report.report_date);

        const open = document.createElement("button");
        open.type = "button";
        open.textContent = "Öffnen";
        open.dataset.openDay = report.report_date;
        open.disabled = busy;

        open.onclick = () => {
          if (busy) return;

          selectDay(report.report_date);

          $("day-title").scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        };

        const text = document.createElement("div");
        text.className = "report";
        text.textContent = report.content;

        heading.append(label, open);
        article.append(heading, text);
        content.append(article);
      }
    }

    details.append(content);
    fragment.append(details);
  }

  container.replaceChildren(fragment);
}

async function loadWeeks({ reset = false } = {}) {
  if (!reset && (weeksLoading || !weeksHasMore)) return;

  if (reset) {
    historyController?.abort();
    historyVersion += 1;
  }

  const version = historyVersion;
  const offset = reset ? 0 : weeksOffset;

  const controller = new AbortController();
  historyController = controller;

  // Не затираем изменения, сделанные запросом /week,
  // который начался после этого запроса списка.
  const requestVersion = ++weekRequestVersion;

  weeksLoading = true;
  $("history-error").textContent = "";
  $("history-status").textContent = "Wochenberichte werden geladen …";
  updateHistoryControls();

  try {
    const params = new URLSearchParams({
      limit: String(WEEKS_LIMIT),
      offset: String(offset),
    });

    const response = await fetch(
      api(`/report-files?${params}`),
      {
        signal: controller.signal,
        cache: "no-store",
      }
    );

    let items = [];

    if (response.status !== 404) {
      if (!response.ok) throw await httpError(response);

      const body = await response.json();

      if (!Array.isArray(body)) {
        throw new Error(
          "Ungültige Antwort: /report-files muss ein Array zurückgeben."
        );
      }

      items = body.map(value => normalizeWeek(value));
    }

    if (version !== historyVersion) return;

    if (reset) {
      for (const key of weeks.keys()) {
        if (
          (latestWeekRequests.get(key) || 0) <= requestVersion
        ) {
          weeks.delete(key);
        }
      }
    }

    for (const data of items) {
      const key = data.week_start;

      if (
        (latestWeekRequests.get(key) || 0) > requestVersion
      ) {
        continue;
      }

      weeks.set(key, {
        loading: false,
        error: "",
        data,
      });
    }

    weeksOffset = offset + items.length;
    weeksHasMore = items.length === WEEKS_LIMIT;

    renderWeeks();

    $("history-status").textContent = weeks.size
      ? `${weeks.size} Wochen angezeigt.`
      : "Noch keine Wochenberichte vorhanden.";
  } catch (error) {
    if (
      version !== historyVersion ||
      error.name === "AbortError"
    ) {
      return;
    }

    $("history-error").textContent = errorText(error);
    $("history-status").textContent =
      "Wochenberichte konnten nicht geladen werden.";
  } finally {
    if (version === historyVersion) {
      weeksLoading = false;

      if (historyController === controller) {
        historyController = null;
      }

      updateHistoryControls();
    }
  }
}

async function ensureWeek(target, open = false, force = false) {
  const key = monday(target);
  let entry = weeks.get(key);

  if (open) openedWeeks.add(key);

  if (
    entry &&
    (entry.loading || (!force && !entry.error))
  ) {
    renderWeeks();
    return;
  }

  if (!entry) {
    entry = {
      loading: false,
      error: "",
      data: null,
    };

    weeks.set(key, entry);
  }

  const requestVersion = ++weekRequestVersion;
  latestWeekRequests.set(key, requestVersion);

  entry.loading = true;
  entry.error = "";
  renderWeeks();

  try {
    const response = await fetch(
      api(`/report-files/${encodeURIComponent(key)}`),
      { cache: "no-store" }
    );

    let data;

    if (response.status === 404) {
      data = emptyWeek(key);
    } else {
      if (!response.ok) throw await httpError(response);
      data = normalizeWeek(await response.json(), key);
    }

    if (
      latestWeekRequests.get(key) !== requestVersion
    ) {
      return;
    }

    entry.data = data;
  } catch (error) {
    if (
      latestWeekRequests.get(key) !== requestVersion
    ) {
      return;
    }

    entry.error = errorText(error);
  } finally {
    if (
      latestWeekRequests.get(key) === requestVersion
    ) {
      entry.loading = false;
      weeks.set(key, entry);
      renderWeeks();
    }
  }
}

async function streamText(response, onText) {
  if (!response.body) {
    throw new Error("Keine Streaming-Antwort verfügbar.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { value, done } = await reader.read();

      if (done) {
        const tail = decoder.decode();
        if (tail) onText(tail);
        break;
      }

      onText(decoder.decode(value, { stream: true }));
    }
  } finally {
    try {
      await reader.cancel();
    } catch {    }

    reader.releaseLock();
  }
}

async function generate() {
  if (busy || loadingDay) return;

  const notes = $("notes").value.trim();

  if (
    !notes ||
    Array.from(notes).length > MAX_NOTES
  ) {
    return;
  }

  const previous = $("report").classList.contains("empty")
    ? ""
    : $("report").textContent;

  const requestDay = day;
  let output = "";

  busy = true;
  generationController = new AbortController();

  $("error").textContent = "";
  $("status").textContent = "Verbindung wird hergestellt …";
  updateControls();

  try {
    const response = await fetch(
      api(`/reports?target_date=${encodeURIComponent(requestDay)}`),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(notes),
        signal: generationController.signal,
      }
    );

    if (!response.ok) throw await httpError(response);

    showReport("", "Bericht wird geschrieben …");
    $("status").textContent = "Bericht wird geschrieben …";

    if ((response.headers.get("Content-Type") || "").includes("application/json")) {
      const result = await response.json();
      output = typeof result === "string" ? result :
        (typeof result?.content === "string" ? result.content : "");
      showReport(output);
    } else {
      await streamText(response, text => {
        output += text;
        showReport(output);
      });
    }

    if (!output.trim()) {
      throw new Error(
        "Der Server hat keinen Bericht zurückgegeben."
      );
    }

    $("status").textContent = "Speicherung wird geprüft …";

    const saved = await fetchReport(
      requestDay,
      generationController.signal
    );

    if (!saved || saved.content !== output) {
      throw new Error(
        "Speicherung nicht bestätigt. Bitte kopiere " +
        "den angezeigten Text als Sicherung."
      );
    }

    showReport(saved.content);
    $("status").textContent = "In Datenbank gespeichert";
  } catch (error) {
    const aborted = error.name === "AbortError";

    $("status").textContent = aborted
      ? "Gestoppt · Speicherung nicht bestätigt"
      : "Fehler · Speicherung nicht bestätigt";

    $("error").textContent = aborted
      ? "Der Abbruch bestätigt nicht, ob der Bericht gespeichert " +
        "wurde. Angezeigten Text bei Bedarf kopieren."
      : errorText(error);

    if (!output.trim()) {
      showReport(previous);
    }
  } finally {
    busy = false;
    generationController = null;

    updateControls();
    await ensureWeek(requestDay, true, true);
  }
}

$("notes").addEventListener("input", () => {
  drafts.set(day, $("notes").value);
  updateControls();
});

$("selected-date").addEventListener("change", event => {
  selectDay(event.target.value);
});

$("today").onclick = () => selectDay(dayKey());
$("generate").onclick = generate;

$("stop").onclick = () => {
  generationController?.abort();
};

$("copy").onclick = async () => {
  if ($("report").classList.contains("empty")) return;

  try {
    await navigator.clipboard.writeText(
      $("report").textContent
    );

    $("copy").textContent = "Kopiert ✓";

    setTimeout(() => {
      $("copy").textContent = "Kopieren";
    }, 1500);
  } catch {
    $("error").textContent =
      "Bitte markiere den Text und kopiere ihn manuell.";
  }
};

$("refresh").onclick = () => {
  loadWeeks({ reset: true });
};

$("older").onclick = () => {
  loadWeeks();
};

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && lastToday !== dayKey()) {
    lastToday = dayKey();
    updateDateLabels();
    updateControls();
  }
});

window.addEventListener("beforeunload", event => {
  const hasDrafts = [...drafts.values()].some(
    value => value.trim()
  );

  if (busy || hasDrafts) {
    event.preventDefault();
    event.returnValue = "";
  }
});

selectDay(dayKey());
loadWeeks({ reset: true });

let exportController = null;
function exportMode() {
  return document.querySelector('input[name="export-mode"]:checked').value;
}
function updateExportPreview() {
  const all = exportMode() === "all";
  $("export-range").hidden = all;
  for (const id of ["export-start", "export-end"]) {
    $(id).disabled = all;
    $(id).required = !all;
  }
  const start = $("export-start").value;
  const end = $("export-end").value;
  $("export-preview").textContent = all
    ? "Alle verfügbaren Wochen werden aus der API ermittelt, auch noch nicht angezeigte."
    : validDay(start) && validDay(end)
      ? `Export: ${shortDate(monday(start))} – ${shortDate(shiftDay(monday(end), 6))}`
      : "Bitte Start- und Endwoche auswählen.";
}
async function availableExportRange(signal) {
  const seen = new Set();
  let offset = 0;
  while (true) {
    const params = new URLSearchParams({ limit: "100", offset: String(offset) });
    const response = await fetch(api(`/report-files?${params}`), { signal, cache: "no-store" });
    if (!response.ok) throw await httpError(response);
    const items = await response.json();
    if (!Array.isArray(items)) throw new Error("Die Wochenliste ist kein Array.");
    if (!items.length) break;
    const previousSize = seen.size;
    for (const item of items) {
      if (!validDay(item.week_start)) throw new Error("Ungültiges week_start in der Wochenliste.");
      seen.add(monday(item.week_start));
    }
    if (seen.size === previousSize) throw new Error("Die API wiederholt dieselben Wochen. Pagination prüfen.");
    offset += items.length;
    $("export-status").textContent = `${seen.size} verfügbare Wochen ermittelt …`;
  }
  const keys = [...seen].sort();
  if (!keys.length) throw new Error("Keine Wochenberichte zum Exportieren vorhanden.");
  return { start: keys[0], end: shiftDay(keys[keys.length - 1], 6) };
}
function archiveFilename(response) {
  const header = response.headers.get("Content-Disposition") || "";
  const encoded = header.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  let name = "";
  if (encoded) {
    try { name = decodeURIComponent(encoded[1].trim()); } catch {}
  }
  if (!name) {
    const plain = header.match(/filename\s*=\s*(?:"([^"]+)"|([^;]+))/i);
    name = plain ? (plain[1] || plain[2]).trim() : "Berichte.zip";
  }
  name = name.split(/[\\/]/).pop().replace(/[\x00-\x1f\x7f]/g, "");
  return name && /\.zip$/i.test(name) ? name : "Berichte.zip";
}
async function exportArchive(event) {
  event.preventDefault();
  if (exportController) return;
  const mode = exportMode();
  let start, end;
  if (mode === "range") {
    const first = $("export-start").value;
    const last = $("export-end").value;
    if (!validDay(first) || !validDay(last) || monday(first) > monday(last)) {
      $("export-error").textContent = "Bitte einen gültigen Zeitraum wählen. Die Startwoche darf nicht nach der Endwoche liegen.";
      return;
    }
    start = monday(first);
    end = shiftDay(monday(last), 6);
  }
  const controller = new AbortController();
  exportController = controller;
  $("export-options").disabled = true;
  $("export-cancel").hidden = false;
  $("export-error").textContent = "";
  $("export-status").textContent = "Export wird vorbereitet …";
  try {
    if (mode === "all") ({ start, end } = await availableExportRange(controller.signal));
    $("export-status").textContent = `ZIP für ${shortDate(start)} – ${shortDate(end)} wird erstellt …`;
    const params = new URLSearchParams({ start_date: start, end_date: end });
    const response = await fetch(api(`/reports-files/archive?${params}`), {
      method: "POST",
      headers: { Accept: "application/zip, applications/zip, application/octet-stream" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) throw await httpError(response);
    if (/json|text\/html/i.test(response.headers.get("Content-Type") || "")) {
      throw new Error("Die API hat kein ZIP-Archiv zurückgegeben.");
    }
    const blob = await response.blob();
    if (!blob.size) throw new Error("Das Archiv ist leer.");
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = archiveFilename(response);
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    $("export-status").textContent = `Download gestartet: ${shortDate(start)} – ${shortDate(end)}.`;
  } catch (error) {
    $("export-status").textContent = error.name === "AbortError" ? "Export abgebrochen." : "Export fehlgeschlagen.";
    if (error.name !== "AbortError") $("export-error").textContent = errorText(error);
  } finally {
    exportController = null;
    $("export-options").disabled = false;
    $("export-cancel").hidden = true;
    updateExportPreview();
  }
}
$("export-toggle").onclick = () => {
  $("export-panel").hidden = !$("export-panel").hidden;
  $("export-toggle").setAttribute("aria-expanded", String(!$("export-panel").hidden));
};
$("export-form").addEventListener("submit", exportArchive);
$("export-form").addEventListener("change", () => {
  $("export-error").textContent = "";
  updateExportPreview();
});
$("export-cancel").onclick = () => exportController?.abort();
$("export-start").value = monday(dayKey());
$("export-end").value = dayKey();
updateExportPreview();