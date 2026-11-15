import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface MapPlot {
  id: string;
  geometry: GeoJSON.Geometry;
  status: string;
  inBudget: boolean;
  rank: number | null;
}

interface Props {
  plots: MapPlot[];
  selectedId: string | null;
  compareIds: string[];
  onSelect: (id: string, additive: boolean) => void;
}

const STATUS_COLOR: Record<string, string> = {
  ready_for_desk_review: "#2f7d4f",
  field_check_recommended: "#b4580f",
  insufficient_evidence: "#7a6a8a",
};

/**
 * Offline plot map: Leaflet with no tile layer. Only the claimed boundaries are
 * drawn, so it works without network access. Click selects, Shift/⌘-click adds
 * a plot to the side-by-side comparison.
 */
export function PlotMap({ plots, selectedId, compareIds, onSelect }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.FeatureGroup | null>(null);
  const fittedKey = useRef<string>("");
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!host.current || map.current) return;
    const m = L.map(host.current, {
      attributionControl: false,
      zoomSnap: 0.25,
      maxZoom: 22,
      minZoom: 3,
      preferCanvas: false,
    });
    m.setView([29.7, 76.9], 15);
    L.control.scale({ imperial: false, position: "bottomleft" }).addTo(m);
    layer.current = L.featureGroup().addTo(m);
    map.current = m;
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
    const group = layer.current;
    if (!m || !group) return;
    group.clearLayers();
    for (const p of plots) {
      const selected = p.id === selectedId;
      const compared = compareIds.includes(p.id);
      const color = STATUS_COLOR[p.status] ?? "#555";
      const gj = L.geoJSON(p.geometry as GeoJSON.GeoJsonObject, {
        style: {
          color: selected ? "#111" : color,
          weight: selected ? 3.5 : compared ? 3 : 1.6,
          dashArray: compared && !selected ? "6 4" : undefined,
          fillColor: color,
          fillOpacity: selected ? 0.42 : 0.24,
        },
      });
      gj.on("click", (e: L.LeafletMouseEvent) => {
        const oe = e.originalEvent;
        onSelectRef.current(p.id, Boolean(oe?.shiftKey || oe?.metaKey || oe?.ctrlKey));
      });
      const label = `<span class="map-label-id">${escapeHtml(p.id)}</span>${
        p.inBudget ? '<span class="map-label-visit">visit</span>' : ""
      }`;
      gj.bindTooltip(label, {
        permanent: true,
        direction: "center",
        className: `map-label ${selected ? "map-label-selected" : ""}`,
      });
      gj.addTo(group);
    }
    const key = plots.map((p) => p.id).sort().join("|");
    if (plots.length && key !== fittedKey.current) {
      fittedKey.current = key;
      m.fitBounds(group.getBounds(), { padding: [36, 36], maxZoom: 18 });
    }
  }, [plots, selectedId, compareIds]);

  function refit() {
    const m = map.current;
    const group = layer.current;
    if (m && group && plots.length) m.fitBounds(group.getBounds(), { padding: [36, 36], maxZoom: 18 });
  }

  function zoomTo(id: string) {
    const m = map.current;
    const p = plots.find((x) => x.id === id);
    if (!m || !p) return;
    const b = L.geoJSON(p.geometry as GeoJSON.GeoJsonObject).getBounds();
    m.fitBounds(b, { padding: [60, 60], maxZoom: 20 });
  }

  return (
    <div className="map-wrap">
      <div ref={host} className="map" aria-label="Claimed plot boundaries map" />
      {!plots.length ? (
        <div className="map-empty">Load the demo batch or upload GeoJSON to draw claimed plot boundaries.</div>
      ) : null}
      <div className="map-tools">
        <button className="btn btn-ghost btn-xs" onClick={refit} disabled={!plots.length}>
          Fit all
        </button>
        {selectedId ? (
          <button className="btn btn-ghost btn-xs" onClick={() => zoomTo(selectedId)}>
            Zoom to {selectedId}
          </button>
        ) : null}
      </div>
      <div className="map-legend">
        <span>
          <i style={{ background: STATUS_COLOR.ready_for_desk_review }} /> Ready for desk review
        </span>
        <span>
          <i style={{ background: STATUS_COLOR.field_check_recommended }} /> Field check recommended
        </span>
        <span>
          <i style={{ background: STATUS_COLOR.insufficient_evidence }} /> Insufficient evidence
        </span>
        <span className="muted">Offline map · plot boundaries only · Shift-click to compare</span>
      </div>
    </div>
  );
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
