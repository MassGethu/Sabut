import type { ClaimDetail, EvidenceRecord, QueueItem } from "../api/types";
import { fmtDate, fmtNum, utcMs } from "../format";
import { actionLabel, humanize } from "../i18n/labels";
import { SourceTag, StatusPill, Tag } from "./Badges";
import { AcquisitionTable, ModelScore, Provenance, QualityGateView } from "./EvidenceParts";
import { SignalChart } from "./SignalChart";

/** Server recommendation fields, displayed as returned. */
export function Recommendation({ item, compact }: { item: QueueItem; compact?: boolean }) {
  return (
    <div className={`rec-block ${compact ? "rec-compact" : ""}`}>
      <div className="rec-top">
        <StatusPill status={item.status} />
        {item.rank !== null ? (
          item.in_visit_budget ? (
            <Tag tone="info">Visit rank {item.rank} · in budget</Tag>
          ) : (
            <Tag>Visit rank {item.rank} · outside budget</Tag>
          )
        ) : (
          <Tag>Unranked</Tag>
        )}
      </div>
      <p className="rec-reason">{item.reason}</p>
      <dl className="rec-grid">
        <div>
          <dt>Next action</dt>
          <dd>
            <strong>{actionLabel(item.next_action)}</strong>
          </dd>
        </div>
        <div>
          <dt>Claimed acreage</dt>
          <dd>{item.claimed_acres !== null ? `${fmtNum(item.claimed_acres)} ac` : <em className="muted">Not stated by applicant</em>}</dd>
        </div>
        <div>
          <dt>Priority index</dt>
          <dd>
            {item.visit_priority !== null ? (
              <span className="mono">{fmtNum(item.visit_priority, 0)}</span>
            ) : item.rank !== null ? (
              <em className="muted">No index (ranked without acreage)</em>
            ) : (
              <em className="muted">Not visit-eligible</em>
            )}
          </dd>
        </div>
        <div>
          <dt>Reason code</dt>
          <dd className="mono small">{item.reason_code}</dd>
        </div>
      </dl>
      {item.field_question ? (
        <div className="field-q">
          <span className="eyebrow">Question for the field team</span>
          <p>{item.field_question}</p>
        </div>
      ) : null}
      {item.rank_reason ? (
        <p className="rank-reason">
          <span className="eyebrow">Rank reason</span> {item.rank_reason}
        </p>
      ) : !compact && item.rank === null ? (
        <p className="rank-reason muted">
          <span className="eyebrow">Rank</span> Not ranked for a visit: the next action is{" "}
          {actionLabel(item.next_action).toLowerCase()}, which a field visit would not resolve.
        </p>
      ) : null}
    </div>
  );
}

