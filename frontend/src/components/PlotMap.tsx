import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { actionLabel, statusLabel } from "../i18n/labels";
import { fmtDate, fmtNum } from "../format";
import { seasonColor, seasonGradientCss, vvAt, type SeasonPoint } from "../season";
import { visitRouteFor, type LatLng, type VisitRoute } from "../route";

export interface MapPlot {
  id: string;
  geometry: GeoJSON.Geometry;
  status: string;
  inBudget: boolean;
  rank: number | null;
  acres: number | null;
  nextAction: string;
  /** Usable VV observations from the decision evidence, for the season view. */
  season?: SeasonPoint[];
  seasonSource?: string;
}

interface Props {
  plots: MapPlot[];
  selectedId: string | null;
  compareIds: string[];
  onSelect: (id: string, additive: boolean) => void;
  /** Optional toolbar content rendered over the map (e.g. a compare shortcut). */
  tools?: React.ReactNode;
}

export const STATUS_COLOR: Record<string, string> = {
  ready_for_desk_review: "#2f7d4f",
  field_check_recommended: "#c0621a",
  insufficient_evidence: "#6f5f86",
};

/** Pick a graticule step (degrees) that gives roughly 4–6 lines across the view. */
function graticuleStep(span: number): number {
  const steps = [0.0001, 0.0002, 0.0005, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1];
  return steps.find((s) => span / s <= 6) ?? 1;
}

function fmtDeg(v: number, step: number, pos: string, neg: string): string {
  const digits = Math.max(0, Math.ceil(-Math.log10(step)));
  return `${Math.abs(v).toFixed(digits)}°${v >= 0 ? pos : neg}`;
}

/**
 * Offline plot map. Leaflet with no tile layer: only claimed boundaries, a
 * latitude/longitude graticule, scale, north arrow and cursor coordinates, so
 * it works with networking off. Click selects; Shift/⌘-click adds a plot to
 * the side-by-side comparison.
 */
