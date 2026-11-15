"""Fictional demo batch layout: hundreds of scattered, irregular plots on real Karnal cropland.

Plot shapes are illustrative, not surveyed parcels. Each one is a jittered quadrilateral,
trapezoid, chamfered pentagon, strip or blob with lightly smoothed corners and edges. Plots are
placed only where ESA WorldCover 2021 (10 m, class 40) marks at least 95% of the plot as cropland.

The batch has three parts:
  featured   A, B (adjacent, sharing one wavy border), C (0.4 ac) and ARCHIVE (retrospective)
  review     D-H: a handful of scattered cases that each need a different kind of review
  background KNL-### claims whose simulated evidence supports the claim (desk review)
"""

from __future__ import annotations

import math
import random

UTM_EPSG = 32643
# Area of interest west of Karnal city, in UTM 43N metres.
AOI = (684500.0, 3280000.0, 689000.0, 3284500.0)
AOI_MARGIN_M = 120.0
PLOT_SPACING_M = 12.0
CROPLAND_CLASS = 40
MIN_CROPLAND_FRACTION = 0.95
SQM_PER_ACRE = 4046.8564224
LAYOUT_SEED = 20241015
BACKGROUND_COUNT = 250
BACKGROUND_DSR_SHARE = 0.8
WORLDCOVER_COLLECTION = "esa-worldcover"
WORLDCOVER_ITEM = "ESA_WorldCover_10m_2021_v200_N27E075"

# A and B share one field split by a wavy border; the parent is ~5 acres.
AB_CENTRE = (686830.0, 3282170.0)
C_CENTRE = (686440.0, 3282420.0)

FEATURED = {
    "A": {"farmer_name": "Ramesh Kumar", "claimed_method": "DSR", "claimed_acres": 2.5},
    "B": {"farmer_name": "Sunita Devi", "claimed_method": "DSR", "claimed_acres": 2.5},
    "C": {"farmer_name": "Gurpreet Singh", "claimed_method": "DSR", "claimed_acres": 0.4},
    "ARCHIVE": {"farmer_name": "Harjit Singh", "claimed_method": "DSR", "claimed_acres": 2.5,
                "reported_harvest_date": "2024-10-08"},
}

# Scattered cases that each need a different kind of review. Roles drive the simulation.
REVIEW = {
    "D": {"farmer_name": "Mahender Malik", "claimed_method": "DSR", "claimed_acres": 3.2, "role": "disagrees"},
    "E": {"farmer_name": "Kavita Rani", "claimed_method": "DSR", "claimed_acres": 1.8, "role": "ambiguous_dsr"},
    "F": {"farmer_name": "Jasbir Sandhu", "claimed_method": "PTR", "claimed_acres": 1.5, "role": "ambiguous_ptr"},
    "G": {"farmer_name": "Ombir Dhull", "claimed_method": "DSR", "claimed_acres": 2.2, "role": "sparse_dates"},
    "H": {"farmer_name": "Neelam Saini", "claimed_method": "DSR", "claimed_acres": 2.0, "role": "low_coverage"},
}

FIRST_NAMES = ["Suresh", "Rajbir", "Satbir", "Jagdish", "Kuldeep", "Sandeep", "Pardeep", "Anil", "Sunil",
               "Rakesh", "Baljeet", "Gurmeet", "Harpreet", "Kamlesh", "Savitri", "Poonam", "Santosh", "Bimla",
               "Dharambir", "Vikram", "Narender", "Joginder", "Ranbir", "Krishan", "Usha", "Manjeet", "Balwan",
               "Sukhwinder", "Rajesh", "Meena"]
SURNAMES = ["Kumar", "Singh", "Devi", "Sharma", "Saini", "Kamboj", "Rana", "Chauhan", "Malik", "Dhull",
            "Kadian", "Mann", "Sandhu", "Virk", "Goyat", "Rani"]


# --- shapes ---------------------------------------------------------------------------------

