"""Evidence-based next actions and the shared visit ordering."""

from dataclasses import dataclass, field
from decimal import Decimal

from .evidence import QualitySettings, assess_observations
from .geometry import finite_number


VISIT = "request_field_visit"
FIELD_QUESTION = (
    "Was rice seeded directly into this plot, or were seedlings transplanted? "
    "Ask for the establishment date and any sowing or transplanting records."
)


@dataclass(frozen=True)
class PolicySettings:
    quality: QualitySettings = field(default_factory=QualitySettings)
    acreage_multiplier: float = 4000


@dataclass
class Decision:
    item: dict
    evidence: dict | None = None
    model: dict | None = None
    real_evidence: dict | None = None

    @property
    def score(self):
        return self.model["dsr_score"] if self.model else None


def _recommendation(status, code, reason, action, question=None):
    return {
        "status": status, "reason_code": code, "reason": reason,
        "next_action": action, "field_question": question,
    }


def _insufficient(code, reason, action="request_records"):
    return _recommendation("insufficient_evidence", code, reason, action)


def _visit(code, reason, question=FIELD_QUESTION):
    return _recommendation("field_check_recommended", code, reason, VISIT, question)


def _thresholds(manifest):
    if not isinstance(manifest, dict):
        return None
    thresholds = manifest.get("validation_thresholds")
    if not isinstance(thresholds, dict):
        return None
    ptr = thresholds.get("ptr_max_score")
    dsr = thresholds.get("dsr_min_score")
    if finite_number(ptr) and finite_number(dsr) and 0 <= ptr < dsr <= 1:
        return ptr, dsr
    return None


def _processing_verified(record, manifest):
    profiles = manifest.get("compatible_exports")
    acquisition = record.get("acquisition_settings")
    if not isinstance(profiles, list) or not isinstance(acquisition, dict):
        return False
    fields = ("processing_version", "window", "units", "feature_processing")
    if any(not record.get(field) for field in fields):
        return False
    for profile in profiles:
        if not isinstance(profile, dict) or any(profile.get(field) != record[field] for field in fields):
            continue
        expected = profile.get("acquisition_settings")
        if isinstance(expected, dict) and expected and all(acquisition.get(key) == value for key, value in expected.items()):
            return True
    return False


def _checked_model(record, manifest, failure):
    source = record.get("model")
    if not isinstance(source, dict):
        return None, None
    score = source.get("dsr_score")
    model = {**source, "dsr_score": None}
    if failure:
        return model, None
    if source.get("compatible") is not True:
        return model, None
    if not finite_number(score) or not 0 <= score <= 1:
        model.update(compatibility_reason="The cache has no finite DSR model score between zero and one.", compatible=False)
        return model, None

    if record["source_kind"] == "simulated" and source.get("source_kind") == "simulated":
        model["dsr_score"] = score
        return model, (0.25, 0.75)

    thresholds = _thresholds(manifest)
    schema = source.get("feature_schema")
    version = source.get("model_version")
    if (
        record["source_kind"] == "sentinel1_real"
        and source.get("source_kind") == "sentinel1_real"
        and thresholds
        and isinstance(version, str) and version and version == manifest.get("model_version")
        and isinstance(schema, list) and schema and schema == manifest.get("feature_schema")
        and _processing_verified(record, manifest)
    ):
        model["dsr_score"] = score
        return model, thresholds

    model.update(
        compatibility_reason="The export's processing profile, model version, ordered feature schema or validation thresholds could not be verified against the local manifest.",
        compatible=False,
    )
    return model, None


