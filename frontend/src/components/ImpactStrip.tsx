import type { QueueItem } from "../api/types";
import { fmtNum } from "../format";

const ACTION_SHORT: Record<string, [string, string]> = {
  request_field_visit: ["field visit", "field visits"],
  request_records: ["records request", "records requests"],
  request_boundary_correction: ["boundary fix", "boundary fixes"],
};

/**
 * Headline numbers for the loaded batch, all counted from the queue the
 * server returned: nothing here is estimated or recomputed.
 */
export function ImpactStrip({ items }: { items: QueueItem[] }) {
  if (!items.length) return null;
  const acres = items.reduce((sum, i) => sum + (i.claimed_acres ?? 0), 0);
  const desk = items.filter((i) => i.next_action === "desk_review").length;
  const action = items.length - desk;
  const byAction = Object.entries(ACTION_SHORT)
    .map(([key, [one, many]]) => {
      const n = items.filter((i) => i.next_action === key).length;
      return n ? `${n} ${n === 1 ? one : many}` : null;
    })
    .filter(Boolean)
    .join(" · ");
  const deskPct = Math.round((desk / items.length) * 100);

  return (
    <section className="impact" aria-label="Batch summary">
      <div className="impact-stat">
        <span className="impact-num">{items.length}</span>
        <span className="impact-label">claims screened · {fmtNum(acres, 0)} ac</span>
      </div>
      <div className="impact-stat impact-good">
        <span className="impact-num">{deskPct}%</span>
        <span className="impact-label">{desk} cleared for desk review, no visit needed</span>
      </div>
      <div className="impact-stat impact-act">
        <span className="impact-num">{action}</span>
        <span className="impact-label">need action{byAction ? ` · ${byAction}` : ""}</span>
      </div>
    </section>
  );
}
