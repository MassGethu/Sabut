import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, api } from "./api/client";
import type { ClaimDetail, ImportResponse, Language, QueueItem, ReviewReceipt } from "./api/types";
import { ActionPanel } from "./components/ActionPanel";
import { ClaimEvidence } from "./components/ClaimEvidence";
import { Compare } from "./components/Compare";
import { ImportBar } from "./components/ImportBar";
import { PlotMap, type MapPlot } from "./components/PlotMap";
import { BudgetControl, Queue } from "./components/Queue";
import { FarmerPreview } from "./views/FarmerPreview";
import { ResultsView } from "./views/ResultsView";

type View = "officer" | "farmer" | "results";

function readHash(): { view: View; claim: string | null } {
  const [, view, claim] = window.location.hash.split("/");
  const v: View = view === "farmer" || view === "results" ? view : "officer";
  try {
    return { view: v, claim: v !== "results" && claim ? decodeURIComponent(claim) : null };
  } catch {
    return { view: v, claim: null };
  }
}

function viewHref(view: View, claim?: string | null) {
  return `#/${view}${claim ? `/${encodeURIComponent(claim)}` : ""}`;
}

function focusSection(id: string) {
  const section = document.getElementById(id);
  section?.focus({ preventScroll: true });
  section?.scrollIntoView({ block: "start" });
}

function storedLanguage(): Language {
  try {
    const l = localStorage.getItem("sabut.lang");
    return l === "pa" || l === "en" ? l : "hi";
  } catch {
    return "hi";
  }
}

