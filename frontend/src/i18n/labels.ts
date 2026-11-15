import type { ActionValue, Status } from "../api/types";

/** UI labels exactly as specified in CONTRACT.md. */
export const STATUS_LABEL: Record<Status, string> = {
  ready_for_desk_review: "Ready for desk review",
  field_check_recommended: "Field check recommended",
  insufficient_evidence: "Insufficient evidence",
};

export const ACTION_LABEL: Record<ActionValue, string> = {
  desk_review: "Desk review",
  request_field_visit: "Request field visit",
  request_boundary_correction: "Request boundary correction",
  request_records: "Request records",
};

export const ACTION_VALUES: ActionValue[] = [
  "desk_review",
  "request_field_visit",
  "request_boundary_correction",
  "request_records",
];

export function statusLabel(s: string): string {
  return STATUS_LABEL[s as Status] ?? s;
}

export function actionLabel(a: string): string {
  return ACTION_LABEL[a as ActionValue] ?? a;
}

export function sourceLabel(kind: string | undefined | null): string {
  if (kind === "sentinel1_real") return "Real Sentinel-1";
  if (kind === "simulated") return "Simulated";
  return kind ?? "Unknown source";
}

export function humanize(code: string | null | undefined): string {
  if (!code) return "";
  return code.replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase());
}