def chaikin(points: list[tuple[float, float]], iterations: int, ratio: float, closed: bool = True):
    """Corner-cutting smoothing. A small ratio keeps edges straight and rounds the corners."""
    pts = list(points)
    for _ in range(iterations):
        out = []
        n = len(pts) if closed else len(pts) - 1
        if not closed:
            out.append(pts[0])
        for i in range(n):
            (x0, y0), (x1, y1) = pts[i], pts[(i + 1) % len(pts)]
            out.append(((1 - ratio) * x0 + ratio * x1, (1 - ratio) * y0 + ratio * y1))
            out.append((ratio * x0 + (1 - ratio) * x1, ratio * y0 + (1 - ratio) * y1))
        if not closed:
            out.append(pts[-1])
        pts = out
    return pts


def wobble_edges(points, rng: random.Random, amount: float):
    """Insert a slightly offset midpoint on each edge so borders are not ruler-straight."""
    out = []
    for i, (x0, y0) in enumerate(points):
        x1, y1 = points[(i + 1) % len(points)]
        dx, dy = x1 - x0, y1 - y0
        length = math.hypot(dx, dy) or 1.0
        off = rng.uniform(-amount, amount) * length
        out.append((x0, y0))
        out.append(((x0 + x1) / 2 - dy / length * off, (y0 + y1) / 2 + dx / length * off))
    return out


def base_shape(rng: random.Random) -> list[tuple[float, float]]:
    """Unit-scale outline of one of several field shapes, centred near the origin."""
    kind = rng.choices(["quad", "trapezoid", "pentagon", "strip", "blob"], weights=[3, 2, 2, 2, 1])[0]
    if kind == "blob":
        n = rng.randint(7, 9)
        return [((1 + rng.uniform(-0.18, 0.18)) * math.cos(2 * math.pi * i / n),
                 (1 + rng.uniform(-0.18, 0.18)) * math.sin(2 * math.pi * i / n)) for i in range(n)]
    aspect = rng.uniform(2.5, 4.0) if kind == "strip" else rng.uniform(1.0, 2.2)
    w, h = aspect / 2, 0.5
    top = rng.uniform(0.55, 0.9) if kind == "trapezoid" else 1.0
    pts = [(-w, -h), (w, -h), (w * top, h), (-w * top, h)]
    if kind == "pentagon":
        k = rng.randrange(4)
        cut = rng.uniform(0.15, 0.35)
        (x, y), (xn, yn), (xp, yp) = pts[k], pts[(k + 1) % 4], pts[k - 1]
        pts[k:k + 1] = [(x + (xp - x) * cut, y + (yp - y) * cut), (x + (xn - x) * cut, y + (yn - y) * cut)]
    jitter = 0.1 * min(w, h) * 2
    return [(x + rng.uniform(-jitter, jitter), y + rng.uniform(-jitter, jitter)) for x, y in pts]


def make_plot(rng: random.Random, centre: tuple[float, float], area_m2: float):
    """Irregular, semi-smooth polygon of the given area centred on a UTM point."""
    from shapely import affinity
    from shapely.geometry import Polygon

    pts = chaikin(wobble_edges(base_shape(rng), rng, 0.03), iterations=2, ratio=0.16)
    poly = Polygon(pts).buffer(0)
    # Field grids near Karnal run roughly north-south; allow a modest skew either way.
    angle = rng.choice([0.0, 90.0]) + rng.gauss(0, 12)
    poly = affinity.rotate(poly, angle, origin="centroid")
    poly = affinity.scale(poly, *(2 * [math.sqrt(area_m2 / poly.area)]), origin="centroid")
    c = poly.centroid
    return affinity.translate(poly, centre[0] - c.x, centre[1] - c.y)