export function PlotMap({ plots, selectedId, compareIds, onSelect, tools }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  const map = useRef<L.Map | null>(null);
  const plotLayer = useRef<L.FeatureGroup | null>(null);
  const gridLayer = useRef<L.LayerGroup | null>(null);
  const routeLayer = useRef<L.LayerGroup | null>(null);
  const fittedKey = useRef("");
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const [hover, setHover] = useState<MapPlot | null>(null);
  const [cursor, setCursor] = useState<L.LatLng | null>(null);
  const [mapVersion, setMapVersion] = useState(0);
  // Season view: off by default; while on, plot fills follow VV backscatter at seasonT.
  const [seasonOn, setSeasonOn] = useState(false);
  const [seasonT, setSeasonT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const layersById = useRef(new Map<string, { gj: L.GeoJSON; plot: MapPlot; base: L.PathOptions }>());
  const restyle = useRef<(id: string) => L.PathOptions | null>(() => null);

  useEffect(() => {
    if (!host.current || map.current) return;
    const m = L.map(host.current, {
      attributionControl: false,
      scrollWheelZoom: false,
      // The officer view can unmount before Leaflet's zoom transition finishes.
      zoomAnimation: false,
      zoomSnap: 0.25,
      maxZoom: 21,
      minZoom: 4,
    });
    m.setView([29.7, 76.9], 15);
    fittedKey.current = ""; // a new map instance has not been fitted to the plots yet
    L.control.scale({ imperial: false, position: "bottomleft", maxWidth: 140 }).addTo(m);
    gridLayer.current = L.layerGroup().addTo(m);
    plotLayer.current = L.featureGroup().addTo(m);
    // Route sits above plot fills but below the claim labels (tooltip pane is 650).
    m.createPane("route").style.zIndex = "450";
    routeLayer.current = L.layerGroup().addTo(m);

    const drawGrid = () => {
      const g = gridLayer.current;
      if (!g) return;
      g.clearLayers();
      const b = m.getBounds();
      const step = graticuleStep(Math.max(b.getEast() - b.getWest(), b.getNorth() - b.getSouth()));
      const line = { color: "#8a8f80", weight: 0.6, opacity: 0.45, dashArray: "2 4", interactive: false };
      for (let x = Math.ceil(b.getWest() / step) * step; x < b.getEast(); x += step) {
        L.polyline([[b.getSouth(), x], [b.getNorth(), x]], line).addTo(g);
        L.marker([b.getNorth(), x], {
          interactive: false,
          icon: L.divIcon({ className: "grid-label grid-label-top", html: `<span>${fmtDeg(x, step, "E", "W")}</span>`, iconSize: [0, 0] }),
        }).addTo(g);
      }
      for (let y = Math.ceil(b.getSouth() / step) * step; y < b.getNorth(); y += step) {
        L.polyline([[y, b.getWest()], [y, b.getEast()]], line).addTo(g);
        L.marker([y, b.getEast()], {
          interactive: false,
          icon: L.divIcon({ className: "grid-label grid-label-right", html: `<span>${fmtDeg(y, step, "N", "S")}</span>`, iconSize: [0, 0] }),
        }).addTo(g);
      }
    };
    m.on("moveend zoomend resize", drawGrid);
    m.on("mousemove", (e: L.LeafletMouseEvent) => setCursor(e.latlng));
    m.on("mouseout", () => setCursor(null));
    drawGrid();
    map.current = m;
    setMapVersion((v) => v + 1);
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(host.current);
    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    const group = plotLayer.current;
    if (!m || !group) return;
    group.clearLayers();
    layersById.current.clear();
    // Desk-review plots are drawn first and muted so the few cases needing action stay readable on top.
    const needsAction = (p: MapPlot) => p.status !== "ready_for_desk_review";
    const ordered = [...plots].sort((a, b) => Number(needsAction(a)) - Number(needsAction(b)));
    for (const p of ordered) {
      const selected = p.id === selectedId;
      const compared = compareIds.includes(p.id);
      const quiet = !needsAction(p) && !selected && !compared;
      const color = STATUS_COLOR[p.status] ?? "#555";
      const weak = p.status === "insufficient_evidence";
      const base: L.PathOptions = {
        color: selected ? "#14201a" : color,
        weight: selected ? 3.5 : compared ? 3 : quiet ? 1 : 2,
        dashArray: weak && !selected ? "5 4" : compared && !selected ? "8 4" : undefined,
        fillColor: color,
        fillOpacity: selected ? 0.5 : quiet ? 0.15 : 0.3,
      };
      const gj = L.geoJSON(p.geometry as GeoJSON.GeoJsonObject, { style: base });
      gj.on("click", (e: L.LeafletMouseEvent) => {
        const oe = e.originalEvent;
        onSelectRef.current(p.id, Boolean(oe?.shiftKey || oe?.metaKey || oe?.ctrlKey));
      });
      gj.on("mouseover", () => {
        gj.setStyle({ fillOpacity: 0.55, weight: Math.max(base.weight ?? 2, 3) });
        setHover(p);
      });
      gj.on("mouseout", () => {
        gj.setStyle(restyle.current(p.id) ?? base);
        setHover((h) => (h?.id === p.id ? null : h));
      });
      const visit = p.inBudget ? `<span class="map-label-visit">Visit #${p.rank}</span>` : "";
      gj.bindTooltip(`<span class="map-label-id">${escapeHtml(p.id)}</span>${visit}`, {
        permanent: !quiet,
        direction: "center",
        className: `map-label ${selected ? "map-label-selected" : ""}`,
      });
      gj.addTo(group);
      layersById.current.set(p.id, { gj, plot: p, base });
    }
    const key = plots.map((p) => p.id).sort().join("|");
    if (plots.length && key !== fittedKey.current) {
      fittedKey.current = key;
      m.invalidateSize();
      m.fitBounds(group.getBounds(), { padding: [48, 48], maxZoom: 18 });
    }
  }, [plots, selectedId, compareIds, mapVersion]);

  // Season window spans every plot's observations.
  const seasonRange = useMemo(() => {
    const ts = plots.flatMap((p) => (p.season ?? []).map((o) => o.t));
    return ts.length ? { start: Math.min(...ts), end: Math.max(...ts) } : null;
  }, [plots]);
  const seasonSources = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of plots) if (p.season?.length) counts.set(p.seasonSource ?? "unknown", (counts.get(p.seasonSource ?? "unknown") ?? 0) + 1);
    return [...counts.entries()];
  }, [plots]);

  useEffect(() => {
    if (seasonRange && (seasonT < seasonRange.start || seasonT > seasonRange.end)) setSeasonT(seasonRange.start);
  }, [seasonRange, seasonT]);

  // Restyle existing layers (no redraw). Runs after the plot effect above, so new layers pick it up too.
  useEffect(() => {
    restyle.current = (id) => {
      if (!seasonOn) return null;
      const entry = layersById.current.get(id);
      if (!entry) return null;
      const vv = vvAt(entry.plot.season ?? [], seasonT);
      const fill = seasonColor(vv);
      return { ...entry.base, fillColor: fill, fillOpacity: vv === null ? 0.35 : 0.85, color: entry.base.weight! > 2 ? entry.base.color : fill };
    };
    for (const [id, { gj, base }] of layersById.current) gj.setStyle(restyle.current(id) ?? base);
  }, [seasonOn, seasonT, plots, selectedId, compareIds, mapVersion]);

  // Play: sweep the season in about eight seconds.
  useEffect(() => {
    if (!playing || !seasonRange) return;
    const PLAY_MS = 8000;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = now - last;
      last = now;
      let done = false;
      setSeasonT((t) => {
        const next = t + ((seasonRange.end - seasonRange.start) * dt) / PLAY_MS;
        if (next >= seasonRange.end) {
          done = true;
          return seasonRange.end;
        }
        return next;
      });
      if (done) setPlaying(false);
      else raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, seasonRange]);

  function togglePlay() {
    if (!seasonRange) return;
    if (!playing && seasonT >= seasonRange.end) setSeasonT(seasonRange.start);
    setPlaying((v) => !v);
  }

  // Today's visit route: a loop from the (fictional) block office through every budgeted plot.
  const route: VisitRoute | null = useMemo(() => visitRouteFor(plots), [plots]);

  useEffect(() => {
    const layer = routeLayer.current;
    if (!layer) return;
    layer.clearLayers();
    if (!route) return;
    const path: LatLng[] = [route.depot, ...route.stops.map((s) => s.at), route.depot];
    L.polyline(path, { pane: "route", color: "#ffffff", weight: 6, opacity: 0.85, interactive: false }).addTo(layer);
    L.polyline(path, { pane: "route", color: "#14201a", weight: 2.5, dashArray: "7 6", interactive: false }).addTo(layer);
    L.marker(route.depot, {
      pane: "route",
      keyboard: false,
      icon: L.divIcon({ className: "route-depot", html: "<span>Office</span>", iconSize: [0, 0] }),
    })
      .bindTooltip("Block office (fictional) · route start and end", { direction: "top", offset: [0, -14] })
      .addTo(layer);
  }, [route, mapVersion]);

  function fitAll() {
    const m = map.current;
    const g = plotLayer.current;
    if (m && g && plots.length) m.fitBounds(g.getBounds(), { padding: [48, 48], maxZoom: 18 });
  }

  function zoomTo(id: string) {
    const m = map.current;
    const p = plots.find((x) => x.id === id);
    if (!m || !p) return;
    m.fitBounds(L.geoJSON(p.geometry as GeoJSON.GeoJsonObject).getBounds(), { padding: [90, 90], maxZoom: 19 });
  }

  // Full screen: a fixed overlay that fills the window at once, upgraded to true browser
  // full screen where the Fullscreen API is allowed. Esc or the button closes either.
  useEffect(() => {
    const sync = () => {
      if (!document.fullscreenElement) setFull(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFull(false);
    };
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("keydown", esc);
    };
  }, []);

  // Resize to the new box, then fit every plot when entering full screen (runs only on toggle).
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    m.invalidateSize();
    const g = plotLayer.current;
    if (full && g && plots.length) m.fitBounds(g.getBounds(), { padding: [48, 48], maxZoom: 18 });
  }, [full]);

  function toggleFull() {
    if (full) {
      setFull(false);
      if (document.fullscreenElement) void document.exitFullscreen();
      return;
    }
    setFull(true);
    // Optional upgrade; embedded frames and iPhone Safari refuse it and keep the overlay.
    wrap.current?.requestFullscreen?.().catch(() => undefined);
  }

  return (
    <div className={`map-wrap ${full ? "map-full" : ""}`} ref={wrap}>
      <header className="map-heading">
        <h2>Claim map</h2>
        <div className="map-tools">
          {tools}
          {seasonRange ? (
            <button
              className={`map-btn ${seasonOn ? "map-btn-on" : ""}`}
              aria-pressed={seasonOn}
              onClick={() => {
                setSeasonOn((v) => !v);
                setPlaying(false);
              }}
            >
              Season view
            </button>
          ) : null}
          <button className="map-btn" onClick={fitAll} disabled={!plots.length}>
            Fit all
          </button>
          {selectedId && plots.some((plot) => plot.id === selectedId) ? (
            <button className="map-btn" onClick={() => zoomTo(selectedId)}>
              Zoom to {selectedId}
            </button>
          ) : null}
          <button className="map-btn" onClick={toggleFull} aria-pressed={full} title={full ? "Exit full screen (Esc)" : "Full screen"}>
            {full ? "Exit full screen" : "⛶ Full screen"}
          </button>
        </div>
      </header>
      <div className="map-canvas">
        <div ref={host} className="map" aria-label="Claimed plot boundaries map" />
        <div className="map-north" aria-hidden title="North">
          <svg viewBox="0 0 24 32" width="18" height="24">
            <path d="M12 2 L19 26 L12 21 L5 26 Z" fill="#1d2420" />
            <path d="M12 2 L12 21 L5 26 Z" fill="#9aa093" />
          </svg>
          <span>N</span>
        </div>
        {hover ? (
          <div className="map-hover" aria-hidden="true">
            <strong>Claim {hover.id}</strong>
            <span className="map-hover-status" style={{ color: STATUS_COLOR[hover.status] }}>
              {statusLabel(hover.status)}
            </span>
            <span>→ {actionLabel(hover.nextAction)}</span>
            <span className="muted">
              {hover.acres !== null ? `${fmtNum(hover.acres)} ac claimed` : "acreage not stated"}
              {hover.inBudget ? ` · visit #${hover.rank}` : ""}
            </span>
          </div>
        ) : null}
        {cursor ? (
          <div className="map-coords">
            {cursor.lat.toFixed(5)}°N {cursor.lng.toFixed(5)}°E
          </div>
        ) : null}
        {!plots.length ? (
          <div className="map-empty">Load the demo batch or upload GeoJSON to draw the claimed plots.</div>
        ) : null}
      </div>
      {seasonOn && seasonRange ? (
        <div className="season-bar" aria-label="Season view controls">
          <button className="season-play" onClick={togglePlay} aria-label={playing ? "Pause season" : "Play season"}>
            {playing ? "❚❚" : "▶"}
          </button>
          <div className="season-track">
            <input
              type="range"
              min={seasonRange.start}
              max={seasonRange.end}
              step={86_400_000 / 4}
              value={seasonT}
              aria-label="Season date"
              aria-valuetext={fmtDate(new Date(seasonT).toISOString())}
              onChange={(e) => {
                setPlaying(false);
                setSeasonT(Number(e.target.value));
              }}
            />
            <div className="season-ends muted">
              <span>{fmtDate(new Date(seasonRange.start).toISOString())}</span>
              <span>{fmtDate(new Date(seasonRange.end).toISOString())}</span>
            </div>
          </div>
          <strong className="season-date">{fmtDate(new Date(seasonT).toISOString())}</strong>
          <div className="season-key">
            <span className="season-gradient" style={{ background: seasonGradientCss() }} />
            <div className="season-key-labels muted">
              <span>Flooded (puddled)</span>
              <span>Growing crop</span>
            </div>
            <span className="muted season-note">
              <i className="season-nodata" /> no usable date · VV backscatter from each claim's decision evidence (
              {seasonSources.map(([k, n]) => `${n} ${k === "sentinel1_real" ? "real" : k}`).join(", ")})
            </span>
          </div>
        </div>
      ) : null}
      <div className="map-legend">
        {Object.entries(STATUS_COLOR).map(([s, c]) => (
          <span key={s}>
            <i style={{ background: c }} className={s === "insufficient_evidence" ? "dashed" : ""} /> {statusLabel(s)}
          </span>
        ))}
        {route ? (
          <span className="route-summary" title="Straight-line distance; road distance will be longer.">
            <i className="route-key" /> Visit route: {route.stops.length} stop{route.stops.length === 1 ? "" : "s"} ·{" "}
            {fmtNum(route.km, 1)} km straight-line · Office → {route.stops.map((s) => s.id).join(" → ")} → Office
          </span>
        ) : null}
        <span className="muted map-legend-note">Offline · boundaries only<span className="map-shift-hint"> · Shift-click to compare</span></span>
      </div>
    </div>
  );
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
