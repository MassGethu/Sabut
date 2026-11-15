import { useEffect, useState } from "react";
import type { ClaimDetail, EvidenceRecord } from "../api/types";
import { fmtDate, fmtNum, utcMs } from "../format";
import { actionLabel, humanize } from "../i18n/labels";
import { SourceTag, StatusPill, Tag } from "./Badges";
import { AcquisitionTable, ModelScore, Provenance, QualityGateView } from "./EvidenceParts";
import { SignalChart } from "./SignalChart";

function fictional(name: string) {
  return /fictional/i.test(name) ? name : `${name} (fictional)`;
}

/** Server recommendation for the selected claim, shown as returned. */
function Summary({ detail }: { detail: ClaimDetail }) {
  return (
    <section className="panel claim-summary">
      <header className="claim-head">
        <div>
          <h2>Claim {detail.claim_id}</h2>
          <p className="claim-meta">
            {detail.farmer_name ? `${fictional(detail.farmer_name)} · ` : ""}
            {detail.season} · claims <strong>{detail.claimed_method}</strong> ·{" "}
            {detail.claimed_acres !== null ? `${fmtNum(detail.claimed_acres)} ac claimed` : "acreage not stated"}
          </p>
        </div>
        <div className="claim-badges">
          <StatusPill status={detail.status} />
          {detail.rank !== null ? (
            <Tag tone={detail.in_visit_budget ? "info" : "neutral"}>
              Visit rank {detail.rank} · {detail.in_visit_budget ? "in budget" : "outside budget"}
            </Tag>
          ) : null}
        </div>
      </header>

      <p className="claim-reason">{detail.reason}</p>

      <div className="next-box">
        <span className="eyebrow">Next action</span>
        <strong className="next-action">{actionLabel(detail.next_action)}</strong>
        {detail.field_question ? (
          <p className="field-q">
            <span className="eyebrow">Ask on the visit</span>
            {detail.field_question}
          </p>
        ) : null}
      </div>

      <p className="rank-line">
        {detail.rank !== null ? (
          <>
            <strong>Why rank {detail.rank}:</strong> {detail.rank_reason}
            {detail.visit_priority !== null ? (
              <>
                {" "}
                Priority index <span className="mono">{fmtNum(detail.visit_priority, 0)}</span> (a ranking aid, not money).
              </>
            ) : (
              " No priority index: ranked by score ambiguity only."
            )}
          </>
        ) : (
          <span className="muted">
            Not ranked for a visit — {actionLabel(detail.next_action).toLowerCase()} comes first.
          </span>
        )}
      </p>
    </section>
  );
}

function Retrospective({ detail, evidence }: { detail: ClaimDetail; evidence: EvidenceRecord | null }) {
  const harvest = detail.reported_harvest_date!;
  const hMs = utcMs(harvest);
  const before = (evidence?.observations ?? []).filter((o) => Date.parse(o.acquired_at) < hMs);
  const usable = before.filter((o) => o.usable).length;
  const note =
    evidence?.retrospective && typeof (evidence.retrospective as { note?: unknown }).note === "string"
      ? (evidence.retrospective as { note: string }).note
      : null;
  const fromSimulation = detail.evidence?.source_kind === "simulated" && evidence?.source_kind === "sentinel1_real";
  const unscored = evidence?.source_kind === "sentinel1_real" && evidence.model?.dsr_score == null;
  return (
    <section className="panel retro">
      <div className="retro-top">
        <h3>Review after harvest</h3>
        <Tag tone="warn">Harvest date reported by the applicant · fictional claim</Tag>
      </div>
      <div className="retro-facts">
        <div>
          <span className="eyebrow">Reported harvest</span>
          <strong>{fmtDate(harvest)}</strong>
        </div>
        <div>
          <span className="eyebrow">Archived radar before it</span>
          <strong>
            {usable} usable of {before.length}
          </strong>
          {before.length ? (
            <span className="muted small">
              {fmtDate(before[0].acquired_at)} – {fmtDate(before[before.length - 1].acquired_at)}
            </span>
          ) : null}
        </div>
        <div>
          <span className="eyebrow">Next step from the API</span>
          <strong>{actionLabel(detail.next_action)}</strong>
        </div>
      </div>
      <p className="retro-text">
        The field can't be inspected for its sowing method after harvest, but the archive keeps radar taken during the
        sowing window. It shows that usable evidence exists; on its own it cannot prove the sowing method.
        {fromSimulation ? " This claim's recommendation comes from the labeled simulation." : ""}
        {unscored ? " The real archive is unscored, so it supports the review with dated scenes, not a score." : ""}
      </p>
      {note ? <p className="retro-note">{note}</p> : null}
    </section>
  );
}

