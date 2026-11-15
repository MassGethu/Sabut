import { useRef, useState } from "react";
import { ApiError, api } from "../api/client";
import type { ImportResponse } from "../api/types";

interface Props {
  onImported: (res: ImportResponse) => void;
}

type State =
  | { state: "idle" }
  | { state: "busy"; label: string }
  | { state: "done"; source: string; res: ImportResponse }
  | { state: "error"; source: string; message: string };

const MAX_LISTED_IDS = 15;

/** First 15 accepted IDs, then a count of the rest. */
function summarizeIds(ids: string[]): string {
  if (ids.length <= MAX_LISTED_IDS) return ids.join(", ");
  return `${ids.slice(0, MAX_LISTED_IDS).join(", ")}, … +${ids.length - MAX_LISTED_IDS} more`;
}

export function ImportBar({ onImported }: Props) {
  const [st, setSt] = useState<State>({ state: "idle" });
  const fileInput = useRef<HTMLInputElement>(null);

  async function run(source: string, fn: () => Promise<ImportResponse>) {
    setSt({ state: "busy", label: source });
    try {
      const res = await fn();
      setSt({ state: "done", source, res });
      onImported(res);
    } catch (err) {
      setSt({ state: "error", source, message: err instanceof ApiError ? err.message : String(err) });
    }
  }

  async function onFile(file: File) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setSt({ state: "error", source: file.name, message: "The file is not valid JSON. Upload a GeoJSON FeatureCollection." });
      return;
    }
    await run(file.name, () => api.importClaims(parsed));
  }

  const busy = st.state === "busy";
  return (
    <section className="import" aria-label="Import claims">
      <div className="import-buttons">
        <button className="btn btn-primary" disabled={busy} onClick={() => run("Demo batch", () => api.loadDemo())}>
          {busy && st.label === "Demo batch" ? "Loading…" : "Load demo batch"}
        </button>
        <button className="btn" disabled={busy} onClick={() => fileInput.current?.click()}>
          {busy && st.label !== "Demo batch" ? "Uploading…" : "Upload GeoJSON"}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".geojson,.json,application/geo+json,application/json"
          hidden
          data-testid="geojson-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void onFile(f);
          }}
        />
      </div>
      {st.state === "done" ? (
        <div className={`import-result ${st.res.errors.length ? "partial" : "ok"}`} role="status">
          <span>
            <strong>{st.source}:</strong> {st.res.imported_ids.length} claim{st.res.imported_ids.length === 1 ? "" : "s"} accepted
            {st.res.imported_ids.length ? ` (${summarizeIds(st.res.imported_ids)})` : ""}
            {st.res.errors.length ? `, ${st.res.errors.length} feature${st.res.errors.length === 1 ? "" : "s"} rejected.` : "."}
          </span>
          {st.res.errors.length ? (
            <details open>
              <summary>Rejected features</summary>
              <ul className="err-list">
                {st.res.errors.map((e, i) => (
                  <li key={i}>
                    <span className="mono">#{e.index}</span>
                    {e.claim_id ? <span className="mono"> {e.claim_id}</span> : null} — {e.message}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
      {st.state === "error" ? (
        <div className="import-result err" role="alert">
          <strong>{st.source} was not imported.</strong> {st.message}
        </div>
      ) : null}
      {api.mode === "live" ? (
        <a className="import-link" href="/demo/claims.geojson" download="claims.geojson">
          Download demo GeoJSON
        </a>
      ) : null}
    </section>
  );
}
