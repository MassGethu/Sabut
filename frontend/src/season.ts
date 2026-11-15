/**
 * Season view: each plot's VV backscatter at a chosen date, from its decision
 * evidence. Flooded (puddled, transplanted) fields read low; a growing
 * direct-seeded crop rises steadily. Gaps in usable observations stay visible
 * as "no data" instead of being smoothed over.
 */

export interface SeasonPoint {
  t: number; // epoch ms
  vv: number; // dB
}

const DAY_MS = 86_400_000;
/** Interpolate only between usable dates at most this far apart (one missed 12-day revisit is tolerated). */
const MAX_SPAN_DAYS = 25;
/** Otherwise hold the nearest usable value only this close to it. */
const HOLD_DAYS = 6;

/** VV (dB) at time t, or null when no usable observation is close enough. */
export function vvAt(points: SeasonPoint[], t: number): number | null {
  if (!points.length) return null;
  let i = points.findIndex((p) => p.t >= t);
  if (i === -1) i = points.length;
  const before = points[i - 1];
  const after = points[i];
  if (before && after && after.t - before.t <= MAX_SPAN_DAYS * DAY_MS) {
    const f = after.t === before.t ? 0 : (t - before.t) / (after.t - before.t);
    return before.vv + f * (after.vv - before.vv);
  }
  const near = [before, after]
    .filter((p): p is SeasonPoint => !!p)
    .sort((a, b) => Math.abs(a.t - t) - Math.abs(b.t - t))[0];
  return near && Math.abs(near.t - t) <= HOLD_DAYS * DAY_MS ? near.vv : null;
}

/** Colour stops: standing water (low VV) → bare/early → growing crop (high VV). */
export const SEASON_STOPS: [number, [number, number, number]][] = [
  [-16, [27, 79, 138]],
  [-12.5, [214, 219, 196]],
  [-8, [47, 125, 79]],
];
export const NO_DATA_COLOR = "#a9a9a9";

export function seasonColor(vv: number | null): string {
  if (vv === null) return NO_DATA_COLOR;
  const stops = SEASON_STOPS;
  if (vv <= stops[0][0]) return rgb(stops[0][1]);
  for (let i = 1; i < stops.length; i++) {
    const [v1, c1] = stops[i];
    const [v0, c0] = stops[i - 1];
    if (vv <= v1) {
      const f = (vv - v0) / (v1 - v0);
      return rgb([0, 1, 2].map((k) => c0[k] + f * (c1[k] - c0[k])) as [number, number, number]);
    }
  }
  return rgb(stops[stops.length - 1][1]);
}

export function seasonGradientCss(): string {
  const lo = SEASON_STOPS[0][0];
  const hi = SEASON_STOPS[SEASON_STOPS.length - 1][0];
  const parts = SEASON_STOPS.map(([v, c]) => `${rgb(c)} ${Math.round(((v - lo) / (hi - lo)) * 100)}%`);
  return `linear-gradient(90deg, ${parts.join(", ")})`;
}

function rgb([r, g, b]: [number, number, number]): string {
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}
