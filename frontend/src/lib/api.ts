import type { Report, Week } from '../types';
import { validDay, monday } from './dates';
export const MAX_NOTES = 400;
export function endpoint(path: string): string {
  return (window.BERICHTER_CONFIG?.apiBase || '/api/v1').replace(/\/$/, '') + path;
}
export function message(error: unknown): string {
  return error instanceof TypeError ? 'Backend nicht erreichbar. Verbindung und API-Konfiguration prüfen.' : error instanceof Error ? error.message : 'Unbekannter Fehler';
}
export function aborted(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}
export async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(endpoint(path), {
    cache: 'no-store',
    ...init
  });
  if (!response.ok) {
    const text = await response.text();
    let detail = text.slice(0, 500);
    try {
      const body = JSON.parse(text);
      detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail ?? body);
    } catch {
      if (/<(?:!doctype|html)/i.test(text)) detail = 'HTML statt API-Antwort erhalten. Proxy-Konfiguration prüfen.';
    }
    const error = new Error(`HTTP ${response.status}: ${detail}`) as Error & {
      status: number;
    };
    error.status = response.status;
    throw error;
  }
  return response;
}
export function validateReport(value: unknown): Report {
  const v = value as Partial<Report> | null;
  if (!v || typeof v.id !== 'number' || !validDay(v.report_date) || typeof v.content !== 'string') throw new Error('Ungültiger Tagesbericht.');
  return v as Report;
}
export function validateWeek(value: unknown): Week {
  const v = value as Partial<Week> | null;
  if (!v || typeof v.id !== 'number' || !validDay(v.week_start) || monday(v.week_start) !== v.week_start || typeof v.filename !== 'string' || !Array.isArray(v.reports)) throw new Error('Ungültiger Wochenbericht.');
  const key = v.week_start;
  const reports = v.reports.map(validateReport).sort((a, b) => a.report_date.localeCompare(b.report_date));
  if (reports.some(r => monday(r.report_date) !== key)) throw new Error('Ein Bericht gehört nicht zur angegebenen Woche.');
  return {
    id: v.id,
    week_start: key,
    filename: v.filename,
    reports
  };
}
export async function getReport(key: string, signal?: AbortSignal): Promise<Report | null> {
  try {
    const report = validateReport(await (await request(`/reports/${encodeURIComponent(key)}`, {
      signal
    })).json());
    if (report.report_date !== key) throw new Error('Die Antwort enthält ein anderes Datum.');
    return report;
  } catch (e) {
    if ((e as {
      status?: number;
    }).status === 404) return null;
    throw e;
  }
}
export async function getWeeks(offset: number, limit: number, signal?: AbortSignal): Promise<Week[]> {
  const body: unknown = await (await request(`/report-files/?${new URLSearchParams({
    offset: String(offset),
    limit: String(limit)
  })}`, {
    signal
  })).json();
  if (!Array.isArray(body)) throw new Error('Die Wochenliste ist kein Array.');
  return body.map(validateWeek);
}
export async function readGenerated(response: Response, onText: (text: string) => void): Promise<string> {
  if ((response.headers.get('Content-Type') || '').includes('application/json')) {
    const body = await response.json();
    const text = typeof body === 'string' ? body : body?.content;
    if (typeof text !== 'string') throw new Error('Ungültige Generierungsantwort.');
    onText(text);
    return text;
  }
  if (!response.body) throw new Error('Keine Streaming-Antwort verfügbar.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let output = '';
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      output += decoder.decode(part.value, {
        stream: true
      });
      onText(output);
    }
    output += decoder.decode();
    onText(output);
    return output;
  } finally {
    try {
      await reader.cancel();
    } catch {}
    reader.releaseLock();
  }
}
export function archiveFilename(header: string | null): string {
  const raw = header || '';
  const encoded = raw.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  let name = '';
  if (encoded) {
    try {
      name = decodeURIComponent(encoded[1].trim());
    } catch {}
  }
  if (!name) {
    const plain = raw.match(/filename\s*=\s*(?:"([^"]+)"|([^;]+))/i);
    name = plain ? (plain[1] || plain[2]).trim() : 'Berichte.zip';
  }
  name = name.split(/[\\/]/).pop()?.replace(/[\x00-\x1f\x7f]/g, '') || '';
  return name && /\.zip$/i.test(name) ? name : 'Berichte.zip';
}
