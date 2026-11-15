import { useState } from "react";
import type { EvidenceRecord, ModelOutput, QualityFlag } from "../api/types";
import { fmtDate, fmtNum, fmtPct, fmtUtc } from "../format";
import { humanize } from "../i18n/labels";
import { SourceTag, Tag } from "./Badges";

export function flagText(f: QualityFlag): string {
  if (typeof f === "string") return humanize(f);
  const text = typeof f.detail === "string" ? f.detail : typeof f.message === "string" ? f.message : "";
  return text ? `${humanize(f.code)}: ${text}` : humanize(f.code) || JSON.stringify(f);
}

/** Provenance block that sits beside each chart. */
export function Provenance({ evidence }: { evidence: EvidenceRecord }) {
  const settings = evidence.acquisition_settings ?? {};
  const all = Object.entries(settings).filter(([, v]) => v !== null && v !== undefined && v !== "");
  const PRIMARY = ["provider", "collection", "coefficient", "orbit_state", "relative_orbit", "polarizations", "note"];
  const entries = all.filter(([k]) => PRIMARY.includes(k));
  const extra = all.filter(([k]) => !PRIMARY.includes(k));
  const show = (v: unknown) => (Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : String(v));
  return (
    <dl className="provenance">
      <div>
        <dt>Source</dt>
        <dd>
          <SourceTag kind={evidence.source_kind} />
        </dd>
      </div>
      <div>
        <dt>Processing version</dt>
        <dd className="mono">{evidence.processing_version || "—"}</dd>
      </div>
      <div>
        <dt>Window</dt>
        <dd>
          {fmtDate(evidence.window?.start)} – {fmtDate(evidence.window?.end)}
        </dd>
      </div>
      <div>
        <dt>Units</dt>
        <dd>{evidence.units || "—"}</dd>
      </div>
      <div>
        <dt>Usable dates</dt>
        <dd>
          <strong>{evidence.usable_count}</strong> of {evidence.observations?.length ?? 0} acquisitions
        </dd>
      </div>
      {typeof evidence.feature_processing === "string" ? (
        <div>
          <dt>Feature processing</dt>
          <dd className="mono">{evidence.feature_processing}</dd>
        </div>
      ) : null}
      {typeof evidence.plot_pixels === "number" ? (
        <div>
          <dt>Plot pixels</dt>
          <dd>
            {evidence.plot_pixels}
            {evidence.boundary_usable === false ? " · boundary unusable" : ""}
          </dd>
        </div>
      ) : null}
      {entries.map(([k, v]) => (
        <div key={k}>
          <dt>{humanize(k)}</dt>
          <dd className="mono">{show(v)}</dd>
        </div>
      ))}
      {extra.length ? (
        <details className="prov-more">
          <summary>Processing settings ({extra.length})</summary>
          <dl>
            {extra.map(([k, v]) => (
              <div key={k}>
                <dt>{humanize(k)}</dt>
                <dd className="mono">{show(v)}</dd>
              </div>
            ))}
          </dl>
        </details>
      ) : null}
      {evidence.geometry_hash ? (
        <div>
          <dt>Geometry hash</dt>
          <dd className="mono" title={evidence.geometry_hash}>
            {evidence.geometry_hash.slice(0, 12)}…
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

const CRITERIA: Record<string, string> = {
  boundary_quality: "Usable plot boundary",
  invalid_observation_window: "Valid sowing window",
  insufficient_usable_dates: "Enough distinct usable dates",
  observation_gap_too_long: "No gap longer than the limit",
};

/** The evidence gate the backend applied, with the failed criterion highlighted. */
export function QualityGateView({ evidence }: { evidence: EvidenceRecord }) {
  const gate = evidence.quality_gate;
  const flags = evidence.quality_flags ?? [];
  if (!gate && !flags.length) return null;
  const failed = gate?.failed_criterion ?? null;
  const rows = gate
    ? [
        {
          key: "boundary_quality",
          label: "Usable plot boundary",
          detail: failed === "boundary_quality" ? "The extraction flagged this boundary — see the quality flags below" : "Boundary not flagged by the extraction",
        },
        {
          key: "insufficient_usable_dates",
          label: `≥ ${gate.min_usable_dates} distinct usable dates`,
          detail: `${evidence.usable_count} usable, each with ≥ ${fmtPct(gate.min_valid_fraction)} valid plot coverage and VV/VH`,
        },
        {
          key: "observation_gap_too_long",
          label: `No gap over ${gate.max_gap_days} days`,
          detail: evidence.gaps?.length ? `${evidence.gaps.length} gap(s) recorded` : "Including window edges",
        },
      ]
    : [];
  return (
    <div className="gate">
      <h4>Evidence gate</h4>
      {rows.length ? (
        <ul className="gate-list">
          {rows.map((r) => {
            const isFailed = failed === r.key;
            const notReached = failed !== null && !isFailed && rows.findIndex((x) => x.key === failed) < rows.indexOf(r);
            return (
              <li key={r.key} className={isFailed ? "gate-fail" : notReached ? "gate-skip" : "gate-pass"}>
                <span className="gate-icon" aria-hidden>
                  {isFailed ? "✕" : notReached ? "–" : "✓"}
                </span>
                <span>
                  <strong>{r.label}</strong>
                  <small>{isFailed ? "Failed. " : notReached ? "Not evaluated after an earlier failure. " : ""}{r.detail}</small>
                </span>
              </li>
            );
          })}
          {failed && !rows.some((r) => r.key === failed) ? (
            <li className="gate-fail">
              <span className="gate-icon">✕</span>
              <span>
                <strong>{CRITERIA[failed] ?? humanize(failed)}</strong>
              </span>
            </li>
          ) : null}
        </ul>
      ) : null}
      {flags.length ? (
        <div className="flags">
          <span className="eyebrow">Quality flags</span>
          <ul>
            {flags.map((f, i) => (
              <li key={i}>{flagText(f)}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** Model score card. Uses "model score" wording and shows why a score is unavailable. */
export function ModelScore({ model, evidenceKind }: { model: ModelOutput | null | undefined; evidenceKind?: string }) {
  if (!model) {
    return (
      <div className="score score-none">
        <h4>Model score</h4>
        <p className="score-unavail">Unavailable</p>
        <p className="muted">
          No model output is cached for this evidence, so no score was computed. The next action relies on the evidence gate.
        </p>
      </div>
    );
  }
  const has = model.dsr_score !== null && model.dsr_score !== undefined;
  return (
    <div className={`score ${has ? "" : "score-none"}`}>
      <h4>
        Model score <SourceTag kind={model.source_kind} />
      </h4>
      {has ? (
        <>
          <div className="score-row">
            <span className="score-value">{fmtNum(model.dsr_score, 2)}</span>
            <span className="score-scale">
              <span className="score-track">
                <span className="score-mark" style={{ left: `${(model.dsr_score as number) * 100}%` }} />
              </span>
              <span className="score-ends">
                <span>0 · PTR-like</span>
                <span>DSR-like · 1</span>
              </span>
            </span>
          </div>
          <p className="muted small">
            DSR model score from {model.model_version ?? "unnamed model"}. A model score, not a calibrated probability.
            {model.source_kind === "simulated" ? " Simulated for the workflow demonstration." : ""}
          </p>
        </>
      ) : (
        <>
          <p className="score-unavail">Unavailable</p>
          <p className="score-reason">
            <strong>Why:</strong>{" "}
            {model.compatibility_reason ||
              (model.compatible === false ? "The export is incompatible with the model." : "Compatibility is unverified.")}
          </p>
        </>
      )}
      <dl className="score-meta">
        <div>
          <dt>Compatible</dt>
          <dd>{model.compatible === true ? "Yes" : model.compatible === false ? "No" : "Unverified"}</dd>
        </div>
        <div>
          <dt>Model version</dt>
          <dd className="mono">{model.model_version ?? "—"}</dd>
        </div>
        {model.feature_schema?.length ? (
          <div>
            <dt>Features</dt>
            <dd className="mono">{model.feature_schema.length} ordered</dd>
          </div>
        ) : null}
        {has && model.compatibility_reason ? (
          <div className="wide">
            <dt>Note</dt>
            <dd>{model.compatibility_reason}</dd>
          </div>
        ) : null}
        {evidenceKind && model.source_kind !== evidenceKind ? (
          <div className="wide">
            <dt>Warning</dt>
            <dd>Score source differs from evidence source.</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

/** Expandable table of every acquisition with scene IDs and quality. */
export function AcquisitionTable({ evidence, defaultOpen = false, harvestDate }: { evidence: EvidenceRecord; defaultOpen?: boolean; harvestDate?: string | null }) {
  const [open, setOpen] = useState(defaultOpen);
  const rows = [...(evidence.observations ?? [])].sort((a, b) => Date.parse(a.acquired_at) - Date.parse(b.acquired_at));
  const harvestMs = harvestDate ? Date.parse(`${harvestDate}T00:00:00Z`) : null;
  return (
    <div className="acq">
      <button className="acq-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="chev" aria-hidden>
          {open ? "▾" : "▸"}
        </span>
        Acquisitions ({rows.length}) · scene IDs, coverage, quality · processing{" "}
        <span className="mono">{evidence.processing_version}</span>
      </button>
      {open ? (
        rows.length ? (
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Acquisition records">
            <table>
              <thead>
                <tr>
                  <th>Acquired (UTC)</th>
                  <th>Scene ID</th>
                  <th className="num">VV ({evidence.units})</th>
                  <th className="num">VH ({evidence.units})</th>
                  <th className="num">Valid coverage</th>
                  <th>Usable</th>
                  <th>Reason / flag</th>
                  {harvestMs ? <th>Before harvest</th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((o, i) => (
                  <tr key={`${o.scene_id}-${i}`} className={o.usable ? "" : "row-bad"}>
                    <td className="nowrap">{fmtUtc(o.acquired_at)}</td>
                    <td className="mono scene">{o.scene_id || "—"}</td>
                    <td className="num">{fmtNum(o.vv)}</td>
                    <td className="num">{fmtNum(o.vh)}</td>
                    <td className="num">{fmtPct(o.valid_fraction)}</td>
                    <td>{o.usable ? <Tag tone="good">Usable</Tag> : <Tag tone="bad">Not usable</Tag>}</td>
                    <td className="small">{o.reason ?? ""}</td>
                    {harvestMs ? <td>{Date.parse(o.acquired_at) < harvestMs ? "Yes" : "No"}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted small">
              Actual acquisition timestamps from the cached record. No interpolated or resampled dates appear in this table.
            </p>
          </div>
        ) : (
          <p className="muted">No acquisitions in this record.</p>
        )
      ) : null}
    </div>
  );
}
