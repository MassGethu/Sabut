import type { ClaimDetail } from "../api/types";
import { fmtNum } from "../format";
import { SourceTag } from "./Badges";
import { Recommendation } from "./ClaimEvidence";
import { SignalChart, bandDomain } from "./SignalChart";

/** Side-by-side comparison of two (typically neighbouring) claims on one shared scale. */
export function Compare({ claims, onClose, onFocus }: { claims: ClaimDetail[]; onClose: () => void; onFocus: (id: string) => void }) {
  const domain = bandDomain(claims.map((c) => c.evidence));
  const sameMethod = claims.length === 2 && claims[0].claimed_method === claims[1].claimed_method;
  return (
    <section className="panel compare" aria-label="Claim comparison">
      <div className="panel-head">
        <h3>
          Compare {claims.map((c) => c.claim_id).join(" · ")}
          {sameMethod ? <span className="muted small"> — both claim {claims[0].claimed_method}</span> : null}
        </h3>
        <button className="btn btn-ghost btn-xs" onClick={onClose}>
          Close comparison
        </button>
      </div>
      <div className="compare-grid">
        {claims.map((c) => {
          const score = c.model?.dsr_score ?? null;
          return (
            <div key={c.claim_id} className="compare-col">
              <div className="compare-col-head">
                <button className="link-btn" onClick={() => onFocus(c.claim_id)}>
                  <strong>Claim {c.claim_id}</strong>
                </button>
                <span className="muted small">
                  {c.claimed_method} · {c.claimed_acres !== null ? `${fmtNum(c.claimed_acres)} ac` : "acreage not stated"}
                </span>
              </div>
              {c.evidence ? (
                <>
                  <SignalChart evidence={c.evidence} yDomain={domain} compact />
                  <div className="compare-facts">
                    <SourceTag kind={c.evidence.source_kind} detail={<span className="mono">{c.evidence.processing_version}</span>} />
                    <span>
                      <strong>{c.evidence.usable_count}</strong> usable dates
                    </span>
                    <span>
                      Model score{" "}
                      <strong>{score !== null ? fmtNum(score, 2) : "unavailable"}</strong>
                      {c.model?.source_kind === "simulated" ? " (simulated)" : ""}
                    </span>
                  </div>
                </>
              ) : (
                <div className="chart-empty">No cached radar evidence for this boundary.</div>
              )}
              <Recommendation item={c} compact />
            </div>
          );
        })}
      </div>
      <p className="muted small">Both charts share one backscatter scale and the actual acquisition dates of each record.</p>
    </section>
  );
}
