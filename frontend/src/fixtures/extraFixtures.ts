// Hand-written, contract-shaped fixtures for states the captured backend batch
// does not yet cover. Scene IDs are prefixed FIXTURE- so they can never be
// mistaken for real Sentinel-1 products.
import type { ClaimDetail, Observation } from "../api/types";

function obs(dates: string[], start: { vv: number; vh: number }, step: { vv: number; vh: number }): Observation[] {
  return dates.map((d, i) => ({
    acquired_at: `${d}T00:52:14Z`,
    scene_id: `FIXTURE-S1A-IW-GRDH-${d.replaceAll("-", "")}`,
    vv: +(start.vv + step.vv * i).toFixed(2),
    vh: +(start.vh + step.vh * i).toFixed(2),
    valid_fraction: 0.97,
    usable: true,
    reason: null,
  }));
}

const realDates = ["2024-06-04", "2024-06-16", "2024-06-28", "2024-07-10", "2024-07-22", "2024-08-03", "2024-08-15", "2024-08-27"];

export const retrospectiveFixture: ClaimDetail = {
  claim_id: "R",
  season: "Kharif 2024",
  claimed_method: "DSR",
  claimed_acres: 3.0,
  status: "insufficient_evidence",
  reason_code: "unscored_evidence",
  reason:
    "Usable radar observations are available. No verified compatible score is cached. Request dated sowing records.",
  next_action: "request_records",
  field_question: null,
  rank: null,
  rank_reason: null,
  visit_priority: null,
  in_visit_budget: false,
  geometry: {
    type: "Polygon",
    coordinates: [[[76.9025, 29.7], [76.9035, 29.7], [76.9035, 29.701], [76.9025, 29.701], [76.9025, 29.7]]],
  },
  farmer_name: null,
  reported_harvest_date: "2024-10-18",
  evidence: {
    claim_id: "R",
    season: "Kharif 2024",
    source_kind: "sentinel1_real",
    window: { start: "2024-06-01", end: "2024-09-05" },
    processing_version: "fixture-rtc-v0",
    units: "dB",
    acquisition_settings: {
      provider: "Fixture (shape only)",
      coefficient: "gamma0",
      orbit_direction: "ascending",
      relative_orbit: 27,
      polarizations: ["VV", "VH"],
      reducer: "mean of linear power, converted to dB",
    },
    observations: [
      ...obs(realDates.slice(0, 3), { vv: -15.8, vh: -23.1 }, { vv: 1.1, vh: 0.9 }),
      {
        acquired_at: "2024-07-10T00:52:14Z",
        scene_id: "FIXTURE-S1A-IW-GRDH-20240710",
        vv: null,
        vh: null,
        valid_fraction: 0.38,
        usable: false,
        reason: "Valid plot coverage is below 70% or unavailable.",
      },
      ...obs(realDates.slice(4), { vv: -11.2, vh: -18.0 }, { vv: 0.6, vh: 0.5 }),
    ],
    usable_count: 7,
    gaps: [],
    quality_flags: [],
    quality_gate: { min_usable_dates: 5, min_valid_fraction: 0.7, max_gap_days: 24, failed_criterion: null },
    model: {
      source_kind: "sentinel1_real",
      model_version: null,
      feature_schema: null,
      compatible: null,
      compatibility_reason: "Feature parity with the Ricemapper training export has not been verified.",
      dsr_score: null,
    },
  },
  real_evidence: null,
  model: {
    source_kind: "sentinel1_real",
    model_version: null,
    feature_schema: null,
    compatible: null,
    compatibility_reason: "Feature parity with the Ricemapper training export has not been verified.",
    dsr_score: null,
  },
  actions: [],
  review_requests: [],
};

export const incompatibleFixture: ClaimDetail = {
  ...retrospectiveFixture,
  claim_id: "X",
  claimed_acres: 1.4,
  reason_code: "incompatible_export",
  reason:
    "The export uses sigma0 while the model expects gamma0 terrain-corrected backscatter. Request dated sowing records.",
  reported_harvest_date: null,
  geometry: {
    type: "Polygon",
    coordinates: [[[76.8995, 29.7015], [76.9001, 29.7015], [76.9001, 29.7021], [76.8995, 29.7021], [76.8995, 29.7015]]],
  },
  evidence: {
    ...retrospectiveFixture.evidence!,
    claim_id: "X",
    processing_version: "fixture-grd-sigma0-v0",
    model: {
      source_kind: "sentinel1_real",
      model_version: "ricemapper-dsr-lgb-fixture",
      feature_schema: ["VV_mean", "VH_mean", "VH_VV_ratio"],
      compatible: false,
      compatibility_reason: "The export uses sigma0 while the model expects gamma0 terrain-corrected backscatter.",
      dsr_score: null,
    },
  },
  model: {
    source_kind: "sentinel1_real",
    model_version: "ricemapper-dsr-lgb-fixture",
    feature_schema: ["VV_mean", "VH_mean", "VH_VV_ratio"],
    compatible: false,
    compatibility_reason: "The export uses sigma0 while the model expects gamma0 terrain-corrected backscatter.",
    dsr_score: null,
  },
};
