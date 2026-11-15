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
    return (
      <div className="queue-empty">
        {loading ? "Loading queue…" : "No claims yet. Load the demo batch or upload a GeoJSON file."}
      </div>
    );
  }
  return (
    <ol className={`queue ${loading ? "is-loading" : ""}`} aria-label="Claim queue in server order">
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
              <div className="q-row1">
                <span className="q-rank" title={it.rank !== null ? `Visit rank ${it.rank}` : "Not ranked for a visit"}>
                  {it.rank !== null ? `#${it.rank}` : "—"}
                </span>
                <span className="q-id">{it.claim_id}</span>
                <span className="q-method">{it.claimed_method}</span>
                <StatusPill status={it.status} size="sm" />
              </div>
              <div className="q-row2">
                <span>
                  → <strong>{actionLabel(it.next_action)}</strong>
                </span>
                {it.in_visit_budget ? <span className="visit-badge">In visit budget</span> : null}
              </div>
              <div className="q-row3 muted small">
                <span>{it.claimed_acres !== null ? `${fmtNum(it.claimed_acres)} ac` : "acreage not stated"}</span>
                <span>
                  {it.visit_priority !== null
                    ? `priority index ${fmtNum(it.visit_priority, 0)}`
                    : it.rank !== null
                      ? "ranked by ambiguity only"
                      : "unranked"}
                </span>
              </div>
            </button>
            <label className="q-compare" title="Add to side-by-side comparison">
              <input type="checkbox" checked={cmp} onChange={() => onToggleCompare(it.claim_id)} />
              <span>Compare</span>
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
  const ranked = items.filter((i) => i.rank !== null).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  const allocated = items.filter((i) => i.in_visit_budget).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  const max = Math.max(5, ranked.length + 1);
  return (
    <section className="budget" aria-label="Visit budget">
      <div className="budget-top">
        <div>
          <span className="eyebrow">Field visits available today</span>
          <div className="budget-stepper">
            <button className="btn btn-step" onClick={() => onChange(Math.max(0, budget - 1))} disabled={budget <= 0} aria-label="Decrease visit budget">
              −
            </button>
            <output className="budget-value" aria-live="polite">
              {budget}
            </output>
            <button className="btn btn-step" onClick={() => onChange(Math.min(max, budget + 1))} aria-label="Increase visit budget">
              +
            </button>
          </div>
        </div>
        <div className="budget-alloc" aria-live="polite">
          <span className="eyebrow">Visit allocation{loading ? " · updating…" : ""}</span>
          {budget === 0 ? (
            <p className="alloc-zero">
              <strong>Budget 0 — dry run.</strong> No visits allocated.{" "}
              {ranked.length ? `${ranked.length} claim${ranked.length === 1 ? " is" : "s are"} ranked for a visit.` : ""}
            </p>
          ) : allocated.length ? (
            <p className="alloc-list">
              {allocated.map((a) => (
                <span key={a.claim_id} className="alloc-chip">
                  Visit #{a.rank} → Claim {a.claim_id}
                </span>
              ))}
              {allocated.length < budget ? (
                <span className="muted small"> {budget - allocated.length} visit(s) unused — no further visit-eligible claims.</span>
              ) : null}
            </p>
          ) : (
            <p className="muted">No visit-eligible claims to allocate.</p>
          )}
        </div>
      </div>
      <p className="muted small">
        Ranks and allocation come from the server. The priority index is a ranking aid, not money or a probability.
      </p>
    </section>
  );
}
