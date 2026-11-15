import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { actionLabel, statusLabel } from "../i18n/labels";
import { fmtNum } from "../format";

export interface MapPlot {
  id: string;
  geometry: GeoJSON.Geometry;
  status: string;
  inBudget: boolean;
  rank: number | null;
  acres: number | null;
  nextAction: string;
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
  const map = useRef<L.Map | null>(null);
  const plotLayer = useRef<L.FeatureGroup | null>(null);
  const gridLayer = useRef<L.LayerGroup | null>(null);
  const fittedKey = useRef("");
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const [hover, setHover] = useState<MapPlot | null>(null);
  const [cursor, setCursor] = useState<L.LatLng | null>(null);
  const [mapVersion, setMapVersion] = useState(0);

  useEffect(() => {
    if (!host.current || map.current) return;
    const m = L.map(host.current, { attributionControl: false, scrollWheelZoom: false, zoomSnap: 0.25, maxZoom: 21, minZoom: 4 });
    m.setView([29.7, 76.9], 15);
    fittedKey.current = ""; // a new map instance has not been fitted to the plots yet
    L.control.scale({ imperial: false, position: "bottomleft", maxWidth: 140 }).addTo(m);
    gridLayer.current = L.layerGroup().addTo(m);
    plotLayer.current = L.featureGroup().addTo(m);

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
    for (const p of plots) {
      const selected = p.id === selectedId;
      const compared = compareIds.includes(p.id);
      const color = STATUS_COLOR[p.status] ?? "#555";
      const weak = p.status === "insufficient_evidence";
      const base: L.PathOptions = {
        color: selected ? "#14201a" : color,
        weight: selected ? 3.5 : compared ? 3 : 2,
        dashArray: weak && !selected ? "5 4" : compared && !selected ? "8 4" : undefined,
        fillColor: color,
        fillOpacity: selected ? 0.5 : 0.3,
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
        gj.setStyle(base);
        setHover((h) => (h?.id === p.id ? null : h));
      });
      const visit = p.inBudget ? `<span class="map-label-visit">Visit #${p.rank}</span>` : "";
      gj.bindTooltip(`<span class="map-label-id">${escapeHtml(p.id)}</span>${visit}`, {
        permanent: true,
        direction: "center",
        className: `map-label ${selected ? "map-label-selected" : ""}`,
      });
      gj.addTo(group);
    }
    const key = plots.map((p) => p.id).sort().join("|");
    if (plots.length && key !== fittedKey.current) {
      fittedKey.current = key;
      m.invalidateSize();
      m.fitBounds(group.getBounds(), { padding: [48, 48], maxZoom: 18 });
    }
  }, [plots, selectedId, compareIds, mapVersion]);

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

  return (
    <div className="map-wrap">
      <header className="map-heading">
        <h2>Claim map</h2>
        <div className="map-tools">
          {tools}
          <button className="map-btn" onClick={fitAll} disabled={!plots.length}>
            Fit all
          </button>
          {selectedId && plots.some((plot) => plot.id === selectedId) ? (
            <button className="map-btn" onClick={() => zoomTo(selectedId)}>
              Zoom to {selectedId}
            </button>
          ) : null}
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
      <div className="map-legend">
        {Object.entries(STATUS_COLOR).map(([s, c]) => (
          <span key={s}>
            <i style={{ background: c }} className={s === "insufficient_evidence" ? "dashed" : ""} /> {statusLabel(s)}
          </span>
        ))}
        <span className="muted map-legend-note">Offline · boundaries only<span className="map-shift-hint"> · Shift-click to compare</span></span>
      </div>
    </div>
  );
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
