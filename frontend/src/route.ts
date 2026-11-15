/**
 * Visit route for today's budgeted field checks: a loop from a block office
 * through each allocated plot. Distances are straight-line (haversine), so the
 * UI labels them that way; road distance will be longer.
 */

export type LatLng = [number, number];

export interface RouteStop {
  id: string;
  at: LatLng;
}

export interface VisitRoute {
  depot: LatLng;
  stops: RouteStop[]; // in driving order
  km: number; // straight-line loop, depot → stops → depot
}

const EARTH_KM = 6371;
/** The fictional block office sits this far (degrees latitude) south of the plotted batch. */
const DEPOT_OFFSET_DEG = 0.004;

export function haversineKm([lat1, lng1]: LatLng, [lat2, lng2]: LatLng): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h));
}

/** Mean of the outer ring's vertices: close enough to a plot's centre for routing. */
export function centroid(geometry: GeoJSON.Geometry): LatLng | null {
  let ring: GeoJSON.Position[] | undefined;
  if (geometry.type === "Polygon") ring = geometry.coordinates[0];
  else if (geometry.type === "MultiPolygon") ring = geometry.coordinates[0]?.[0];
  if (!ring?.length) return null;
  const last = ring[ring.length - 1];
  const pts = ring.length > 1 && ring[0][0] === last[0] && ring[0][1] === last[1] ? ring.slice(0, -1) : ring;
  const lng = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const lat = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return [lat, lng];
}

/** Depot just south of the batch's bounding box, centred on it. */
export function depotFor(points: LatLng[]): LatLng {
  const lats = points.map((p) => p[0]);
  const lngs = points.map((p) => p[1]);
  return [Math.min(...lats) - DEPOT_OFFSET_DEG, (Math.min(...lngs) + Math.max(...lngs)) / 2];
}

function loopKm(depot: LatLng, order: RouteStop[]): number {
  let km = 0;
  let prev = depot;
  for (const s of order) {
    km += haversineKm(prev, s.at);
    prev = s.at;
  }
  return order.length ? km + haversineKm(prev, depot) : 0;
}

/** Nearest-neighbour tour, then 2-opt until no swap shortens it. Budgets are small, so this is exact enough. */
export function planRoute(depot: LatLng, stops: RouteStop[]): VisitRoute {
  const left = [...stops];
  const order: RouteStop[] = [];
  let at = depot;
  while (left.length) {
    let best = 0;
    for (let i = 1; i < left.length; i++) if (haversineKm(at, left[i].at) < haversineKm(at, left[best].at)) best = i;
    const [next] = left.splice(best, 1);
    order.push(next);
    at = next.at;
  }
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < order.length - 1; i++) {
      for (let j = i + 1; j < order.length; j++) {
        const trial = [...order.slice(0, i), ...order.slice(i, j + 1).reverse(), ...order.slice(j + 1)];
        if (loopKm(depot, trial) + 1e-9 < loopKm(depot, order)) {
          order.splice(0, order.length, ...trial);
          improved = true;
        }
      }
    }
  }
  return { depot, stops: order, km: loopKm(depot, order) };
}