def _evaluate(claim, record, manifest, settings):
    evidence, failure = assess_observations(record, settings.quality)
    model, thresholds = _checked_model(evidence, manifest, failure)
    evidence["model"] = model
    if failure:
        return _insufficient(failure["criterion"], failure["reason"], failure["next_action"]), evidence, model
    if not thresholds:
        manual_reason = record.get("manual_visit_reason")
        manual_question = record.get("field_question")
        if all(isinstance(text, str) and text.strip() for text in (manual_reason, manual_question)):
            return _visit("manual_visit_reason", manual_reason, manual_question), evidence, model
        compatibility_reason = model.get("compatibility_reason") if model else record.get("compatibility_reason")
        if isinstance(compatibility_reason, str) and compatibility_reason.strip():
            return _insufficient("incompatible_export", f"{compatibility_reason.rstrip('. ')}. Request dated sowing records."), evidence, model
        return _insufficient(
            "unscored_evidence",
            "Usable radar observations are available. No verified compatible score is cached. Request dated sowing records.",
        ), evidence, model

    ptr_max, dsr_min = thresholds
    score = model["dsr_score"]
    supported = "DSR" if score >= dsr_min else "PTR" if score <= ptr_max else None
    if supported == claim["claimed_method"]:
        recommendation = _recommendation(
            "ready_for_desk_review", "score_supports_claim",
            f"The model score supports the claimed {supported} method. Review the claim and records at the desk.",
            "desk_review",
        )
    elif supported is None:
        recommendation = _visit("ambiguous_sowing_signal", "The model score is in the review range for both sowing methods.")
    else:
        recommendation = _visit("score_disagrees_with_claim", f"The model score supports {supported}. The submitted claim says {claim['claimed_method']}.")
    return recommendation, evidence, model


def decide(claim, catalog, settings):
    real, simulation = catalog.for_claim(claim)
    real_result = _evaluate(claim, real, catalog.model_manifest, settings) if real is not None else None
    simulation_result = _evaluate(claim, simulation, catalog.model_manifest, settings) if simulation is not None else None
    real_has_score = real_result is not None and real_result[2] is not None and real_result[2]["dsr_score"] is not None
    chosen = real_result if real_has_score or simulation_result is None else simulation_result
    additional_real = real_result[1] if real_result is not None and chosen is simulation_result else None

    if chosen is None:
        recommendation, evidence, model = _insufficient(
            "uncached_evidence",
            "This claim ID, season and boundary have no cached radar evidence. Request dated sowing records or obtain a matching extraction.",
        ), None, None
    else:
        recommendation, evidence, model = chosen
    item = {
        **{key: claim.get(key) for key in ("claim_id", "season", "claimed_method", "claimed_acres")},
        **recommendation,
        "rank": None, "rank_reason": None, "visit_priority": None, "in_visit_budget": False,
    }
    return Decision(item, evidence, model, additional_real)


def score_ambiguity(score):
    return Decimal(1) - 2 * abs(Decimal(str(score)) - Decimal("0.5"))


def _json_number(amount):
    if amount == amount.to_integral_value():
        return int(amount)
    return float(amount)


def rank_visits(decisions, budget, settings):
    eligible = []
    for decision in decisions:
        item = decision.item
        if item["next_action"] != VISIT:
            continue
        if decision.score is None:
            eligible.append((2, Decimal(0), item["claim_id"], decision, None, item["reason"]))
            continue
        uncertainty = score_ambiguity(decision.score)
        acres = item["claimed_acres"]
        if acres is None:
            reason = "Rank uses score ambiguity. The application has no stated acreage."
            eligible.append((1, -uncertainty, item["claim_id"], decision, None, reason))
            continue
        priority = uncertainty * Decimal(str(acres)) * Decimal(str(settings.acreage_multiplier))
        reason = f"Priority uses score ambiguity × {acres:g} claimed acres × {settings.acreage_multiplier:g}."
        eligible.append((0, -priority, item["claim_id"], decision, _json_number(priority), reason))

    eligible.sort(key=lambda entry: entry[:3])
    for rank, (_, _, _, decision, priority, reason) in enumerate(eligible, start=1):
        decision.item.update(
            rank=rank, rank_reason=reason, visit_priority=priority, in_visit_budget=rank <= budget,
        )
    remaining = sorted(
        (decision for decision in decisions if decision.item["next_action"] != VISIT),
        key=lambda decision: decision.item["claim_id"],
    )
    return [entry[3] for entry in eligible] + remaining


def build_queue(claims, budget, catalog, settings):
    decisions = [decide(claim, catalog, settings) for claim in claims]
    return rank_visits(decisions, budget, settings)
