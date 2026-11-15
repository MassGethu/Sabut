import type { ClaimDetail, QueueItem } from "../api/types";
import { visitRouteFor } from "../route";
import { fmtNum } from "../format";

interface Row {
  stop: number;
  rank: number | null;
  claim: string;
  farmer: string;
  method: string;
  acres: string;
  lat: string;
  lng: string;
  question: string;
}

const COLUMNS: [keyof Row, string][] = [
  ["stop", "Stop"],
  ["rank", "Priority"],
  ["claim", "Claim"],
  ["farmer", "Farmer"],
  ["method", "Claimed"],
  ["acres", "Acres"],
  ["lat", "Lat"],
  ["lng", "Lng"],
  ["question", "Ask on site"],
];
const COORD_DIGITS = 5;

/** Today's visits in driving order, using the same route the map draws. */
function buildSheet(items: QueueItem[], details: Record<string, ClaimDetail>) {
  const byId = Object.fromEntries(items.map((i) => [i.claim_id, i]));
  const plots = items
    .filter((i) => details[i.claim_id]?.geometry)
    .map((i) => ({ id: i.claim_id, geometry: details[i.claim_id].geometry, inBudget: i.in_visit_budget }));
  const route = visitRouteFor(plots);
  if (!route) return null;
  const rows: Row[] = route.stops.map((s, n) => {
    const q = byId[s.id];
    return {
      stop: n + 1,
      rank: q.rank,
      claim: s.id,
      farmer: details[s.id]?.farmer_name ?? "",
      method: q.claimed_method,
      acres: fmtNum(q.claimed_acres, 2),
      lat: s.at[0].toFixed(COORD_DIGITS),
      lng: s.at[1].toFixed(COORD_DIGITS),
      question: q.field_question ?? "",
    };
  });
  return { rows, km: route.km, depot: route.depot };
}

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

const csvCell = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function printHtml(sheet: NonNullable<ReturnType<typeof buildSheet>>) {
  const head = COLUMNS.map(([, l]) => `<th>${l}</th>`).join("") + "<th>Outcome</th>";
  const body = sheet.rows
    .map((r) => `<tr>${COLUMNS.map(([k]) => `<td class="${k}">${esc(r[k])}</td>`).join("")}<td class="blank"></td></tr>`)
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Sabūt field sheet ${today()}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  body { font: 11pt/1.4 system-ui, sans-serif; color: #111; margin: 24px; }
  h1 { font-size: 16pt; margin: 0 0 4px; color: #1f5f3f; }
  p { margin: 2px 0; }
  .meta { color: #444; font-size: 10pt; margin-bottom: 12px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #999; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #eef3ef; font-size: 9.5pt; }
  td.stop { font-weight: 700; text-align: center; }
  td.question { width: 30%; }
  td.blank { width: 18%; height: 44px; }
  .foot { margin-top: 12px; font-size: 9pt; color: #555; }
  .sign { margin-top: 28px; display: flex; gap: 48px; }
  .sign span { border-top: 1px solid #333; padding-top: 4px; min-width: 200px; font-size: 9.5pt; }
  @media print { body { margin: 0; } .noprint { display: none; } }
</style></head><body>
<p class="noprint"><button onclick="print()">Print / save as PDF</button></p>
<h1>Sabūt field sheet · ${today()}</h1>
<p class="meta">${sheet.rows.length} visit${sheet.rows.length === 1 ? "" : "s"} · ${sheet.km.toFixed(1)} km straight-line loop from the block office (${sheet.depot[0].toFixed(COORD_DIGITS)}, ${sheet.depot[1].toFixed(COORD_DIGITS)}); road distance will be longer.</p>
<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
<p class="foot">Stops are in driving order; Priority is the queue rank. Record what you saw in Outcome. Farmers and claims are fictional demo data.</p>
<div class="sign"><span>Officer</span><span>Date and time</span></div>
</body></html>`;
}

export function FieldSheet({ items, details }: { items: QueueItem[]; details: Record<string, ClaimDetail> }) {
  const sheet = buildSheet(items, details);
  if (!sheet) return null;

  function openPrint() {
    const w = window.open("", "_blank");
    if (!w) return; // popup blocked; the CSV link still works
    w.document.write(printHtml(sheet!));
    w.document.close();
    w.focus();
    w.print();
  }

  function downloadCsv() {
    const lines = [
      [...COLUMNS.map(([, l]) => l), "Outcome"].map(csvCell).join(","),
      ...sheet!.rows.map((r) => [...COLUMNS.map(([k]) => r[k]), ""].map(csvCell).join(",")),
    ];
    const url = URL.createObjectURL(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `sabut-field-sheet-${today()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <div className="field-sheet" aria-label="Field sheet export">
      <span className="muted small">Field sheet · {sheet.rows.length} stop{sheet.rows.length === 1 ? "" : "s"}</span>
      <button className="btn btn-xs" onClick={openPrint}>Print / PDF</button>
      <button className="btn btn-xs" onClick={downloadCsv}>CSV</button>
    </div>
  );
}
