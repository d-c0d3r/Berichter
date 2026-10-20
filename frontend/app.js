"use strict";
const API_BASE = "http://localhost:8000/api/v1";
const MAX_NOTES = 400;
const $ = id => document.getElementById(id);
const drafts = new Map(), weeks = new Map();
let day = "", busy = false, loadingDay = false, dayVersion = 0;
let dayController = null, generationController = null, olderBusy = false;
let lastToday;
function dayKey(value = new Date()) {
  return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,"0")}-${String(value.getDate()).padStart(2,"0")}`;
}
function validDay(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value+"T12:00:00");
  return !Number.isNaN(parsed.getTime()) && dayKey(parsed) === value;
}
function shiftDay(key, days) { const d = new Date(key+"T12:00:00"); d.setDate(d.getDate()+days); return dayKey(d); }
function monday(key) { const d = new Date(key+"T12:00:00"); return shiftDay(key,-((d.getDay()+6)%7)); }
function dateLabel(key) { return new Date(key+"T12:00:00").toLocaleDateString("de-DE",{weekday:"long",day:"numeric",month:"long",year:"numeric"}); }
function shortDate(key) { return new Date(key+"T12:00:00").toLocaleDateString("de-DE"); }
function api(path) { return API_BASE.replace(/\/$/,"")+path; }
async function httpError(response) {
  const body = await response.text(); let detail;
  try { const value = JSON.parse(body); detail = typeof value.detail === "string" ? value.detail : JSON.stringify(value.detail || value); }
  catch { detail = /<(?:!doctype|html)/i.test(body) ? "HTML statt API-Antwort erhalten. Nginx-Konfiguration prüfen." : body.slice(0,500); }
  return new Error(`HTTP ${response.status}: ${detail}`);
}
function errorText(error) { return error instanceof TypeError ? "Backend nicht erreichbar. Verbindung und API-Konfiguration prüfen." : error.message; }
function validateReport(value) {
  if (!value || !validDay(value.report_date) || typeof value.content !== "string") throw new Error("Ungültiger Tagesbericht: report_date und content erwartet.");
  return value;
}
// Adapt only this function if ReportFileWithReportsResponse uses different field names.
function normalizeWeek(value, requestedMonday) {
  if (!value || !validDay(value.week_start) || !Array.isArray(value.reports)) throw new Error("Ungültige Wochenantwort. Erwartet: {week_start, filename, reports: [{report_date, content}]}");
  if (value.week_start !== requestedMonday) throw new Error("Das Backend hat eine andere Woche zurückgegeben.");
  const reports = value.reports.map(validateReport);
  if (reports.some(report => monday(report.report_date) !== requestedMonday)) throw new Error("Ein Tagesbericht gehört nicht zur angefragten Woche.");
  return {week_start:value.week_start, filename:typeof value.filename === "string" ? value.filename : "", reports:reports.sort((a,b)=>a.report_date.localeCompare(b.report_date))};
}
async function fetchReport(key, signal) {
  const response = await fetch(api(`/report/${encodeURIComponent(key)}`),{signal,cache:"no-store"});
  if (response.status === 404) return null;
  if (!response.ok) throw await httpError(response);
  const report = validateReport(await response.json());
  if (report.report_date !== key) throw new Error("Die Antwort enthält ein anderes Datum.");
  return report;
}
function showReport(text = "", placeholder = "Für diesen Tag ist noch kein Bericht gespeichert.") {
  $("report").textContent = text || placeholder;
  $("report").classList.toggle("empty",!text); $("copy").disabled = !text;
}
function updateControls() {
  const length = Array.from($("notes").value).length;
  $("length").textContent = `${length} / ${MAX_NOTES}`;
  $("length").classList.toggle("danger",length>MAX_NOTES);
  const invalid = !$("notes").value.trim() || length>MAX_NOTES;
  $("generate").disabled = $("retry").disabled = busy || loadingDay || invalid;
  $("notes").disabled = $("selected-date").disabled = busy;
  $("today").disabled = busy || day === dayKey(); $("stop").hidden = !busy;
  document.querySelectorAll("[data-open-day]").forEach(button=>button.disabled=busy);
}
function updateDateLabels() {
  $("greeting").textContent = dateLabel(day); $("selected-date").value=day;
  $("day-title").textContent=day===dayKey()?"Heute":"Ausgewählter Tag";
  $("notes-label").textContent=day===dayKey()?"Was hast du heute gemacht?":"Was hast du an diesem Tag gemacht?";
}
async function selectDay(next) {
  if (busy) return;
  if (!validDay(next)) { $("selected-date").value=day; return; }
  if (day) drafts.set(day,$("notes").value);
  day=next; const version=++dayVersion;
  dayController?.abort(); dayController=new AbortController(); loadingDay=true;
  $("notes").value=drafts.get(day)||""; $("error").textContent="";
  $("status").textContent="Bericht wird geladen …";
  showReport("","Bericht wird aus der Datenbank geladen …"); updateDateLabels(); updateControls();
  $("week-date").value=next; ensureWeek(next,true);
  try {
    const report=await fetchReport(next,dayController.signal);
    if(version!==dayVersion)return;
    showReport(report?.content||""); $("status").textContent=report?"Aus Datenbank geladen":"Noch kein Bericht";
  } catch(error) {
    if(version!==dayVersion || error.name==="AbortError")return;
    showReport("","Der Bericht konnte nicht geladen werden."); $("status").textContent="Ladefehler"; $("error").textContent=errorText(error);
  } finally { if(version===dayVersion){loadingDay=false;updateControls();} }
}
function renderWeeks() {
  $("weeks").replaceChildren();
  for(const key of [...weeks.keys()].sort().reverse()) {
    const entry=weeks.get(key), details=document.createElement("details"), summary=document.createElement("summary");
    details.className="week"; details.open=entry.open;
    details.addEventListener("toggle",()=>entry.open=details.open);
    const title=document.createElement("span"); title.className="week-title";
    title.textContent=`${shortDate(key)} – ${shortDate(shiftDay(key,6))}`;
    const meta=document.createElement("span"); meta.className="week-meta";
    meta.textContent=entry.loading?"Wird geladen …":entry.error?"Laden fehlgeschlagen":`${entry.data.reports.length} Tagesberichte${entry.data.filename?" · "+entry.data.filename:""}`;
    summary.append(title,meta); details.append(summary);
    const content=document.createElement("div");content.className="week-content";
    if(entry.error) {
      const text=document.createElement("p");text.className="error";text.textContent=entry.error;
      const retry=document.createElement("button");retry.textContent="Erneut laden";retry.onclick=()=>ensureWeek(key,true,true);content.append(text,retry);
    } else if(!entry.loading) {
      if(!entry.data.reports.length){const p=document.createElement("p");p.className="muted";p.textContent="Für diese Woche sind keine Berichte gespeichert.";content.append(p);}
      for(const report of entry.data.reports) {
        const article=document.createElement("article"),heading=document.createElement("div"),label=document.createElement("h3"),open=document.createElement("button"),text=document.createElement("div");
        article.className="day-report";heading.className="row";label.textContent=dateLabel(report.report_date);
        open.type="button";open.textContent="Öffnen";open.dataset.openDay=report.report_date;open.disabled=busy;
        open.onclick=()=>{if(busy)return;selectDay(report.report_date);$("day-title").scrollIntoView({behavior:"smooth",block:"start"});};
        text.className="report";text.textContent=report.content;heading.append(label,open);article.append(heading,text);content.append(article);
      }
    }
    details.append(content);$("weeks").append(details);
  }
}
async function ensureWeek(target, open=false, force=false) {
  const key=monday(target);let entry=weeks.get(key);
  if(entry){entry.open=entry.open||open;if(entry.loading || (!force&&!entry.error)){renderWeeks();return;}}
  else {entry={open,loading:false,error:"",data:null};weeks.set(key,entry);}
  entry.loading=true;entry.error="";renderWeeks();
  try {
    const response=await fetch(api(`/week?target_date=${encodeURIComponent(key)}`),{cache:"no-store"});
    if(response.status===404) entry.data={week_start:key,filename:"",reports:[]};
    else {if(!response.ok)throw await httpError(response);entry.data=normalizeWeek(await response.json(),key);}
  } catch(error) {entry.error=errorText(error);}
  finally {entry.loading=false;renderWeeks();}
}
async function streamText(response,onText) {
  if(!response.body)throw new Error("Keine Streaming-Antwort verfügbar.");
  const reader=response.body.getReader(),decoder=new TextDecoder();
  try {while(true){const {value,done}=await reader.read();if(done){const tail=decoder.decode();if(tail)onText(tail);break;}onText(decoder.decode(value,{stream:true}));}}
  finally {try{await reader.cancel();}catch{}reader.releaseLock();}
}
async function generate() {
  if(busy||loadingDay)return;
  const notes=$("notes").value.trim();if(!notes||Array.from(notes).length>MAX_NOTES)return;
  const previous=$("report").classList.contains("empty")?"":$("report").textContent,requestDay=day;let output="";
  busy=true;generationController=new AbortController();$("error").textContent="";$("status").textContent="Verbindung wird hergestellt …";updateControls();
  try {
    const response=await fetch(api(`/report?date_now=${encodeURIComponent(requestDay)}`),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(notes),signal:generationController.signal});
    if(!response.ok)throw await httpError(response);
    showReport("","Bericht wird geschrieben …");$("status").textContent="Bericht wird geschrieben …";
    await streamText(response,text=>{output+=text;showReport(output);});
    if(!output.trim())throw new Error("Der Server hat keinen Bericht zurückgegeben.");
    $("status").textContent="Speicherung wird geprüft …";
    const saved=await fetchReport(requestDay,generationController.signal);
    if(!saved||saved.content!==output)throw new Error("Speicherung nicht bestätigt. Bitte kopiere den angezeigten Text als Sicherung.");
    showReport(saved.content);$("status").textContent="In Datenbank gespeichert";
  } catch(error) {
    $("status").textContent=error.name==="AbortError"?"Gestoppt · Speicherung nicht bestätigt":"Fehler · Speicherung nicht bestätigt";
    $("error").textContent=error.name==="AbortError"?"Der Abbruch bestätigt nicht, ob der Bericht gespeichert wurde. Angezeigten Text bei Bedarf kopieren.":errorText(error);
    if(!output.trim())showReport(previous);
  } finally {busy=false;generationController=null;updateControls();await ensureWeek(requestDay,true,true);}
}
$("notes").addEventListener("input",()=>{drafts.set(day,$("notes").value);updateControls();});
$("selected-date").addEventListener("change",event=>selectDay(event.target.value));
$("today").onclick=()=>selectDay(dayKey());$("generate").onclick=generate;$("retry").onclick=generate;
$("stop").onclick=()=>generationController?.abort();
$("copy").onclick=async()=>{if($("report").classList.contains("empty"))return;try{await navigator.clipboard.writeText($("report").textContent);$("copy").textContent="Kopiert ✓";setTimeout(()=>$("copy").textContent="Kopieren",1500);}catch{$("error").textContent="Bitte markiere den Text und kopiere ihn manuell.";}};
$("open-week").onclick=()=>{const key=$("week-date").value;if(validDay(key))ensureWeek(key,true,true);else $("history-error").textContent="Bitte ein gültiges Datum auswählen.";};
$("week-date").onchange=()=>$("history-error").textContent="";
$("refresh").onclick=async()=>{const button=$("refresh");button.disabled=true;try{await Promise.all([...weeks.keys()].map(key=>ensureWeek(key,false,true)));}finally{button.disabled=false;}};
$("older").onclick=async()=>{
  if(olderBusy)return;olderBusy=true;$("older").disabled=true;
  try{const oldest=[...weeks.keys()].sort()[0]||monday(dayKey());await ensureWeek(shiftDay(oldest,-7),true);}
  finally{olderBusy=false;$("older").disabled=false;}
};
lastToday=dayKey();
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&lastToday!==dayKey()){lastToday=dayKey();updateDateLabels();updateControls();}});
window.addEventListener("beforeunload",event=>{if(busy||[...drafts.values()].some(value=>value.trim())){event.preventDefault();event.returnValue="";}});
selectDay(dayKey());
