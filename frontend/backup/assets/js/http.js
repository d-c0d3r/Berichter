const API_BASE = window.BERICHTER_CONFIG?.apiBase || "http://localhost:8000/api/v1";

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


export { api, httpError, errorText };
