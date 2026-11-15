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
import { ResponsibleAI, ResultsView } from "./views/ResultsView";

type View = "officer" | "farmer" | "results";

function readHash(): { view: View; claim: string | null } {
  const [, view, claim] = window.location.hash.split("/");
  const v: View = view === "farmer" || view === "results" ? view : "officer";
  return { view: v, claim: claim ? decodeURIComponent(claim) : null };
}

function storedLanguage(): Language {
  try {
    const l = localStorage.getItem("sabut.lang");
    return l === "pa" ? "pa" : "hi";
  } catch {
    return "hi";
  }
}

export default function App() {
  const [view, setView] = useState<View>(() => readHash().view);
  const [budget, setBudget] = useState(0);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [details, setDetails] = useState<Record<string, ClaimDetail>>({});
  const [selectedId, setSelectedId] = useState<string | null>(() => readHash().claim);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [justAllocated, setJustAllocated] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<"checking" | "ok" | "down">("checking");
  const [language, setLanguage] = useState<Language>(storedLanguage);
  const [farmerClaim, setFarmerClaim] = useState<string | null>(null);
  const [highlightReceipt, setHighlightReceipt] = useState<{ claim: string; id: string | number } | null>(null);
  const seq = useRef(0);
  const prevQueue = useRef<QueueItem[]>([]);

  // hash routing
  useEffect(() => {
    const on = () => {
      const h = readHash();
      setView(h.view);
      if (h.claim) {
        if (h.view === "farmer") setFarmerClaim(h.claim);
        else setSelectedId(h.claim);
      }
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  const go = useCallback((v: View, claim?: string | null) => {
    const hash = `#/${v}${claim ? `/${encodeURIComponent(claim)}` : ""}`;
    if (window.location.hash !== hash) window.location.hash = hash;
    setView(v);
  }, []);

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
      setSelectedId((cur) => (cur && q.items.some((i) => i.claim_id === cur) ? cur : q.items[0]?.claim_id ?? null));
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
    void refresh(budget);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  function select(id: string, additive = false) {
    if (additive) {
      toggleCompare(id);
      return;
    }
    setSelectedId(id);
    if (view === "officer") {
      const hash = `#/officer/${encodeURIComponent(id)}`;
      if (window.location.hash !== hash) history.replaceState(null, "", hash);
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
        })),
    [queue, details],
  );

  const selected = selectedId ? details[selectedId] : null;
  const compareClaims = compareIds.map((id) => details[id]).filter(Boolean) as ClaimDetail[];
  const allClaims = queue.map((i) => details[i.claim_id]).filter(Boolean) as ClaimDetail[];
  const hasAB = details.A && details.B;

  return (
    <div className="app">
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
          <button className={view === "officer" ? "on" : ""} onClick={() => go("officer", selectedId)}>
            Officer workspace
          </button>
          <button className={view === "farmer" ? "on" : ""} onClick={() => go("farmer", farmerClaim ?? selectedId)}>
            Farmer preview <span className="tab-lang">हि · ਪੰ</span>
          </button>
          <button className={view === "results" ? "on" : ""} onClick={() => go("results")}>
            Evidence &amp; results
          </button>
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
        <main className="officer">
          <aside className="sidebar">
            <ImportBar onImported={onImported} />
            <BudgetControl budget={budget} items={queue} loading={loading} onChange={changeBudget} />
            <div className="queue-head">
              <h3>Queue</h3>
              <span className="muted small">server order · visit ranks first</span>
            </div>
            <Queue
              items={queue}
              selectedId={selectedId}
              compareIds={compareIds}
              justAllocated={justAllocated}
              loading={loading}
              onSelect={(id) => select(id)}
              onToggleCompare={toggleCompare}
            />
          </aside>

          <section className="workspace">
            <div className="map-row">
              <PlotMap plots={plots} selectedId={selectedId} compareIds={compareIds} onSelect={select} />
              {compareClaims.length < 2 ? (
                <div className="compare-hint">
                  <p>
                    <strong>Compare neighbouring plots.</strong> Tick “Compare” on two claims or Shift-click them on the map.
                  </p>
                  {hasAB ? (
                    <button className="btn" onClick={() => setCompareIds(["A", "B"])}>
                      Compare A · B
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>

            {compareClaims.length >= 2 ? (
              <Compare claims={compareClaims} onClose={() => setCompareIds([])} onFocus={(id) => select(id)} />
            ) : null}

            {selected ? (
              <div className="detail-grid">
                <ClaimEvidence detail={selected} />
                <div className="detail-side">
                  <ActionPanel
                    detail={selected}
                    budget={budget}
                    onSaved={() => void reloadClaim(selected.claim_id)}
                    highlightReceiptId={highlightReceipt?.claim === selected.claim_id ? highlightReceipt.id : null}
                  />
                  <div className="side-links">
                    <button
                      className="btn btn-ghost"
                      onClick={() => {
                        setFarmerClaim(selected.claim_id);
                        go("farmer", selected.claim_id);
                      }}
                    >
                      Preview farmer card for {selected.claim_id} →
                    </button>
                  </div>
                  <ResponsibleAI compact />
                </div>
              </div>
            ) : queue.length ? (
              <p className="muted pad">Select a claim from the queue or the map.</p>
            ) : null}
          </section>
        </main>
      ) : null}

      {view === "farmer" ? (
        <main className="farmer-main">
          <FarmerPreview
            claims={allClaims}
            claimId={farmerClaim ?? selectedId}
            language={language}
            onLanguage={setLanguage}
            onClaim={(id) => {
              setFarmerClaim(id);
              history.replaceState(null, "", `#/farmer/${encodeURIComponent(id)}`);
            }}
            onSubmitted={(claimId, receipt: ReviewReceipt) => {
              setHighlightReceipt({ claim: claimId, id: receipt.id });
              void reloadClaim(claimId);
            }}
            onOpenOfficer={(claimId, receiptId) => {
              setHighlightReceipt({ claim: claimId, id: receiptId });
              setSelectedId(claimId);
              go("officer", claimId);
              window.setTimeout(() => document.querySelector(".tl-new")?.scrollIntoView({ behavior: "smooth", block: "center" }), 300);
            }}
          />
        </main>
      ) : null}

      {view === "results" ? (
        <main className="results-main">
          <ResultsView
            claims={allClaims}
            onOpenClaim={(id) => {
              setSelectedId(id);
              go("officer", id);
            }}
          />
        </main>
      ) : null}

      <footer className="foot">
        Sabūt · INNOVEX 2026 · PS 02 Smart Agriculture · Farmers, claims and Meena are fictional · Classification foundation:
        Microsoft Ricemapper · Simulated evidence is labeled wherever it appears.
      </footer>
    </div>
  );
}
