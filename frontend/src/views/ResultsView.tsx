import { useEffect, useState } from "react";
import { ApiError, api } from "../api/client";
import type { BenchmarkResponse, ClaimDetail, EvidenceRecord } from "../api/types";
import { fmtDate, fmtNum } from "../format";
import { SourceTag, Tag } from "../components/Badges";
import { AcquisitionTable, Provenance } from "../components/EvidenceParts";
import { SignalChart } from "../components/SignalChart";

type Json = unknown;
const isObj = (v: Json): v is Record<string, Json> => !!v && typeof v === "object" && !Array.isArray(v);

/** Find the first value whose key matches one of the candidates (case-insensitive), searching nested objects. */
function pick(obj: Json, keys: string[], depth = 3): Json {
  if (!isObj(obj) || depth < 0) return undefined;
  const lower = keys.map((k) => k.toLowerCase());
  for (const [k, v] of Object.entries(obj)) if (lower.includes(k.toLowerCase())) return v;
  for (const v of Object.values(obj)) {
    const found = pick(v, keys, depth - 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

function fmtVal(v: Json): string {
  if (typeof v === "number") return Math.abs(v) <= 1 && !Number.isInteger(v) ? v.toFixed(3) : fmtNum(v, 3);
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (v === null || v === undefined) return "—";
  return JSON.stringify(v);
}

/** Generic, readable rendering of report JSON so new fields appear without code changes. */
function JsonTree({ value, depth = 0 }: { value: Json; depth?: number }) {
  if (Array.isArray(value)) {
    if (value.every((x) => !isObj(x) && !Array.isArray(x))) return <span className="mono">{value.map(fmtVal).join(", ")}</span>;
    if (value.every((x) => Array.isArray(x))) {
      return (
        <table className="matrix">
          <tbody>
            {(value as Json[][]).map((row, i) => (
              <tr key={i}>
                {row.map((c, j) => (
                  <td key={j} className="num">
                    {fmtVal(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    return (
      <ol className="tree-list">
        {value.map((v, i) => (
          <li key={i}>
            <JsonTree value={v} depth={depth + 1} />
          </li>
        ))}
      </ol>
    );
  }
  if (isObj(value)) {
    return (
      <dl className={`tree tree-d${Math.min(depth, 3)}`}>
        {Object.entries(value).map(([k, v]) => (
          <div key={k} className={isObj(v) || Array.isArray(v) ? "tree-nested" : ""}>
            <dt>{k.replaceAll("_", " ")}</dt>
            <dd>
              <JsonTree value={v} depth={depth + 1} />
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  return <span>{fmtVal(value)}</span>;
}

function Metric({ label, value, note }: { label: string; value: Json; note?: string }) {
  if (value === undefined) return null;
  return (
    <div className="metric">
      <span className="metric-label">{label}</span>
      <span className="metric-value">{fmtVal(value)}</span>
      {note ? <span className="metric-note">{note}</span> : null}
    </div>
  );
}

function BenchmarkPanel({ report }: { report: Record<string, Json> }) {
  const published = pick(report, ["published_weighted_f1", "paper_weighted_f1", "published"]);
  const reproduced = pick(report, ["weighted_f1", "reproduced_weighted_f1"]);
  const precision = pick(report, ["dsr_precision", "precision_dsr"]);
  const recall = pick(report, ["dsr_recall", "recall_dsr"]);
  const limitations = pick(report, ["limitations", "known_limitations"]);
  const method = pick(report, ["holdout", "holdout_method", "split", "evaluation_method"]);
  return (
    <section className="panel">
      <div className="panel-head">
        <h3>Ricemapper benchmark · published vs reproduced</h3>
        <Tag tone="info">Public feature table · not Haryana accuracy</Tag>
      </div>
      <div className="metrics">
        <Metric label="Published weighted F1" value={isObj(published) ? pick(published, ["weighted_f1", "f1"]) ?? published : published} note="Paper, specific configuration" />
        <Metric label="Reproduced weighted F1" value={reproduced} note="Our rerun" />
        <Metric label="DSR precision" value={precision} />
        <Metric label="DSR recall" value={recall} />
      </div>
      {method !== undefined ? (
        <div className="report-block">
          <h4>Evaluation method</h4>
          <JsonTree value={method} />
        </div>
      ) : null}
      {limitations !== undefined ? (
        <div className="report-block limits">
          <h4>Limitations</h4>
          <JsonTree value={limitations} />
        </div>
      ) : null}
      <details className="report-raw">
        <summary>Full benchmark report (reports/benchmark.json)</summary>
        <JsonTree value={report} />
      </details>
    </section>
  );
}

function ReplayPanel({ report }: { report: Record<string, Json> }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h3>Same-budget replay</h3>
        <Tag tone="warn">Simulation · inspection outcomes are simulated</Tag>
      </div>
      <p className="muted small">
        The actual queue policy versus seeded random and score-only orderings, on the same candidate pool and visit budget.
        Counts are visits reaching cases the simulated inspection resolves or corrects.
      </p>
      <JsonTree value={report} />
    </section>
  );
}

function RealExtraction({ records, onOpen }: { records: { claim: ClaimDetail; ev: EvidenceRecord }[]; onOpen: (id: string) => void }) {
  if (!records.length) {
    return (
      <section className="panel">
        <div className="panel-head">
          <h3>Real Sentinel-1 extraction</h3>
          <Tag>Pending</Tag>
        </div>
        <p className="muted">
          No real georeferenced extraction is loaded in the current workspace yet. When demo/evidence.json is present, its
          claims appear here with scene IDs and processing provenance.
        </p>
      </section>
    );
  }
  return (
    <>
      {records.map(({ claim, ev }) => (
        <section className="panel" key={`${claim.claim_id}-${ev.processing_version}`}>
          <div className="panel-head">
            <h3>
              Real Sentinel-1 extraction · claim {claim.claim_id}
            </h3>
            <SourceTag kind={ev.source_kind} detail={<span className="mono">{ev.processing_version}</span>} />
            <button className="btn btn-ghost btn-xs" onClick={() => onOpen(claim.claim_id)}>
              Open in workspace
            </button>
          </div>
          <div className="evidence-grid">
            <SignalChart evidence={ev} harvestDate={claim.reported_harvest_date} />
            <aside className="evidence-side">
              <Provenance evidence={ev} />
              <p className="small">
                Model score:{" "}
                {ev.model?.dsr_score != null ? (
                  <strong>{fmtNum(ev.model.dsr_score, 2)}</strong>
                ) : (
                  <>
                    <strong>unavailable</strong> — {ev.model?.compatibility_reason ?? "no compatible model output for this export."}
                  </>
                )}
              </p>
            </aside>
          </div>
          <AcquisitionTable evidence={ev} defaultOpen harvestDate={claim.reported_harvest_date} />
          {claim.reported_harvest_date ? (
            <p className="muted small">Applicant-reported harvest date on this fictional claim: {fmtDate(claim.reported_harvest_date)}.</p>
          ) : null}
        </section>
      ))}
    </>
  );
}

export function ResponsibleAI({ compact }: { compact?: boolean }) {
  return (
    <section className={`panel rai ${compact ? "rai-compact" : ""}`}>
      <h3>Responsible AI</h3>
      <ul>
        <li>
          <strong>Officer control.</strong> Sabūt recommends and ranks; Meena records every decision with a reason and can
          override. Approval, rejection and payment stay outside the app.
        </li>
        <li>
          <strong>Farmer recourse.</strong> Plain-language status and next step in Hindi and Punjabi, with a correction
          request that reaches the officer's record.
        </li>
        <li>
          <strong>Regional limits.</strong> The model foundation is Microsoft's Ricemapper, trained on Punjab features. No
          Haryana accuracy is claimed without independent plot-level labels.
        </li>
        <li>
          <strong>Acreage in ranking.</strong> Visit priority multiplies score ambiguity by claimed acreage, so larger claims
          can move up. The acreage and rank reason are shown on every ranked case; a pilot should track review burden by
          plot size and geography.
        </li>
        <li>
          <strong>Weak evidence flagged first.</strong> Missing, sparse or incompatible radar evidence produces its own
          reason and next action — never an unsupported score.
        </li>
      </ul>
    </section>
  );
}

export function ResultsView({ claims, onOpenClaim }: { claims: ClaimDetail[]; onOpenClaim: (id: string) => void }) {
  const [data, setData] = useState<BenchmarkResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setData(await api.benchmark());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);

  const real: { claim: ClaimDetail; ev: EvidenceRecord }[] = [];
  for (const c of claims) {
    if (c.evidence?.source_kind === "sentinel1_real") real.push({ claim: c, ev: c.evidence });
    if (c.real_evidence) real.push({ claim: c, ev: c.real_evidence });
  }

  return (
    <div className="results">
      <div className="results-head">
        <h2>Evidence and results</h2>
        <button className="btn btn-ghost btn-xs" onClick={() => void load()} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh reports"}
        </button>
      </div>
      <p className="muted">
        Three kinds of proof, kept separate: real radar extraction, the public benchmark rerun, and a labeled simulation
        of visit allocation. Ricemapper (Microsoft) is the disclosed classification foundation.
      </p>

      <RealExtraction records={real} onOpen={onOpenClaim} />

      {error ? (
        <div className="panel err-panel" role="alert">
          Could not load reports: {error}
        </div>
      ) : null}
      {data && !data.benchmark ? (
        <section className="panel pending">
          <div className="panel-head">
            <h3>Ricemapper benchmark</h3>
            <Tag>Pending</Tag>
          </div>
          <p className="muted">{data.message ?? "reports/benchmark.json is not available yet."}</p>
        </section>
      ) : null}
      {data?.benchmark ? <BenchmarkPanel report={data.benchmark} /> : null}
      {data && !data.replay ? (
        <section className="panel pending">
          <div className="panel-head">
            <h3>Same-budget replay</h3>
            <Tag>Pending</Tag>
          </div>
          <p className="muted">reports/replay.json is not available yet. It will compare the queue policy with random and score-only selection under the same budget, using simulated inspection outcomes.</p>
        </section>
      ) : null}
      {data?.replay ? <ReplayPanel report={data.replay} /> : null}

      <ResponsibleAI />
    </div>
  );
}
