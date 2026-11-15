import { useState } from "react";
import type { ClaimDetail, EvidenceRecord } from "../api/types";
import { fmtNum } from "../format";
import { actionLabel } from "../i18n/labels";
import { SourceTag, StatusPill } from "./Badges";
import { SignalChart, bandDomain } from "./SignalChart";

type Source = "decision" | "real";

/** Side-by-side comparison of two (typically neighbouring) claims on one shared scale. */
export function Compare({ claims, onClose, onFocus }: { claims: ClaimDetail[]; onClose: () => void; onFocus: (id: string) => void }) {
  const hasReal = claims.some((c) => c.real_evidence);
  const [source, setSource] = useState<Source>("decision");
  const pickEv = (c: ClaimDetail): EvidenceRecord | null =>
    source === "real" ? c.real_evidence ?? (c.evidence?.source_kind === "sentinel1_real" ? c.evidence : null) : c.evidence;
  const domain = bandDomain(claims.map(pickEv));
  const sameMethod = claims.length === 2 && claims[0].claimed_method === claims[1].claimed_method;

  return (
    <section className="panel compare" aria-label="Claim comparison">
      <div className="compare-top">
        <h2 id="claim-comparison" tabIndex={-1}>
          Compare {claims.map((c) => c.claim_id).join(" · ")}
          {sameMethod ? <span className="muted"> — both claim {claims[0].claimed_method}</span> : null}
        </h2>
        {hasReal ? (
          <div className="seg seg-sm" role="group" aria-label="Comparison evidence source">
            <button type="button" aria-pressed={source === "decision"} className={source === "decision" ? "on" : ""} onClick={() => setSource("decision")}>
              Decision evidence
            </button>
            <button type="button" aria-pressed={source === "real"} className={source === "real" ? "on" : ""} onClick={() => setSource("real")}>
              Real Sentinel-1
            </button>
          </div>
        ) : null}
        <button className="btn btn-ghost btn-xs" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="compare-grid">
        {claims.map((c) => {
          const ev = pickEv(c);
          const model = source === "real" ? ev?.model : c.model;
          const score = model?.dsr_score ?? null;
          return (
            <div key={c.claim_id} className="compare-col">
              <div className="compare-col-head">
                <button className="link-btn" onClick={() => onFocus(c.claim_id)}>
                  Claim {c.claim_id}
                </button>
                <StatusPill status={c.status} size="sm" />
              </div>
              {ev ? (
                <SignalChart evidence={ev} yDomain={domain} compact />
              ) : (
                <div className="chart-empty">No {source === "real" ? "real" : "cached"} radar evidence for this boundary.</div>
              )}
              <dl className="compare-facts">
                <div>
                  <dt>Next action</dt>
                  <dd>{actionLabel(c.next_action)}</dd>
                </div>
                <div>
                  <dt>Model score</dt>
                  <dd>
                    {score !== null ? fmtNum(score, 2) : "unavailable"}
                    {score !== null && model?.source_kind === "simulated" ? " (sim.)" : ""}
                  </dd>
                </div>
                <div>
                  <dt>Usable dates</dt>
                  <dd>{ev ? ev.usable_count : "—"}</dd>
                </div>
                <div>
                  <dt>Claimed</dt>
                  <dd>
                    {c.claimed_method} · {c.claimed_acres !== null ? `${fmtNum(c.claimed_acres)} ac` : "no acreage"}
                  </dd>
                </div>
              </dl>
              {ev ? <SourceTag kind={ev.source_kind} detail={<span className="mono">{ev.processing_version}</span>} /> : null}
              {c.field_question ? <p className="compare-q">Ask on the visit: {c.field_question}</p> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
