import type { EvidenceRecord, Observation } from "../api/types";
import { fmtDate, fmtNum, fmtPct, fmtUtc, utcMs } from "../format";

interface Props {
  evidence: EvidenceRecord;
  /** Applicant-reported harvest date (retrospective view). */
  harvestDate?: string | null;
  compact?: boolean;
  /** Shared y-domain so two plots can be compared on the same scale. */
  yDomain?: [number, number];
  title?: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function bandDomain(records: (EvidenceRecord | null | undefined)[]): [number, number] | undefined {
  const vals: number[] = [];
  for (const r of records) {
    for (const o of r?.observations ?? []) {
      if (!o.usable) continue;
      if (o.vv !== null && Number.isFinite(o.vv)) vals.push(o.vv);
      if (o.vh !== null && Number.isFinite(o.vh)) vals.push(o.vh);
    }
  }
  if (!vals.length) return undefined;
  const lo = Math.floor(Math.min(...vals) - 1);
  const hi = Math.ceil(Math.max(...vals) + 1);
  return [lo, hi];
}

function niceTicks(lo: number, hi: number, count = 5): number[] {
  const span = hi - lo;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6));
  return out;
}

export function SignalChart({ evidence, harvestDate, compact, yDomain, title }: Props) {
  const observations = [...(evidence.observations ?? [])].sort(
    (a, b) => Date.parse(a.acquired_at) - Date.parse(b.acquired_at),
  );
  const usable = observations.filter((o) => o.usable && (o.vv !== null || o.vh !== null));
  const unusable = observations.filter((o) => !o.usable || (o.vv === null && o.vh === null));
  const units = evidence.units || "units not stated";

  if (!observations.length) {
    return (
      <div className="chart-empty" role="status">
        <strong>No acquisitions in this record.</strong>
        <span>
          The cached evidence for {fmtDate(evidence.window?.start)} – {fmtDate(evidence.window?.end)} contains no
          Sentinel-1 observations, so there is nothing to chart.
        </span>
      </div>
    );
  }

  const W = 720;
  const H = compact ? 200 : 270;
  const m = { l: 54, r: 18, t: 22, b: 52 };
  const plotH = H - m.t - m.b;
  const laneY = H - m.b + 14; // lane for unusable acquisitions

  const t0 = utcMs(evidence.window.start);
  let t1 = utcMs(evidence.window.end) + 86_400_000 - 1;
  const harvestMs = harvestDate ? utcMs(harvestDate) : null;
  if (harvestMs && harvestMs > t1) t1 = harvestMs + 6 * 86_400_000;
  for (const o of observations) t1 = Math.max(t1, Date.parse(o.acquired_at));
  const x = (ms: number) => m.l + ((ms - t0) / (t1 - t0)) * (W - m.l - m.r);

  const [lo, hi] = yDomain ?? bandDomain([evidence]) ?? [-25, -5];
  const y = (v: number) => m.t + (1 - (v - lo) / (hi - lo)) * plotH;
  const yTicks = niceTicks(lo, hi, compact ? 4 : 5);

  const monthTicks: number[] = [];
  const start = new Date(t0);
  for (let d = Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1); d <= t1; ) {
    monthTicks.push(d);
    const dd = new Date(d);
    d = Date.UTC(dd.getUTCFullYear(), dd.getUTCMonth() + 1, 1);
  }

  const gaps = (evidence.gaps ?? []).map((g) => ({ ...g, s: utcMs(g.start), e: utcMs(g.end) }));
  const crossesGap = (a: Observation, b: Observation) => {
    const ta = Date.parse(a.acquired_at);
    const tb = Date.parse(b.acquired_at);
    const slack = 86_400_000;
    // Break the line when a recorded gap lies between two usable acquisitions.
    return gaps.some((g) => g.s >= ta - slack && g.e <= tb + slack);
  };

  function path(band: "vv" | "vh") {
    let d = "";
    let prev: Observation | null = null;
    for (const o of usable) {
      const v = o[band];
      if (v === null || !Number.isFinite(v)) {
        prev = null;
        continue;
      }
      const cmd = prev && !crossesGap(prev, o) ? "L" : "M";
      d += `${cmd}${x(Date.parse(o.acquired_at)).toFixed(1)},${y(v).toFixed(1)} `;
      prev = o;
    }
    return d;
  }

  const tip = (o: Observation) =>
    `${fmtUtc(o.acquired_at)}\nScene ${o.scene_id}\nVV ${fmtNum(o.vv)} ${units} · VH ${fmtNum(o.vh)} ${units}\nValid coverage ${fmtPct(o.valid_fraction)}` +
    (o.usable ? "" : `\nNot usable: ${o.reason ?? "no reason given"}`);

  const windowEndX = x(utcMs(evidence.window.end) + 86_400_000 - 1);

  return (
    <figure className={`chart ${compact ? "chart-compact" : ""}`}>
      {title ? <figcaption className="chart-title">{title}</figcaption> : null}
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`VV and VH backscatter in ${units} at actual acquisition dates`}>
        <defs>
          <pattern id="gap-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" className="gap-hatch-line" />
          </pattern>
        </defs>

        {/* gaps from the record (real intervals without a usable acquisition) */}
        {gaps.map((g, i) => (
          <g key={`gap-${i}`}>
            <rect x={x(g.s)} y={m.t} width={Math.max(2, x(g.e) - x(g.s))} height={plotH} className="gap-rect">
              <title>{`Gap ${g.start} → ${g.end}: ${g.reason}`}</title>
            </rect>
            {!compact && x(g.e) - x(g.s) > 50 ? (
              <text x={(x(g.s) + x(g.e)) / 2} y={m.t + 12} className="gap-label" textAnchor="middle">
                gap {Math.round((g.e - g.s) / 86_400_000)} d
              </text>
            ) : null}
          </g>
        ))}

        {/* after the window (retrospective view) */}
        {harvestMs && windowEndX < W - m.r ? (
          <rect x={windowEndX} y={m.t} width={W - m.r - windowEndX} height={plotH} className="after-window" />
        ) : null}

        {/* y grid */}
        {yTicks.map((v) => (
          <g key={`y${v}`}>
            <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} className="grid" />
            <text x={m.l - 8} y={y(v) + 4} textAnchor="end" className="axis-text">
              {v}
            </text>
          </g>
        ))}
        <text
          transform={`translate(14 ${m.t + plotH / 2}) rotate(-90)`}
          textAnchor="middle"
          className="axis-label"
        >
          Backscatter ({units})
        </text>

        {/* x axis: months */}
        <line x1={m.l} x2={W - m.r} y1={m.t + plotH} y2={m.t + plotH} className="axis" />
        {monthTicks.map((t) => (
          <g key={`m${t}`}>
            <line x1={x(t)} x2={x(t)} y1={m.t + plotH} y2={m.t + plotH + 4} className="axis" />
            <text x={x(t)} y={H - 8} textAnchor="middle" className="axis-text">
              {MONTHS[new Date(t).getUTCMonth()]} {new Date(t).getUTCFullYear()}
            </text>
          </g>
        ))}

        {/* window edges */}
        <line x1={x(t0)} x2={x(t0)} y1={m.t} y2={m.t + plotH} className="window-edge" />
        <line x1={windowEndX} x2={windowEndX} y1={m.t} y2={m.t + plotH} className="window-edge" />
        {!compact ? (
          <>
            <text x={x(t0) + 3} y={m.t - 8} className="edge-text">
              window {fmtDate(evidence.window.start)}
            </text>
            <text x={windowEndX - 3} y={m.t - 8} className="edge-text" textAnchor="end">
              {fmtDate(evidence.window.end)}
            </text>
          </>
        ) : null}

        {/* acquisition rug: every actual acquisition date */}
        {observations.map((o, i) => (
          <line
            key={`rug${i}`}
            x1={x(Date.parse(o.acquired_at))}
            x2={x(Date.parse(o.acquired_at))}
            y1={m.t + plotH}
            y2={m.t + plotH - 5}
            className={o.usable ? "rug" : "rug rug-bad"}
          />
        ))}

        <path d={path("vv")} className="line-vv" />
        <path d={path("vh")} className="line-vh" />

        {usable.map((o, i) => (
          <g key={`p${i}`}>
            {o.vv !== null ? (
              <circle cx={x(Date.parse(o.acquired_at))} cy={y(o.vv)} r={compact ? 3.2 : 4} className="pt-vv">
                <title>{tip(o)}</title>
              </circle>
            ) : null}
            {o.vh !== null ? (
              <rect
                x={x(Date.parse(o.acquired_at)) - (compact ? 3 : 3.6)}
                y={y(o.vh) - (compact ? 3 : 3.6)}
                width={compact ? 6 : 7.2}
                height={compact ? 6 : 7.2}
                className="pt-vh"
              >
                <title>{tip(o)}</title>
              </rect>
            ) : null}
          </g>
        ))}

        {/* unusable acquisitions sit in a lane under the axis */}
        {unusable.map((o, i) => {
          const cx = x(Date.parse(o.acquired_at));
          return (
            <g key={`u${i}`} className="pt-bad">
              <line x1={cx - 4} x2={cx + 4} y1={laneY - 4} y2={laneY + 4} />
              <line x1={cx - 4} x2={cx + 4} y1={laneY + 4} y2={laneY - 4} />
              <title>{tip(o)}</title>
            </g>
          );
        })}

        {harvestMs ? (
          <g>
            <line x1={x(harvestMs)} x2={x(harvestMs)} y1={m.t - 4} y2={m.t + plotH} className="harvest-line" />
            <text x={x(harvestMs) - 4} y={m.t + 12} textAnchor="end" className="harvest-text">
              Applicant-reported harvest {fmtDate(harvestDate)}
            </text>
          </g>
        ) : null}
      </svg>
      <div className="chart-legend">
        <span>
          <i className="lg-vv" /> VV ({units})
        </span>
        <span>
          <i className="lg-vh" /> VH ({units})
        </span>
        {unusable.length ? (
          <span>
            <i className="lg-bad">✕</i> unusable acquisition ({unusable.length})
          </span>
        ) : null}
        {gaps.length ? (
          <span>
            <i className="lg-gap" /> gap without usable date
          </span>
        ) : null}
        <span className="muted">
          {evidence.usable_count} usable of {observations.length} acquisitions · points at actual UTC acquisition dates
        </span>
      </div>
    </figure>
  );
}
