import { useEffect, useState } from "react";
import { ApiError, api } from "../api/client";
import type { BenchmarkResponse, ClaimDetail, EvidenceRecord } from "../api/types";
import { fmtDate, fmtNum } from "../format";
import { SourceTag, Tag } from "../components/Badges";
import { AcquisitionTable, Provenance } from "../components/EvidenceParts";
import { SignalChart } from "../components/SignalChart";
import { statusLabel } from "../i18n/labels";

type Json = unknown;
const isObj = (v: Json): v is Record<string, Json> => !!v && typeof v === "object" && !Array.isArray(v);

/** Find the first value whose key matches one of the candidates (case-insensitive), searching nested objects. */
function pickPath(
  obj: Json,
  keys: string[],
  depth = 3,
  path = "",
  skip: RegExp | null = null,
): { path: string; value: Json } | undefined {
  if (!isObj(obj) || depth < 0) return undefined;
  const lower = keys.map((k) => k.toLowerCase());
  for (const [k, v] of Object.entries(obj)) if (lower.includes(k.toLowerCase())) return { path: path + k, value: v };
  for (const [k, v] of Object.entries(obj)) {
    if (skip && skip.test(k)) continue;
    const found = pickPath(v, keys, depth - 1, `${path}${k}.`, skip);
    if (found !== undefined) return found;
  }
  return undefined;
}

function pick(obj: Json, keys: string[], depth = 3): Json {
  return pickPath(obj, keys, depth)?.value;
}

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
    if (value.every((x) => !isObj(x) && !Array.isArray(x))) {
      // Sentences (limitations, protocol notes) read better as a list than a joined line.
      if (value.some((x) => typeof x === "string" && x.length > 40)) {
        return (
          <ul className="tree-sentences">
            {value.map((x, i) => (
              <li key={i}>{fmtVal(x)}</li>
            ))}
          </ul>
        );
      }
      return <span className="mono">{value.map(fmtVal).join(", ")}</span>;
    }
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

function scalar(found: { path: string; value: Json } | undefined) {
  if (!found) return undefined;
  if (isObj(found.value)) {
    const inner = pickPath(found.value, ["weighted_f1", "f1", "value"], 1, `${found.path}.`);
    if (inner && !isObj(inner.value)) return inner;
    return undefined;
  }
  return found;
}

