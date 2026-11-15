// Types mirror CONTRACT.md and the examples Codex published in examples/api/.
// The UI displays these values; it never recomputes status, rank or allocation.

export type Status = "ready_for_desk_review" | "field_check_recommended" | "insufficient_evidence";
export type ActionValue =
  | "desk_review"
  | "request_field_visit"
  | "request_boundary_correction"
  | "request_records";
export type Language = "hi" | "pa" | "en";
export type SourceKind = "sentinel1_real" | "simulated";

export interface QueueItem {
  claim_id: string;
  season: string;
  claimed_method: "DSR" | "PTR" | string;
  status: Status;
  reason_code: string;
  reason: string;
  next_action: ActionValue;
  field_question?: string | null;
  rank: number | null;
  rank_reason: string | null;
  claimed_acres: number | null;
  visit_priority: number | null;
  in_visit_budget: boolean;
}

export interface QueueResponse {
  budget: number;
  items: QueueItem[];
}

export interface ClaimsResponse {
  budget: number;
  items: ClaimDetail[];
}

export interface ImportError {
  index: number;
  claim_id: string | null;
  message: string;
}

export interface ImportResponse {
  imported_ids: string[];
  errors: ImportError[];
}

export interface Observation {
  acquired_at: string;
  scene_id: string;
  vv: number | null;
  vh: number | null;
  valid_fraction: number | null;
  usable: boolean;
  reason: string | null;
}

export interface Gap {
  start: string;
  end: string;
  reason: string;
}

export type QualityFlag = string | { code?: string; detail?: string; message?: string; [k: string]: unknown };

export interface QualityGate {
  min_usable_dates: number;
  min_valid_fraction: number;
  max_gap_days: number;
  failed_criterion: string | null;
}

export interface ModelOutput {
  source_kind: SourceKind | string;
  model_version: string | null;
  feature_schema: string[] | null;
  compatible: boolean | null;
  compatibility_reason: string | null;
  dsr_score: number | null;
}

export interface EvidenceRecord {
  claim_id?: string;
  season?: string;
  geometry_hash?: string;
  source_kind: SourceKind | string;
  window: { start: string; end: string };
  processing_version: string;
  units: string;
  acquisition_settings: Record<string, unknown> | null;
  observations: Observation[];
  usable_count: number;
  gaps: Gap[];
  quality_flags: QualityFlag[];
  quality_gate?: QualityGate;
  model?: ModelOutput | null;
  [k: string]: unknown;
}

export interface Recommendation extends Partial<QueueItem> {
  evidence_source_kind?: string | null;
  model_version?: string | null;
  dsr_score?: number | null;
}

export interface ActionEvent {
  id: number | string;
  action: ActionValue;
  reason: string;
  actor: string;
  timestamp: string;
  overrides_recommendation: boolean;
  recommendation: Recommendation | null;
}

export interface ReviewReceipt {
  id: number | string;
  reason: string;
  language: Language;
  timestamp: string;
  simulated: boolean;
}

export interface ClaimDetail extends QueueItem {
  geometry: GeoJSON.Geometry;
  farmer_name?: string | null;
  evidence: EvidenceRecord | null;
  real_evidence: EvidenceRecord | null;
  model: ModelOutput | null;
  reported_harvest_date: string | null;
  actions: ActionEvent[];
  review_requests: ReviewReceipt[];
}

export interface BenchmarkResponse {
  status: "ready" | "partial" | "pending" | string;
  benchmark: Record<string, unknown> | null;
  replay: Record<string, unknown> | null;
  message: string | null;
}