export default function App() {
  const [view, setView] = useState<View>(() => readHash().view);
  const [budget, setBudget] = useState(0);
  const [officerName, setOfficerName] = useState("Meena");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [details, setDetails] = useState<Record<string, ClaimDetail>>({});
  const [selectedId, setSelectedId] = useState<string | null>(() => readHash().view === "officer" ? readHash().claim : null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [justAllocated, setJustAllocated] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<"checking" | "ok" | "down">("checking");
  const [language, setLanguage] = useState<Language>(storedLanguage);
  const [farmerClaim, setFarmerClaim] = useState<string | null>(() => readHash().view === "farmer" ? readHash().claim : null);
  const [highlightReceipt, setHighlightReceipt] = useState<{ claim: string; id: string | number } | null>(null);
  const previousView = useRef(view);
  const pendingReceipt = useRef(false);
  const comparisonTrigger = useRef<HTMLElement | null>(null);
  const seq = useRef(0);
  const prevQueue = useRef<QueueItem[]>([]);

  // hash routing
  useEffect(() => {
    const on = () => {
      const h = readHash();
      setView(h.view);
      if (h.view === "results") {
        const id = window.location.hash.slice(1);
        window.requestAnimationFrame(() => {
          if (id === "/results") window.scrollTo(0, 0);
          else focusSection(id);
        });
      }
      if (h.claim) {
        if (h.view === "farmer") setFarmerClaim(h.claim);
        else setSelectedId(h.claim);
      }
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  useEffect(() => {
    const section = view === "results" && window.location.hash.slice(1).startsWith("/results/")
      ? window.location.hash.slice(1)
      : "main-content";
    if (section !== "main-content") focusSection(section);
    else if (view !== previousView.current && !pendingReceipt.current) {
      window.scrollTo(0, 0);
      document.getElementById(section)?.focus({ preventScroll: true });
    }
    previousView.current = view;
  }, [view]);

  useEffect(() => {
    try {
      localStorage.setItem("sabut.lang", language);
    } catch {
      /* storage unavailable: language still applies for this session */
    }
  }, [language]);

  const refresh = useCallback(async (b: number) => {
    const my = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const q = await api.queue(b);
      if (my !== seq.current) return;
      const before = new Set(prevQueue.current.filter((i) => i.in_visit_budget).map((i) => i.claim_id));
      const entered = q.items.filter((i) => i.in_visit_budget && !before.has(i.claim_id)).map((i) => i.claim_id);
      prevQueue.current = q.items;
      setQueue(q.items);
      if (entered.length) {
        setJustAllocated(entered);
        window.setTimeout(() => setJustAllocated([]), 2600);
      }
      const ds = await Promise.all(q.items.map((i) => api.claim(i.claim_id, b)));
      if (my !== seq.current) return;
      setDetails(Object.fromEntries(ds.map((d) => [d.claim_id, d])));
      // Keep a deep-linked selection while the workspace is still empty.
      setSelectedId((cur) =>
        cur && (!q.items.length || q.items.some((i) => i.claim_id === cur)) ? cur : q.items[0]?.claim_id ?? null,
      );
    } catch (err) {
      if (my !== seq.current) return;
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    api
      .health()
      .then(() => setHealth("ok"))
      .catch(() => setHealth("down"));
    void refresh(0);
  }, [refresh]);

  function changeBudget(b: number) {
    setBudget(b);
    void refresh(b);
  }

  async function reloadClaim(id: string) {
    try {
      const d = await api.claim(id, budget);
      setDetails((cur) => ({ ...cur, [id]: d }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  }

  function onImported(res: ImportResponse) {
    if (res.imported_ids.length) setSelectedId((cur) => cur ?? res.imported_ids[0]);
    void refresh(budget);
  }

  function select(id: string, additive = false, fromQueue = false) {
    if (additive) {
      toggleCompare(id);
      return;
    }
    setSelectedId(id);
    if (view === "officer") {
      const hash = viewHref("officer", id);
      if (window.location.hash !== hash) history.replaceState(null, "", hash);
      if (fromQueue && window.matchMedia("(max-width: 980px)").matches) {
        window.requestAnimationFrame(() => focusSection("claim-summary"));
      }
    }
  }

  function toggleCompare(id: string) {
    setCompareIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id].slice(-2)));
  }

  const plots: MapPlot[] = useMemo(
    () =>
      queue
        .filter((i) => details[i.claim_id]?.geometry)
        .map((i) => ({
          id: i.claim_id,
          geometry: details[i.claim_id].geometry,
          status: i.status,
          inBudget: i.in_visit_budget,
          rank: i.rank,
          acres: i.claimed_acres,
          nextAction: i.next_action,
        })),
    [queue, details],
  );

  const selected = selectedId ? details[selectedId] : null;
  const compareClaims = compareIds.map((id) => details[id]).filter(Boolean) as ClaimDetail[];
  const allClaims = queue.map((i) => details[i.claim_id]).filter(Boolean) as ClaimDetail[];
  const hasAB = details.A && details.B;

  useEffect(() => {
    if (view !== "officer" || !pendingReceipt.current || !highlightReceipt) return;
    const entry = document.querySelector<HTMLElement>(".tl-new");
    if (entry) {
      pendingReceipt.current = false;
      entry.focus({ preventScroll: true });
      entry.scrollIntoView({ block: "center" });
    }
  }, [view, selected, highlightReceipt]);

  function showComparison(trigger: HTMLElement) {
    comparisonTrigger.current = trigger;
    window.requestAnimationFrame(() => focusSection("claim-comparison"));
  }

  return (
    <div className="app">
      <a className="skip-link" href="#main-content" onClick={(event) => {
        event.preventDefault();
        focusSection("main-content");
      }}>
        Skip to main content
      </a>
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>
            <svg viewBox="0 0 32 32" width="28" height="28">
              <rect width="32" height="32" rx="7" fill="currentColor" />
              <path d="M8 22c6-1 10-6 12-14 1 7-2 13-8 15" fill="none" stroke="#e8d27a" strokeWidth="2.4" strokeLinecap="round" />
              <circle cx="22" cy="22" r="3" fill="#e8d27a" />
            </svg>
          </span>
          <div>
            <strong>Sabūt</strong>
            <span className="tagline">See which rice claims need a field visit.</span>
          </div>
        </div>
        <nav className="tabs" aria-label="Views">
          <a href={viewHref("officer", selectedId)} aria-current={view === "officer" ? "page" : undefined}>
            Officer workspace
          </a>
          <a href={viewHref("farmer", farmerClaim ?? selectedId)} aria-current={view === "farmer" ? "page" : undefined}>
            Farmer preview
          </a>
          <a href={viewHref("results")} aria-current={view === "results" ? "page" : undefined}>
            Evidence &amp; Results
          </a>
        </nav>
        <div className="status-area">
          <span className="persona">Meena · ADO, Haryana (fictional)</span>
          {api.mode === "fixtures" ? (
            <span className="mode mode-fixture" title="Contract-shaped sample payloads, not live evidence">
              Fixture mode
            </span>
          ) : (
            <span className={`mode mode-${health}`} title="Local FastAPI service">
              API {health === "ok" ? "connected" : health === "down" ? "unreachable" : "…"}
            </span>
          )}
        </div>
      </header>

      {error ? (
        <div className="banner-error" role="alert">
          {error}{" "}
          <button className="btn btn-ghost btn-xs" onClick={() => void refresh(budget)}>
            Retry
          </button>
        </div>
      ) : null}

      {view === "officer" ? (
        <main className="officer" id="main-content" tabIndex={-1} aria-label="Officer workspace">
          <aside className="sidebar">
            <ImportBar onImported={onImported} />
            <BudgetControl budget={budget} items={queue} loading={loading} onChange={changeBudget} />
            <div className="queue-head">
              <h1 id="claim-queue" tabIndex={-1}>Claim queue</h1>
              <span className="muted small">{queue.length} claim{queue.length === 1 ? "" : "s"}</span>
              {compareClaims.length === 2 ? (
                <button className="link-btn" onClick={(event) => showComparison(event.currentTarget)}>View comparison</button>
              ) : selected ? (
                <button className="link-btn narrow-shortcut" onClick={() => focusSection("claim-summary")}>
                  View claim {selected.claim_id}
                </button>
              ) : null}
            </div>
            <Queue
              items={queue}
              selectedId={selectedId}
              compareIds={compareIds}
              justAllocated={justAllocated}
              loading={loading}
              onSelect={(id) => select(id, false, true)}
              onToggleCompare={toggleCompare}
            />
          </aside>

          <section className="workspace">
            <PlotMap
              plots={plots}
              selectedId={selectedId}
              compareIds={compareIds}
              onSelect={select}
              tools={
                hasAB && compareClaims.length < 2 ? (
                  <button className="map-btn map-btn-primary" onClick={(event) => {
                    setCompareIds(["A", "B"]);
                    showComparison(event.currentTarget);
                  }}>
                    Compare neighbours
                  </button>
                ) : null
              }
            />

            {compareClaims.length >= 2 ? (
              <Compare
                claims={compareClaims}
                onClose={() => {
                  setCompareIds([]);
                  const trigger = comparisonTrigger.current;
                  comparisonTrigger.current = null;
                  window.requestAnimationFrame(() => {
                    if (!trigger || trigger.closest(".queue-head")) {
                      focusSection("claim-queue");
                    } else {
                      document.querySelector<HTMLElement>(".map-btn-primary")?.focus();
                    }
                  });
                }}
                onFocus={(id) => {
                  select(id);
                  window.requestAnimationFrame(() => focusSection("claim-summary"));
                }}
              />
            ) : null}

            {selected ? (
              <div className="detail-grid">
                <ClaimEvidence detail={selected} summaryActions={
                  <div className="claim-shortcuts narrow-shortcut">
                    <button className="link-btn" onClick={() => focusSection("claim-queue")}>Back to queue</button>
                    <button className="link-btn" onClick={() => focusSection("action-h")}>Go to decision</button>
                  </div>
                } />
                <div className="detail-side">
                  <ActionPanel
                    key={selected.claim_id}
                    detail={selected}
                    budget={budget}
                    actor={officerName}
                    onActorChange={setOfficerName}
                    onSaved={() => void reloadClaim(selected.claim_id)}
                    highlightReceiptId={highlightReceipt?.claim === selected.claim_id ? highlightReceipt.id : null}
                  />
                  <div className="side-links">
                    <a className="btn btn-ghost btn-block" href={viewHref("farmer", selected.claim_id)}>
                      Preview farmer card for {selected.claim_id} →
                    </a>
                  </div>
                </div>
              </div>
            ) : queue.length ? (
              <p className="muted pad">Select a claim from the queue or the map.</p>
            ) : null}
          </section>
        </main>
      ) : null}

      {view === "farmer" ? (
        <main className="farmer-main" id="main-content" tabIndex={-1}>
          <FarmerPreview
            claims={allClaims}
            claimId={farmerClaim ?? selectedId}
            language={language}
            onLanguage={setLanguage}
            onClaim={(id) => {
              setFarmerClaim(id);
              history.replaceState(null, "", viewHref("farmer", id));
            }}
            onSubmitted={(claimId, receipt: ReviewReceipt) => {
              setHighlightReceipt({ claim: claimId, id: receipt.id });
              void reloadClaim(claimId);
            }}
            onOpenOfficer={(claimId, receiptId) => {
              setHighlightReceipt({ claim: claimId, id: receiptId });
              setSelectedId(claimId);
              pendingReceipt.current = true;
              window.location.hash = viewHref("officer", claimId);
            }}
          />
        </main>
      ) : null}

      {view === "results" ? (
        <main className="results-main" id="main-content" tabIndex={-1}>
          {queue.length ? (
            <ResultsView claims={allClaims} />
          ) : (
            <div className="results results-empty">
              <h1>Evidence and Results</h1>
              <p className="queue-empty">
                No claims loaded yet. Load the demo batch or upload GeoJSON in the{" "}
                <a href={viewHref("officer", null)}>Officer workspace</a> to see radar evidence, the benchmark and the visit replay.
              </p>
            </div>
          )}
        </main>
      ) : null}

      <footer className="foot">
        Sabūt · INNOVEX 2026 · PS 02 Smart Agriculture · Farmers, claims and Meena are fictional · Classification foundation:
        Microsoft Ricemapper · Simulated evidence is labeled wherever it appears.
      </footer>
    </div>
  );
}