def split_adjacent(rng: random.Random, centre: tuple[float, float], area_m2: float):
    """One parent field cut by a wavy border into west and east plots that share the border exactly."""
    from shapely import affinity
    from shapely.geometry import LineString, Polygon
    from shapely.ops import split

    w, h = 100.0, 50.0
    pts = [(-w + rng.uniform(-6, 6), -h + rng.uniform(-4, 4)), (w + rng.uniform(-6, 6), -h + rng.uniform(-4, 4)),
           (w + rng.uniform(-6, 6), h + rng.uniform(-4, 4)), (-w + rng.uniform(-6, 6), h + rng.uniform(-4, 4))]
    parent = Polygon(chaikin(wobble_edges(pts, rng, 0.02), iterations=2, ratio=0.16))
    parent = affinity.rotate(parent, rng.gauss(0, 6), origin="centroid")
    parent = affinity.scale(parent, *(2 * [math.sqrt(area_m2 / parent.area)]), origin="centroid")
    c = parent.centroid
    parent = affinity.translate(parent, centre[0] - c.x, centre[1] - c.y)
    ys = [centre[1] - 120 + 40 * i for i in range(7)]
    border = chaikin([(centre[0] + rng.uniform(-7, 7), y) for y in ys], iterations=2, ratio=0.25, closed=False)
    pieces = sorted(split(parent, LineString(border)).geoms, key=lambda g: g.centroid.x)
    if len(pieces) != 2:
        raise RuntimeError("The A/B split line must cut the parent field into exactly two plots.")
    return pieces[0], pieces[1]


# --- land cover -------------------------------------------------------------------------------

class Cropland:
    """ESA WorldCover 2021 class lookup over the AOI, read once through Planetary Computer."""

    def __init__(self):
        import planetary_computer
        import pystac_client
        import rasterio
        from pyproj import Transformer
        from rasterio.windows import from_bounds

        self.to_wgs = Transformer.from_crs(UTM_EPSG, 4326, always_xy=True)
        lon0, lat0 = self.to_wgs.transform(AOI[0] - 200, AOI[1] - 200)
        lon1, lat1 = self.to_wgs.transform(AOI[2] + 200, AOI[3] + 200)
        catalog = pystac_client.Client.open("https://planetarycomputer.microsoft.com/api/stac/v1",
                                            modifier=planetary_computer.sign_inplace)
        item = catalog.get_collection(WORLDCOVER_COLLECTION).get_item(WORLDCOVER_ITEM)
        if item is None:
            raise RuntimeError(f"{WORLDCOVER_ITEM} not found in {WORLDCOVER_COLLECTION}.")
        with rasterio.open(item.assets["map"].href) as ds:
            win = from_bounds(lon0, lat0, lon1, lat1, ds.transform).round_offsets().round_lengths()
            self.classes = ds.read(1, window=win)
            self.inverse = ~ds.window_transform(win)
        self.item_id = item.id

    def fraction(self, poly, step: float = 12.0) -> float:
        from shapely.geometry import Point

        x0, y0, x1, y1 = poly.bounds
        hits = total = 0
        y = y0 + step / 2
        while y < y1:
            x = x0 + step / 2
            while x < x1:
                if poly.contains(Point(x, y)):
                    col, row = self.inverse * self.to_wgs.transform(x, y)
                    r, c = int(row), int(col)
                    inside = 0 <= r < self.classes.shape[0] and 0 <= c < self.classes.shape[1]
                    hits += inside and self.classes[r, c] == CROPLAND_CLASS
                    total += 1
                x += step
            y += step
        return hits / total if total else 0.0


# --- batch -----------------------------------------------------------------------------------

def _to_geometry(poly) -> dict:
    from pyproj import Transformer

    to_wgs = Transformer.from_crs(UTM_EPSG, 4326, always_xy=True)
    ring = []
    for x, y in poly.exterior.coords:
        lon, lat = to_wgs.transform(x, y)
        ring.append([round(lon, 6), round(lat, 6)])
    if ring[0] != ring[-1]:
        ring.append(ring[0])
    return {"type": "Polygon", "coordinates": [ring]}


