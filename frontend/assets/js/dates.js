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


export { dayKey, validDay, shiftDay, monday, dateLabel, shortDate };