function EvidenceBlock({
  evidence,
  heading,
  harvestDate,
  model,
}: {
  evidence: EvidenceRecord;
  heading: string;
  harvestDate?: string | null;
  model?: ClaimDetail["model"];
}) {
  return (
    <section className="panel evidence-block">
      <div className="panel-head">
        <h3>{heading}</h3>
        <SourceTag kind={evidence.source_kind} detail={<span className="mono">{evidence.processing_version}</span>} />
      </div>
      {evidence.source_kind === "simulated" ? (
        <p className="sim-banner">
          Simulated workflow evidence. Scene IDs, values and any score are fictional and exist to demonstrate the review
          workflow.
        </p>
      ) : null}
      <div className="evidence-grid">
        <SignalChart evidence={evidence} harvestDate={harvestDate} />
        <aside className="evidence-side">
          <Provenance evidence={evidence} />
        </aside>
      </div>
      <div className="evidence-grid-2">
        <QualityGateView evidence={evidence} />
        <ModelScore model={model !== undefined ? model : evidence.model} evidenceKind={evidence.source_kind} />
      </div>
      {evidence.gaps?.length ? (
        <ul className="gap-list">
          {evidence.gaps.map((g, i) => (
            <li key={i}>
              <strong>
                Gap {fmtDate(g.start)} → {fmtDate(g.end)}
              </strong>{" "}
              <span className="muted">{g.reason}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <AcquisitionTable evidence={evidence} harvestDate={harvestDate} />
    </section>
  );
}

function retroNote(evidence: EvidenceRecord | null): string | null {
  const r = evidence?.retrospective;
  if (r && typeof r === "object" && typeof (r as { note?: unknown }).note === "string") return (r as { note: string }).note;
  return null;
}

function Retrospective({ detail, evidence }: { detail: ClaimDetail; evidence: EvidenceRecord | null }) {
  const harvest = detail.reported_harvest_date!;
  const hMs = utcMs(harvest);
  const before = (evidence?.observations ?? []).filter((o) => Date.parse(o.acquired_at) < hMs);
  const usableBefore = before.filter((o) => o.usable);
  return (
    <section className="panel retro">
      <div className="panel-head">
        <h3>Review after harvest</h3>
        <Tag tone="warn">Applicant-reported harvest date · fictional claim</Tag>
      </div>
      <div className="retro-grid">
        <div>
          <span className="eyebrow">Reported harvest</span>
          <strong className="big">{fmtDate(harvest)}</strong>
          <small className="muted">As reported by the applicant on this fictional claim.</small>
        </div>
        <div>
          <span className="eyebrow">Archived acquisitions before harvest</span>
          <strong className="big">
            {usableBefore.length} usable / {before.length}
          </strong>
          <small className="muted">
            {evidence ? (
              <>
                <SourceTag kind={evidence.source_kind} /> {before.length ? `${fmtDate(before[0].acquired_at)} – ${fmtDate(before[before.length - 1].acquired_at)}` : ""}
              </>
            ) : (
              "No cached archive for this boundary."
            )}
          </small>
        </div>
        <div>
          <span className="eyebrow">Next step from the API</span>
          <strong>{actionLabel(detail.next_action)}</strong>
          <small className="muted">{detail.reason}</small>
        </div>
      </div>
      {retroNote(evidence) ? <p className="retro-note">{retroNote(evidence)}</p> : null}
      <p className="retro-explain">
        The field can no longer be inspected for its sowing method after harvest. The archive still holds radar
        acquisitions taken during the sowing window, before the reported harvest. They show whether usable evidence
        exists and what it looked like; archive availability alone cannot establish the sowing method.
      </p>
      <p className="retro-explain">
        <strong>Next step:</strong> {actionLabel(detail.next_action)}.{" "}
        {detail.evidence?.source_kind === "simulated" && evidence?.source_kind === "sentinel1_real"
          ? "This recommendation comes from the labeled workflow simulation. "
          : ""}
        {evidence?.source_kind === "sentinel1_real" && evidence.model?.dsr_score == null
          ? "The real pre-harvest archive is unscored, so it supports the review with dated scene evidence but not a sowing-method score."
          : ""}
        {detail.next_action === "request_records"
          ? " Dated sowing records are needed to complete the review."
          : detail.next_action === "request_boundary_correction"
            ? " A corrected boundary is needed before the archive can be used."
            : ""}
      </p>
    </section>
  );
}

export function ClaimEvidence({ detail }: { detail: ClaimDetail }) {
  const ev = detail.evidence;
  const real = detail.real_evidence;
  const retroSource = ev?.source_kind === "sentinel1_real" ? ev : real ?? ev;
  return (
    <div className="claim-evidence">
      <section className="panel claim-head">
        <div className="claim-title">
          <h2>
            Claim {detail.claim_id}
            {detail.farmer_name ? (
              <span className="muted">
                {" "}
                · {detail.farmer_name}
                {/fictional/i.test(detail.farmer_name) ? "" : " (fictional)"}
              </span>
            ) : null}
          </h2>
          <span className="muted">
            {detail.season} · claims <strong>{detail.claimed_method}</strong>
            {detail.claimed_acres !== null ? ` · ${fmtNum(detail.claimed_acres)} ac` : ""}
          </span>
        </div>
        <Recommendation item={detail} />
      </section>

      {detail.reported_harvest_date ? <Retrospective detail={detail} evidence={retroSource} /> : null}

      {ev ? (
        <EvidenceBlock
          evidence={ev}
          heading={ev.source_kind === "simulated" ? "Decision evidence (simulated scenario)" : "Radar evidence · Sentinel-1"}
          harvestDate={detail.reported_harvest_date}
          model={detail.model}
        />
      ) : (
        <section className="panel chart-empty-panel">
          <h3>No cached radar evidence</h3>
          <p>
            Sabūt found no cached record matching this claim ID, season and boundary geometry, so there is nothing to chart
            and <strong>no model score</strong> was produced.
          </p>
          <p>
            <strong>Next action:</strong> {actionLabel(detail.next_action)}. {detail.reason}
          </p>
          <p className="muted small">
            Reason code <span className="mono">{detail.reason_code}</span> · {humanize(detail.reason_code)}
          </p>
        </section>
      )}

      {real ? (
        <EvidenceBlock
          evidence={real}
          heading="Real Sentinel-1 extraction for this boundary (shown alongside the simulation)"
          harvestDate={detail.reported_harvest_date}
        />
      ) : null}
    </div>
  );
}