def _feature(claim_id: str, season: str, info: dict, poly) -> dict:
    props = {"claim_id": claim_id, "season": season, "claimed_method": info["claimed_method"],
             "claimed_acres": info["claimed_acres"], "farmer_name": info["farmer_name"]}
    if info.get("reported_harvest_date"):
        props["reported_harvest_date"] = info["reported_harvest_date"]
        props["reported_harvest_date_source"] = "applicant_reported_fictional"
    return {"type": "Feature", "properties": props, "geometry": _to_geometry(poly)}


def build_batch(season: str) -> tuple[list[dict], dict]:
    """Return GeoJSON features for the whole demo batch and a layout summary for provenance."""
    rng = random.Random(LAYOUT_SEED)
    land = Cropland()
    placed = []

    def fits(poly) -> bool:
        x0, y0, x1, y1 = poly.bounds
        if x0 < AOI[0] + AOI_MARGIN_M or y0 < AOI[1] + AOI_MARGIN_M or x1 > AOI[2] - AOI_MARGIN_M or y1 > AOI[3] - AOI_MARGIN_M:
            return False
        grown = poly.buffer(PLOT_SPACING_M)
        return not any(grown.intersects(p) for p in placed) and land.fraction(poly) >= MIN_CROPLAND_FRACTION

    def place(area_m2: float, centre=None, tries: int = 400):
        for _ in range(tries):
            at = centre or (rng.uniform(AOI[0], AOI[2]), rng.uniform(AOI[1], AOI[3]))
            poly = make_plot(rng, at, area_m2)
            if fits(poly):
                placed.append(poly)
                return poly
        raise RuntimeError(f"Could not place a {area_m2:.0f} m² plot on cropland after {tries} tries.")

    a, b = split_adjacent(rng, AB_CENTRE, 2 * 2.5 * SQM_PER_ACRE)
    for poly in (a, b):
        if land.fraction(poly) < MIN_CROPLAND_FRACTION:
            raise RuntimeError("A/B parent field is not on cropland; move AB_CENTRE.")
    placed += [a, b]
    polys = {"A": a, "B": b, "C": place(0.4 * SQM_PER_ACRE, C_CENTRE)}
    polys["ARCHIVE"] = place(2.5 * SQM_PER_ACRE)
    for cid, info in REVIEW.items():
        polys[cid] = place(info["claimed_acres"] * SQM_PER_ACRE)

    features = [_feature(cid, season, FEATURED[cid], polys[cid]) for cid in FEATURED]
    features += [_feature(cid, season, REVIEW[cid], polys[cid]) for cid in REVIEW]
    for i in range(1, BACKGROUND_COUNT + 1):
        acres = round(math.exp(rng.uniform(math.log(0.9), math.log(4.5))), 1)
        poly = place(acres * SQM_PER_ACRE * rng.uniform(0.96, 1.04))
        info = {"claimed_method": "DSR" if rng.random() < BACKGROUND_DSR_SHARE else "PTR", "claimed_acres": acres,
                "farmer_name": f"{rng.choice(FIRST_NAMES)} {rng.choice(SURNAMES)}"}
        features.append(_feature(f"KNL-{i:03d}", season, info, poly))
    summary = {
        "aoi_utm43n": list(AOI), "seed": LAYOUT_SEED, "plots": len(features),
        "featured": list(FEATURED), "review": {k: v["role"] for k, v in REVIEW.items()},
        "background": BACKGROUND_COUNT,
        "placement": (f"Plots are placed where ESA WorldCover 2021 ({land.item_id}, class {CROPLAND_CLASS}) "
                      f"marks at least {MIN_CROPLAND_FRACTION:.0%} of the plot as cropland, with "
                      f"{PLOT_SPACING_M:g} m between plots. Shapes are illustrative, not surveyed parcels."),
    }
    return features, summary


def review_role(claim_id: str) -> str | None:
    info = REVIEW.get(claim_id)
    return info["role"] if info else None
