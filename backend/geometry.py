"""WGS84 polygon validation."""

import math

from shapely import GEOSException
from shapely.geometry import shape
from shapely.validation import explain_validity


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
