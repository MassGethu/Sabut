import type { QueueItem } from "../api/types";
import { fmtNum } from "../format";
import { useState } from "react";
import { actionLabel, statusLabel } from "../i18n/labels";
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

const DESK_PAGE = 40;

function matches(it: QueueItem, q: string): boolean {
  if (!q) return true;
  const hay = [it.claim_id, it.claimed_method, statusLabel(it.status), actionLabel(it.next_action)].join(" ").toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => hay.includes(term));
}

export function Queue({ items, selectedId, compareIds, justAllocated, loading, onSelect, onToggleCompare }: QueueProps) {
  const [query, setQuery] = useState("");
  const [deskOpen, setDeskOpen] = useState(false);
  const [deskLimit, setDeskLimit] = useState(DESK_PAGE);
  if (!items.length) {
    return <div className="queue-empty">{loading ? "Loading queue…" : "No claims yet. Load the demo batch or upload GeoJSON."}</div>;
  }
  const q = query.trim();
  const shown = items.filter((it) => matches(it, q));
  const action = shown.filter((it) => it.status !== "ready_for_desk_review");
  const desk = shown.filter((it) => it.status === "ready_for_desk_review");
  // A selected desk claim (e.g. from the map) stays visible even when the group is folded.
  const deskVisible = deskOpen || Boolean(q);
  const pinned = !deskVisible ? desk.filter((it) => it.claim_id === selectedId || compareIds.includes(it.claim_id)) : [];

  const row = (it: QueueItem) => (
    <QueueRow
      key={it.claim_id}
      it={it}
      compact={it.status === "ready_for_desk_review"}
      selected={it.claim_id === selectedId}
      compared={compareIds.includes(it.claim_id)}
      fresh={justAllocated.includes(it.claim_id)}
      onSelect={onSelect}
      onToggleCompare={onToggleCompare}
    />
  );

  return (
    <div className={`queue-wrap ${loading ? "is-loading" : ""}`} aria-busy={loading}>
      <label className="queue-search">
        <span className="sr-only">Search claims</span>
        <input
          type="search"
          value={query}
          placeholder="Search claim ID, status or action"
          onChange={(e) => {
            setQuery(e.target.value);
            setDeskLimit(DESK_PAGE);
          }}
        />
      </label>
      {q && !shown.length ? <div className="queue-empty">No claims match “{q}”.</div> : null}

      {action.length ? (
        <section className="queue-group" aria-label="Claims needing action">
          <h2 className="queue-group-head">
            Needs action <span className="queue-count">{action.length}</span>
          </h2>
          <ol className="queue">{action.map(row)}</ol>
        </section>
      ) : null}

      {desk.length ? (
        <section className="queue-group" aria-label="Claims ready for desk review">
          <button className="queue-group-head queue-toggle" aria-expanded={deskVisible} onClick={() => setDeskOpen((o) => !o)} disabled={Boolean(q)}>
            <span aria-hidden>{deskVisible ? "▾" : "▸"}</span> Ready for desk review <span className="queue-count">{desk.length}</span>
          </button>
          {deskVisible ? (
            <>
              <ol className="queue queue-compact">{desk.slice(0, deskLimit).map(row)}</ol>
              {desk.length > deskLimit ? (
                <button className="link-btn queue-more" onClick={() => setDeskLimit((n) => n + DESK_PAGE)}>
                  Show {Math.min(DESK_PAGE, desk.length - deskLimit)} more of {desk.length - deskLimit}
                </button>
              ) : null}
            </>
          ) : pinned.length ? (
            <ol className="queue queue-compact">{pinned.map(row)}</ol>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

interface RowProps {
  it: QueueItem;
  compact: boolean;
  selected: boolean;
  compared: boolean;
  fresh: boolean;
  onSelect: (id: string) => void;
  onToggleCompare: (id: string) => void;
}

function QueueRow({ it, compact, selected, compared, fresh, onSelect, onToggleCompare }: RowProps) {
  const acres = it.claimed_acres !== null ? `${fmtNum(it.claimed_acres)} ac` : "acreage not stated";
  return (
    <li className={`q-item ${compact ? "q-compact" : ""} ${selected ? "sel" : ""} ${it.in_visit_budget ? "in-budget" : ""} ${fresh ? "fresh" : ""}`}>
      <button className="q-main" onClick={() => onSelect(it.claim_id)} aria-current={selected}>
        {compact ? (
          <span className="q-top">
            <span className="q-id">{it.claim_id}</span>
            <span className="q-meta">
              {it.claimed_method} · {acres}
            </span>
          </span>
        ) : (
          <>
            <span className="q-top">
              <span className="q-id">{it.claim_id}</span>
              <StatusPill status={it.status} size="sm" />
            </span>
            <span className="q-next">
              {it.in_visit_budget ? <span className="visit-badge">Visit #{it.rank}</span> : null}
              {actionLabel(it.next_action)}
            </span>
            <span className="q-meta">
              {it.claimed_method} · {acres}
              {it.rank !== null ? ` · rank ${it.rank}` : ""}
              {it.visit_priority !== null ? ` · index ${fmtNum(it.visit_priority, 0)}` : ""}
            </span>
          </>
        )}
      </button>
      <label className={`q-compare ${compared ? "on" : ""}`} title="Add to side-by-side comparison">
        <input type="checkbox" checked={compared} onChange={() => onToggleCompare(it.claim_id)} />
        <span className="sr-only">Compare {it.claim_id}</span>
        <span aria-hidden>⇆</span>
      </label>
    </li>
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
