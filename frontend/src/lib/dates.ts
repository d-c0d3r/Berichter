export function dayKey(value: Date = new Date()): string {
  return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, "0"), String(value.getDate()).padStart(2, "0")].join("-");
}
export function validDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T12:00:00`);
  return !Number.isNaN(parsed.getTime()) && dayKey(parsed) === value;
}
export function shiftDay(key: string, days: number): string {
  const value = new Date(`${key}T12:00:00`);
  value.setDate(value.getDate() + days);
  return dayKey(value);
}
export function monday(key: string): string {
  const value = new Date(`${key}T12:00:00`);
  return shiftDay(key, -((value.getDay() + 6) % 7));
}
export function dateLabel(key: string): string {
  return new Date(`${key}T12:00:00`).toLocaleDateString("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}
export function shortDate(key: string): string {
  return new Date(`${key}T12:00:00`).toLocaleDateString("de-DE");
}
