import { useEffect, useState } from "react";
import { ApiError, api } from "../api/client";
import type { BenchmarkResponse, ClaimDetail, EvidenceRecord } from "../api/types";
import { fmtDate, fmtNum } from "../format";
import { SourceTag, Tag } from "../components/Badges";
import { AcquisitionTable, Provenance } from "../components/EvidenceParts";
import { SignalChart } from "../components/SignalChart";

type Json = unknown;
const isObj = (v: Json): v is Record<string, Json> => !!v && typeof v === "object" && !Array.isArray(v);

function fmtVal(v: Json): string {
  if (typeof v === "number") return Math.abs(v) <= 1 && !Number.isInteger(v) ? fmtNum(v, 4) : fmtNum(v, 3);
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

const BENCHMARK_TRACKS = [
  ["hc_p_lgb", "Handcrafted + Presto LightGBM"],
  ["hc_lgb", "Handcrafted-only LightGBM"],
  ["radar_rule", "Radar-rule baseline"],
] as const;

function BenchmarkPanel({ report }: { report: Record<string, Json> }) {
  const paper = isObj(report.paper) ? report.paper : {};
  const comparison = isObj(report.comparison_on_test) ? report.comparison_on_test : {};
  const split = isObj(report.split) ? report.split : {};
  const rows = isObj(split.rows) ? split.rows : {};
  return (
    <section className="panel">
      <div className="panel-head">
        <h3>Ricemapper benchmark · published vs reproduced</h3>
        <Tag tone="info">Public Punjab feature table</Tag>
      </div>
      {typeof paper.published_weighted_f1 === "number" ? (
        <p className="small">
          <strong>Published weighted F1 {fmtVal(paper.published_weighted_f1)}</strong>
          {" · "}{fmtVal(paper.published_configuration)}
        </p>
      ) : null}
      <div className="table-wrap">
        <table aria-label="Ricemapper rerun metrics on the held-out test set">
          <thead>
            <tr>
              <th>Rerun track</th>
              <th className="num">Weighted F1</th>
              <th className="num">DSR precision</th>
              <th className="num">DSR recall</th>
            </tr>
          </thead>
          <tbody>
            {BENCHMARK_TRACKS.map(([key, label]) => {
              const track = comparison[key];
              return isObj(track) ? (
                <tr key={key}>
                  <td>{label}</td>
                  <td className="num">{fmtVal(track.weighted_f1)}</td>
                  <td className="num">{fmtVal(track.dsr_precision)}</td>
                  <td className="num">{fmtVal(track.dsr_recall)}</td>
                </tr>
              ) : null;
            })}
          </tbody>
        </table>
      </div>
      {typeof rows.test === "number" ? (
        <p className="small muted">
          All three reruns used the same stratified holdout of {rows.test} test rows, with seed {fmtVal(split.seed)}.
          The release lacks geographic identifiers.
        </p>
      ) : null}
      {report.limitations !== undefined ? (
        <div className="report-block limits">
          <h4>Limitations</h4>
          <JsonTree value={report.limitations} />
        </div>
      ) : null}
      <details className="report-raw">
        <summary>Full benchmark report (reports/benchmark.json)</summary>
        <JsonTree value={report} />
      </details>
    </section>
  );
}

const METHOD_LABEL: Record<string, string> = {
  sabut: "Sabūt queue policy",
  seeded_random: "Seeded random",
  score_only: "Score-only ordering",
};

function ReplayTable({ report }: { report: Record<string, Json> }) {
  const methods = report.methods;
  if (!isObj(methods)) return null;
  const num = (v: Json) => (typeof v === "number" ? v : null);
  return (
    <>
      <div className="metrics">
        <Metric label="Visit budget" value={report.budget} />
        <Metric label="Candidate pool" value={report.candidate_pool_count} note="visit-eligible claims" />
        <Metric label="Random seed" value={report.seed} />
        <Metric label="Outcome source" value={report.outcome_source} />
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Method</th>
              <th>Selected claims</th>
              <th className="num">Resolved</th>
              <th className="num">Corrected</th>
              <th className="num">Resolved or corrected</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(methods).map(([k, m]) => {
              if (!isObj(m)) return null;
              const hit = num(m.resolved_or_corrected);
              const den = num(m.denominator);
              return (
                <tr key={k} className={k === "sabut" ? "row-sabut" : ""}>
                  <td>
                    <strong>{METHOD_LABEL[k] ?? k.replaceAll("_", " ")}</strong>
                  </td>
                  <td className="mono">{Array.isArray(m.selected_claim_ids) ? m.selected_claim_ids.join(", ") : "—"}</td>
                  <td className="num">{fmtVal(m.resolved)}</td>
                  <td className="num">{fmtVal(m.corrected)}</td>
                  <td className="num">
                    <strong>
                      {hit ?? "—"} / {den ?? "—"}
                    </strong>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {typeof report.score_only_order === "string" || typeof report.random_order === "string" ? (
        <p className="muted small">
          {typeof report.random_order === "string" ? `Random: ${report.random_order} ` : ""}
          {typeof report.score_only_order === "string" ? `Score-only: ${report.score_only_order}` : ""}
        </p>
      ) : null}
    </>
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
      <ReplayTable report={report} />
      <details className="report-raw">
        <summary>Full replay report (reports/replay.json)</summary>
        <JsonTree value={report} />
      </details>
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
      {records.map(({ claim, ev }, idx) => (
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
          <AcquisitionTable evidence={ev} defaultOpen={idx === 0} harvestDate={claim.reported_harvest_date} />
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
  real.sort((a, b) => a.claim.claim_id.localeCompare(b.claim.claim_id));

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
