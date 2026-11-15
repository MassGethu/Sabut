"""GeoJSON validation and the shared evidence-cache identity."""

import hashlib
import json
import math

from shapely import GEOSException
from shapely.geometry import shape
from shapely.validation import explain_validity


def _normalize_numbers(value):
    if isinstance(value, dict):
        return {key: _normalize_numbers(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_normalize_numbers(item) for item in value]
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return value


def geometry_hash(geometry: dict) -> str:
    payload = json.dumps(
        _normalize_numbers(geometry), sort_keys=True, separators=(",", ":"), allow_nan=False
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def finite_number(value) -> bool:
    if type(value) not in (int, float):
        return False
    try:
        return math.isfinite(value)
    except OverflowError:
        return False


def _validate_polygon(polygon):
    if not isinstance(polygon, list) or not polygon:
        raise ValueError("Each polygon must contain at least one linear ring.")
    for ring in polygon:
        if not isinstance(ring, list) or len(ring) < 4:
            raise ValueError("A polygon ring must contain at least four positions.")
        for position in ring:
            if (
                not isinstance(position, list)
                or len(position) not in (2, 3)
                or not all(finite_number(value) for value in position)
                or not -180 <= position[0] <= 180
                or not -90 <= position[1] <= 90
            ):
                raise ValueError("Positions must contain finite WGS84 longitude and latitude, with optional altitude.")
        if ring[0] != ring[-1]:
            raise ValueError("Polygon rings must be closed.")


def validate_geometry(geometry) -> None:
    if not isinstance(geometry, dict) or geometry.get("type") not in ("Polygon", "MultiPolygon"):
        raise ValueError("Geometry must be a WGS84 Polygon or MultiPolygon.")
    coordinates = geometry.get("coordinates")
    polygons = [coordinates] if geometry["type"] == "Polygon" else coordinates
    if not isinstance(polygons, list) or not polygons:
        raise ValueError("Geometry must contain at least one polygon.")
    for polygon in polygons:
        _validate_polygon(polygon)
    try:
        boundary = shape(geometry)
    except (GEOSException, ValueError, TypeError) as exc:
        raise ValueError("The polygon coordinates could not form a boundary.") from exc
    if not boundary.is_valid or boundary.area <= 0:
        raise ValueError(f"Invalid plot boundary. {explain_validity(boundary)}.")
