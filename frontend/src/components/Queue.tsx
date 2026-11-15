import type { QueueItem } from "../api/types";
import { fmtNum } from "../format";
import { actionLabel } from "../i18n/labels";
import { StatusPill } from "./Badges";

interface QueueProps {
  items: QueueItem[];
  selectedId: string | null;
  compareIds: string[];
  justAllocated: string[];
  loading: boolean;
  onSelect: (id: string) => void;
  onToggleCompare: (id: string) => void;
}

export function Queue({ items, selectedId, compareIds, justAllocated, loading, onSelect, onToggleCompare }: QueueProps) {
  if (!items.length) {
    return <div className="queue-empty">{loading ? "Loading queue…" : "No claims yet. Load the demo batch or upload GeoJSON."}</div>;
  }
  return (
    <ol className={`queue ${loading ? "is-loading" : ""}`} aria-label="Claim queue in server order" aria-busy={loading}>
      {items.map((it) => {
        const sel = it.claim_id === selectedId;
        const cmp = compareIds.includes(it.claim_id);
        const fresh = justAllocated.includes(it.claim_id);
        return (
          <li
            key={it.claim_id}
            className={`q-item ${sel ? "sel" : ""} ${it.in_visit_budget ? "in-budget" : ""} ${fresh ? "fresh" : ""}`}
          >
            <button className="q-main" onClick={() => onSelect(it.claim_id)} aria-current={sel}>
              <span className="q-top">
                <span className="q-id">{it.claim_id}</span>
                <StatusPill status={it.status} size="sm" />
              </span>
              <span className="q-next">
                {it.in_visit_budget ? <span className="visit-badge">Visit #{it.rank}</span> : null}
                {actionLabel(it.next_action)}
              </span>
              <span className="q-meta">
                {it.claimed_method} · {it.claimed_acres !== null ? `${fmtNum(it.claimed_acres)} ac` : "acreage not stated"}
                {it.rank !== null ? ` · rank ${it.rank}` : ""}
                {it.visit_priority !== null ? ` · index ${fmtNum(it.visit_priority, 0)}` : ""}
              </span>
            </button>
            <label className={`q-compare ${cmp ? "on" : ""}`} title="Add to side-by-side comparison">
              <input type="checkbox" checked={cmp} onChange={() => onToggleCompare(it.claim_id)} />
              <span className="sr-only">Compare {it.claim_id}</span>
              <span aria-hidden>⇆</span>
            </label>
          </li>
        );
      })}
    </ol>
  );
}

interface BudgetProps {
  budget: number;
  items: QueueItem[];
  loading: boolean;
  onChange: (b: number) => void;
}

/** Visit budget control. Allocation comes from the server's `in_visit_budget`. */
export function BudgetControl({ budget, items, loading, onChange }: BudgetProps) {
  const ranked = items.filter((i) => i.rank !== null);
  const allocated = items.filter((i) => i.in_visit_budget).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  const max = Math.max(5, ranked.length + 1);
  return (
    <section className="budget" aria-label="Visit budget">
      <div className="budget-row">
        <div>
          <span className="eyebrow">Field visits today</span>
          <span className="budget-hint">{loading ? "Updating…" : `${ranked.length} claim${ranked.length === 1 ? "" : "s"} ranked for a visit`}</span>
        </div>
        <div className="budget-stepper">
          <button className="btn-step" onClick={() => onChange(Math.max(0, budget - 1))} disabled={budget <= 0} aria-label="Decrease visit budget">
            −
          </button>
          <output className="budget-value" aria-live="polite">
            {budget}
          </output>
          <button className="btn-step" onClick={() => onChange(Math.min(max, budget + 1))} disabled={budget >= max} aria-label="Increase visit budget">
            +
          </button>
        </div>
      </div>
      <div className="budget-alloc" aria-live="polite">
        {budget === 0 ? (
          <span className="alloc-zero">Budget 0 — dry run, no visits allocated.</span>
        ) : allocated.length ? (
          allocated.map((a) => (
            <span key={a.claim_id} className="alloc-chip">
              Visit #{a.rank} → Claim {a.claim_id}
            </span>
          ))
        ) : (
          <span className="alloc-zero">No visit-eligible claims to allocate.</span>
        )}
      </div>
    </section>
  );
}