function BenchmarkPanel({ report }: { report: Record<string, Json> }) {
  const published = scalar(pickPath(report, ["published_weighted_f1", "paper_weighted_f1", "published"]));
  // Our own rerun: never read from the paper's numbers or a baseline.
  const notOurs = /paper|publish|baseline|rule/i;
  const reproduced = scalar(pickPath(report, ["reproduced_weighted_f1", "weighted_f1"], 3, "", notOurs));
  const precision = scalar(pickPath(report, ["dsr_precision", "precision_dsr"], 3, "", notOurs));
  const recall = scalar(pickPath(report, ["dsr_recall", "recall_dsr"], 3, "", notOurs));
  const limitations = pick(report, ["limitations", "known_limitations"]);
  const method = pick(report, ["holdout", "holdout_method", "split", "evaluation_method"]);
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Ricemapper benchmark · published vs reproduced</h2>
        <Tag tone="info">Public feature table · not Haryana accuracy</Tag>
      </div>
      {isObj(report.comparison_on_test) ? (
        <TrackComparison report={report} />
      ) : (
        <div className="metrics">
          <Metric label="Published weighted F1" value={published?.value} note={`Paper · ${published?.path}`} />
          <Metric label="Reproduced weighted F1" value={reproduced?.value} note={`Our rerun · ${reproduced?.path}`} />
          <Metric label="DSR precision" value={precision?.value} note={precision?.path} />
          <Metric label="DSR recall" value={recall?.value} note={recall?.path} />
        </div>
      )}
      {isObj(report.split) ? (
        <div className="report-block">
          <h3>Evaluation method</h3>
          <SplitSummary split={report.split} />
        </div>
      ) : method !== undefined ? (
        <div className="report-block">
          <h3>Evaluation method</h3>
          <JsonTree value={method} />
        </div>
      ) : null}
      {Array.isArray(report.protocol_differences) ? (
        <div className="report-block">
          <h3>Differences from the published protocol</h3>
          <JsonTree value={report.protocol_differences} />
        </div>
      ) : null}
      {limitations !== undefined ? (
        <div className="report-block limits">
          <h3>Limitations</h3>
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

const SPLITS = ["train", "validation", "test"] as const;

/** The held-out split as labelled facts plus one rows table, instead of a raw key tree. */
function SplitSummary({ split }: { split: Record<string, Json> }) {
  const rows = isObj(split.rows) ? split.rows : null;
  const dsr = isObj(split.dsr_rows) ? split.dsr_rows : null;
  const num = (o: Record<string, Json> | null, k: string) => (o && typeof o[k] === "number" ? (o[k] as number) : null);
  if (!rows) return <JsonTree value={split} />;
  const total = (o: Record<string, Json> | null) => SPLITS.reduce((sum, k) => sum + (num(o, k) ?? 0), 0);
  return (
    <div className="split">
      <dl className="split-facts">
        {typeof split.method === "string" ? (
          <div>
            <dt>Method</dt>
            <dd>{split.method}</dd>
          </div>
        ) : null}
        {split.seed !== undefined ? (
          <div>
            <dt>Random seed</dt>
            <dd className="mono">{fmtVal(split.seed)}</dd>
          </div>
        ) : null}
        {typeof split.same_split_for_all_tracks === "boolean" ? (
          <div>
            <dt>Same split for every track</dt>
            <dd>{split.same_split_for_all_tracks ? "Yes" : "No"}</dd>
          </div>
        ) : null}
        {typeof split.geographic_separation === "string" ? (
          <div>
            <dt>Geographic separation</dt>
            <dd>{split.geographic_separation}</dd>
          </div>
        ) : null}
      </dl>
      <table className="split-table">
        <thead>
          <tr>
            <th scope="col">Split</th>
            <th scope="col" className="num">Plots</th>
            {dsr ? <th scope="col" className="num">DSR plots</th> : null}
            {dsr ? <th scope="col" className="num">DSR share</th> : null}
          </tr>
        </thead>
        <tbody>
          {SPLITS.map((k) => {
            const n = num(rows, k);
            const d = num(dsr, k);
            return (
              <tr key={k}>
                <th scope="row">{k[0].toUpperCase() + k.slice(1)}</th>
                <td className="num">{fmtNum(n, 0)}</td>
                {dsr ? <td className="num">{fmtNum(d, 0)}</td> : null}
                {dsr ? <td className="num">{n && d !== null ? `${Math.round((d / n) * 100)}%` : "—"}</td> : null}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Total</th>
            <td className="num">{fmtNum(total(rows), 0)}</td>
            {dsr ? <td className="num">{fmtNum(total(dsr), 0)}</td> : null}
            {dsr ? <td className="num">{total(rows) ? `${Math.round((total(dsr) / total(rows)) * 100)}%` : "—"}</td> : null}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

const TRACK_LABEL: Record<string, string> = {
  hc_p_lgb: "Named released configuration · HC+P LightGBM",
  hc_lgb: "Handcrafted-only LightGBM (Sabūt track)",
  radar_rule: "Simple radar-rule baseline",
};

/** Published reference beside the reproduced tracks, all on the same held-out test split. */
function TrackComparison({ report }: { report: Record<string, Json> }) {
  const comparison = report.comparison_on_test as Record<string, Json>;
  const paper = isObj(report.paper) ? report.paper : null;
  const publishedScore = typeof paper?.published_weighted_f1 === "number" ? fmtVal(paper.published_weighted_f1) : "≈ 0.80";
  const publishedText = typeof paper?.published_configuration === "string" ? paper.published_configuration : null;
  const tracks = Array.isArray(report.tracks) ? report.tracks.filter(isObj) : [];
  const trackInfo = (name: string) => tracks.find((t) => t.name === name);
  return (
    <>
      <div className="published-ref">
        <span className="eyebrow">Published (paper)</span>
        <strong className="big">{publishedScore} weighted F1</strong>
        <p className="small">
          {publishedText ?? "Published sowing result for specific feature combinations."}
          {paper && typeof paper.url === "string" ? (
            <>
              {" "}
              <span className="mono">{String(paper.arxiv ?? paper.url)}</span>
            </>
          ) : null}
        </p>
      </div>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Benchmark track results">
        <table aria-label="Ricemapper rerun metrics on the held-out test set">
          <thead>
            <tr>
              <th>Reproduced on the public release (test split)</th>
              <th className="num">Weighted F1</th>
              <th className="num">DSR precision</th>
              <th className="num">DSR recall</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(comparison).map(([name, m]) => {
              if (!isObj(m)) return null;
              const info = trackInfo(name);
              return (
                <tr key={name} className={name === "hc_lgb" ? "row-sabut" : ""}>
                  <td>
                    <strong>{TRACK_LABEL[name] ?? name.replaceAll("_", " ")}</strong>
                    {info && typeof info.description === "string" ? (
                      <div className="muted small">{info.description}</div>
                    ) : null}
                  </td>
                  <td className="num">{fmtVal(m.weighted_f1)}</td>
                  <td className="num">{fmtVal(m.dsr_precision)}</td>
                  <td className="num">{fmtVal(m.dsr_recall)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {tracks.length ? (
        <details className="report-raw">
          <summary>Per-track detail: features, confusion matrices, hyperparameters</summary>
          <JsonTree value={tracks} />
        </details>
      ) : null}
    </>
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
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Visit replay results">
        <table aria-label="Simulated outcomes at the same visit budget">
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
        <h2>Same-budget replay</h2>
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

const EXTRACTION_PAGE = 12;

type RealRecord = { claim: ClaimDetail; ev: EvidenceRecord };

function matchesRecord({ claim }: RealRecord, q: string): boolean {
  const hay = [claim.claim_id, claim.claimed_method, statusLabel(claim.status)].join(" ").toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((t) => hay.includes(t));
}

/**
 * One searchable list of every real extraction, with the full chart and
 * provenance for a single selected claim, so 250+ plots stay readable.
 */
function RealExtraction({ records }: { records: RealRecord[] }) {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(EXTRACTION_PAGE);
  const [picked, setPicked] = useState<string | null>(null);

  if (!records.length) {
    return (
      <section className="panel">
        <div className="panel-head">
          <h2>Real Sentinel-1 extraction</h2>
          <Tag>Pending</Tag>
        </div>
        <p className="muted">
          No real georeferenced extraction is loaded in the current workspace yet. When demo/evidence.json is present, its
          claims appear here with scene IDs and processing provenance.
        </p>
      </section>
    );
  }

  // Claims that need action come first, matching the officer queue.
  const ordered = [...records].sort(
    (a, b) =>
      Number(a.claim.status === "ready_for_desk_review") - Number(b.claim.status === "ready_for_desk_review") ||
      a.claim.claim_id.localeCompare(b.claim.claim_id, undefined, { numeric: true }),
  );
  const q = query.trim();
  const hits = q ? ordered.filter((r) => matchesRecord(r, q)) : ordered;
  const shown = hits.slice(0, limit);
  const current =
    records.find((r) => r.claim.claim_id === picked) ?? records.find((r) => r.claim.claim_id === "A") ?? ordered[0];
  const { claim, ev } = current;

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Real Sentinel-1 extraction</h2>
        <SourceTag kind={ev.source_kind} detail={<span className="mono">{ev.processing_version}</span>} />
        <span className="muted small">{records.length} claims</span>
      </div>

      <div className="extract-picker">
        <div className="queue-search">
          <input
            type="search"
            value={query}
            placeholder="Search claim ID, method or status"
            aria-label="Search extractions"
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(EXTRACTION_PAGE);
            }}
          />
        </div>
        {hits.length ? (
          <ul className="extract-list" aria-label="Claims with real extraction">
            {shown.map(({ claim: c, ev: e }) => (
              <li key={`${c.claim_id}-${e.processing_version}`}>
                <button
                  className="extract-chip"
                  aria-pressed={c.claim_id === claim.claim_id}
                  onClick={() => setPicked(c.claim_id)}
                  title={statusLabel(c.status)}
                >
                  <i className={`dot dot-${c.status}`} aria-hidden />
                  <strong>{c.claim_id}</strong>
                  <span className="muted">
                    {c.claimed_method} · {e.usable_count}/{e.observations?.length ?? 0}
                  </span>
                </button>
              </li>
            ))}
            {hits.length > shown.length ? (
              <li>
                <button className="extract-chip extract-more" onClick={() => setLimit((n) => n + EXTRACTION_PAGE * 3)}>
                  +{hits.length - shown.length} more
                </button>
              </li>
            ) : null}
          </ul>
        ) : (
          <p className="muted small">No claims match “{q}”.</p>
        )}
        <p className="muted small extract-legend">Usable / total acquisitions shown after the method.</p>
      </div>

      <div className="extract-detail">
        <div className="panel-head">
          <h3>Claim {claim.claim_id}</h3>
          <span className="muted small">{statusLabel(claim.status)}</span>
          <a className="link-btn" href={`#/officer/${encodeURIComponent(claim.claim_id)}`}>
            Open claim {claim.claim_id} in workspace
          </a>
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
        <AcquisitionTable evidence={ev} harvestDate={claim.reported_harvest_date} />
        {claim.reported_harvest_date ? (
          <p className="muted small">Applicant-reported harvest date on this fictional claim: {fmtDate(claim.reported_harvest_date)}.</p>
        ) : null}
      </div>
    </section>
  );
}

export function ResponsibleAI({ compact }: { compact?: boolean }) {
  return (
    <section className={`panel rai ${compact ? "rai-compact" : ""}`}>
      <h2>Responsible AI</h2>
      <ul>
        <li>
          <strong>Officer control.</strong> Sabūt recommends and ranks; Meena records every decision with a reason and can
          override. Approval, rejection and payment stay outside the app.
        </li>
        <li>
          <strong>Farmer recourse.</strong> Plain-language status and next step in Hindi, Punjabi, and English, with a correction
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

export function ResultsView({ claims }: { claims: ClaimDetail[] }) {
  const [data, setData] = useState<BenchmarkResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
      <header className="results-head">
        <div>
          <h1>Evidence and Results</h1>
          <p className="muted">
            Review real radar extractions, the Ricemapper benchmark rerun and a labeled simulation of visit allocation.
            Microsoft’s Ricemapper is the classification foundation.
          </p>
        </div>
        <button className="btn" onClick={() => void load()} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh reports"}
        </button>
      </header>
      <nav className="report-nav" aria-label="On this page">
        <a href="#/results/extraction">Radar extraction</a>
        <a href="#/results/benchmark">Benchmark</a>
        <a href="#/results/replay">Visit replay</a>
        <a href="#/results/responsible-ai">Responsible AI</a>
      </nav>

      <div className="result-group" id="/results/extraction" tabIndex={-1}>
        <RealExtraction records={real} />
      </div>

      {error ? (
        <div className="panel err-panel" role="alert">
          Could not load reports: {error}
        </div>
      ) : null}
      <div id="/results/benchmark" tabIndex={-1} aria-busy={loading}>
        {!data?.benchmark ? (
          <section className="panel pending">
            <div className="panel-head">
              <h2>Ricemapper benchmark</h2>
              <Tag>{loading ? "Loading…" : error ? "Unavailable" : "Pending"}</Tag>
            </div>
            <p className="muted">
              {loading ? "Loading the benchmark report…" : error ? "Use Refresh reports to try again." : data?.message ?? "reports/benchmark.json is not available yet."}
            </p>
          </section>
        ) : null}
        {data?.benchmark ? <BenchmarkPanel report={data.benchmark} /> : null}
      </div>
      <div id="/results/replay" tabIndex={-1} aria-busy={loading}>
        {!data?.replay ? (
          <section className="panel pending">
            <div className="panel-head">
              <h2>Same-budget replay</h2>
              <Tag>{loading ? "Loading…" : error ? "Unavailable" : "Pending"}</Tag>
            </div>
            <p className="muted">
              {loading ? "Loading the replay report…" : error ? "Use Refresh reports to try again." : "reports/replay.json is not available yet. It will compare the queue policy with random and score-only selection under the same budget, using simulated inspection outcomes."}
            </p>
          </section>
        ) : null}
        {data?.replay ? <ReplayPanel report={data.replay} /> : null}
      </div>
      <div id="/results/responsible-ai" tabIndex={-1}>
        <ResponsibleAI />
      </div>
    </div>
  );
}