function gateSummary(ev: EvidenceRecord): { ok: boolean; text: string } {
  const failed = ev.quality_gate?.failed_criterion;
  if (!ev.quality_gate) return { ok: true, text: "Gate not reported" };
  return failed ? { ok: false, text: `Gate failed: ${humanize(failed).toLowerCase()}` } : { ok: true, text: "Evidence gate passed" };
}

function EvidencePanel({ detail }: { detail: ClaimDetail }) {
  const options: { key: string; label: string; ev: EvidenceRecord }[] = [];
  if (detail.evidence) {
    options.push({
      key: "decision",
      label: detail.evidence.source_kind === "simulated" ? "Decision · simulated" : "Real Sentinel-1",
      ev: detail.evidence,
    });
  }
  if (detail.real_evidence) options.push({ key: "real", label: "Real Sentinel-1", ev: detail.real_evidence });
  const [which, setWhich] = useState(options[0]?.key ?? "decision");
  useEffect(() => setWhich(options[0]?.key ?? "decision"), [detail.claim_id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!options.length) {
    return (
      <section className="panel evidence">
        <h3>Radar evidence</h3>
        <div className="chart-empty">
          <strong>No cached radar evidence for this boundary.</strong>
          <span>
            Nothing matches this claim ID, season and geometry, so there is no chart and no model score. Next action:{" "}
            {actionLabel(detail.next_action)}.
          </span>
        </div>
      </section>
    );
  }

  const current = options.find((o) => o.key === which) ?? options[0];
  const ev = current.ev;
  const model = current.key === "decision" ? detail.model ?? ev.model : ev.model;
  const gate = gateSummary(ev);
  const score = model?.dsr_score;

  return (
    <section className="panel evidence">
      <div className="evidence-top">
        <h3>Radar evidence</h3>
        {options.length > 1 ? (
          <div className="seg seg-sm" role="tablist" aria-label="Evidence source">
            {options.map((o) => (
              <button key={o.key} role="tab" aria-selected={o.key === current.key} className={o.key === current.key ? "on" : ""} onClick={() => setWhich(o.key)}>
                {o.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {ev.source_kind === "simulated" ? (
        <p className="sim-note">Simulated workflow evidence — values, scene IDs and score are fictional.</p>
      ) : null}
      <SignalChart evidence={ev} harvestDate={detail.reported_harvest_date} />
      <div className="ev-chips">
        <SourceTag kind={ev.source_kind} detail={<span className="mono">{ev.processing_version}</span>} />
        <span className="chip-plain">
          <strong>{ev.usable_count}</strong> of {ev.observations?.length ?? 0} acquisitions usable
        </span>
        <span className={`chip-plain ${gate.ok ? "ok" : "bad"}`}>{gate.ok ? "✓" : "✕"} {gate.text}</span>
        <span className="chip-plain">
          Model score{" "}
          {score != null ? (
            <strong>
              {fmtNum(score, 2)}
              {model?.source_kind === "simulated" ? " (simulated)" : ""}
            </strong>
          ) : (
            <strong>unavailable</strong>
          )}
        </span>
      </div>
      {score == null && model?.compatibility_reason ? (
        <p className="why-line" title={model.compatibility_reason}>
          <strong>Why no score:</strong> {model.compatibility_reason}
        </p>
      ) : null}
      <details className="ev-details">
        <summary>Evidence details — provenance, gate, model, acquisitions with scene IDs</summary>
        <div className="ev-details-body">
          <Provenance evidence={ev} />
          <div className="evidence-grid-2">
            <QualityGateView evidence={ev} />
            <ModelScore model={model} evidenceKind={ev.source_kind} />
          </div>
          <AcquisitionTable evidence={ev} defaultOpen harvestDate={detail.reported_harvest_date} />
        </div>
      </details>
    </section>
  );
}

export function ClaimEvidence({ detail }: { detail: ClaimDetail }) {
  const ev = detail.evidence;
  const real = detail.real_evidence;
  const retroSource = ev?.source_kind === "sentinel1_real" ? ev : real ?? ev;
  return (
    <div className="claim-evidence">
      <Summary detail={detail} />
      {detail.reported_harvest_date ? <Retrospective detail={detail} evidence={retroSource} /> : null}
      <EvidencePanel detail={detail} />
    </div>
  );
}
