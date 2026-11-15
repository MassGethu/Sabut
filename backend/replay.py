"""Replay Sabūt and two baselines on the same visit candidates and budget."""

import argparse
import json
from pathlib import Path
import random
from tempfile import TemporaryDirectory

from . import storage
from .evidence import EvidenceCatalog, index_records
from .main import ROOT, settings_from_environment
from .policy import VISIT, build_queue, score_ambiguity


def _read(path):
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def select_visits(claims, catalog, budget, seed, settings):
    queue = build_queue(claims, budget, catalog, settings)
    candidates = {decision.item["claim_id"]: decision for decision in queue if decision.item["next_action"] == VISIT}
    ids = sorted(candidates)
    limit = min(budget, len(candidates))

    def score_order(claim_id):
        score = candidates[claim_id].score
        return (1, 0, claim_id) if score is None else (0, -score_ambiguity(score), claim_id)

    return ids, {
        "sabut": [decision.item["claim_id"] for decision in queue if decision.item["in_visit_budget"]],
        "seeded_random": random.Random(seed).sample(ids, limit),
        "score_only": sorted(ids, key=score_order)[:limit],
    }


def compare(candidate_ids, selections, outcomes, budget, seed, settings):
    missing = sorted(set(candidate_ids) - outcomes.keys())
    if missing:
        raise ValueError(f"Missing simulated inspection outcomes for: {', '.join(missing)}")
    methods = {}
    for name, ids in selections.items():
        labels = [outcomes[claim_id] for claim_id in ids]
        resolved = labels.count("resolved")
        corrected = labels.count("corrected")
        methods[name] = {
            "selected_claim_ids": ids,
            "selected_count": len(ids),
            "resolved": resolved,
            "corrected": corrected,
            "resolved_or_corrected": resolved + corrected,
            "denominator": len(ids),
        }
    return {
        "schema_version": 1,
        "outcome_source": "simulated",
        "budget": budget,
        "seed": seed,
        "candidate_pool_count": len(candidate_ids),
        "candidate_claim_ids": candidate_ids,
        "candidate_pool": "Claims eligible for a field visit under the API policy, before applying the visit budget.",
        "random_order": "Python seeded sampling without replacement from claim IDs sorted in ascending order.",
        "score_only_order": "Descending score ambiguity, then ascending claim ID. Unscored visit candidates come last by claim ID.",
        "acreage_multiplier": settings.acreage_multiplier,
        "methods": methods,
    }


def _outcomes(path):
    data = _read(path)
    if data["source_kind"] != "simulated" or not isinstance(data["outcomes"], dict):
        raise ValueError("Expected a separate simulated outcomes mapping keyed by claim ID.")
    outcomes = data["outcomes"]
    for label in outcomes.values():
        if label not in ("resolved", "corrected", "unresolved"):
            raise ValueError(f"Invalid simulated outcome: {label!r}")
    return outcomes


def _claims(path, database):
    storage.initialize(database)
    with storage.connect(database, write=True) as db:
        result = storage.import_claims(db, _read(path))
        if result["errors"] or not result["imported_ids"]:
            raise ValueError(f"Replay input has invalid claims: {result}")
        claims = storage.claims(db)
        if any(claim["claimed_acres"] is None for claim in claims):
            raise ValueError("Replay input claims must state claimed_acres.")
        return claims


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--claims", type=Path, default=ROOT / "demo" / "replay-claims.geojson")
    parser.add_argument("--evidence", type=Path, default=ROOT / "demo" / "replay-evidence.json")
    parser.add_argument("--outcomes", type=Path, default=ROOT / "demo" / "replay-outcomes.json")
    parser.add_argument("--output", type=Path, default=ROOT / "reports" / "replay.json")
    parser.add_argument("--budget", type=int, default=1)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    if args.budget < 0:
        parser.error("--budget must be nonnegative.")
    try:
        settings = settings_from_environment()
        simulation = index_records(_read(args.evidence), "simulated")
        if not simulation:
            raise ValueError("Expected simulated replay evidence records keyed to the replay claims.")
        catalog = EvidenceCatalog({}, simulation)
        with TemporaryDirectory(prefix="sabut-replay-") as directory:
            claims = _claims(args.claims, Path(directory) / "replay.sqlite3")
        if any(catalog.for_claim(claim)[1] is None for claim in claims):
            raise ValueError("Every replay claim needs a matching claim ID, season and geometry hash in the evidence.")
        ids, selections = select_visits(claims, catalog, args.budget, args.seed, settings)
        outcomes = _outcomes(args.outcomes)
        report = compare(ids, selections, outcomes, args.budget, args.seed, settings)
    except (OSError, ValueError, KeyError, TypeError) as exc:
        parser.exit(1, f"Replay failed: {exc}\n")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {args.output} for {len(ids)} eligible claims and a budget of {args.budget}.")


if __name__ == "__main__":
    main()
