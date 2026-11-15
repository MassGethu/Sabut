"""Canonical evidence-cache geometry digest shared by producers and importers."""

import hashlib
import json


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
