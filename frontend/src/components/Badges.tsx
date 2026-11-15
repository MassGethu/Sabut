import type { ReactNode } from "react";
import { sourceLabel, statusLabel } from "../i18n/labels";

export function StatusPill({ status, size = "md" }: { status: string; size?: "sm" | "md" }) {
  return <span className={`pill pill-${status} pill-${size}`}>{statusLabel(status)}</span>;
}

/** Provenance tag shown next to every chart and score. */
export function SourceTag({ kind, detail }: { kind: string | null | undefined; detail?: ReactNode }) {
  const cls = kind === "sentinel1_real" ? "src-real" : kind === "simulated" ? "src-sim" : "src-other";
  return (
    <span className={`source-tag ${cls}`}>
      <span className="source-dot" aria-hidden />
      {sourceLabel(kind)}
      {detail ? <span className="source-detail"> · {detail}</span> : null}
    </span>
  );
}

export function Tag({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "warn" | "good" | "info" | "bad" }) {
  return <span className={`tag tag-${tone}`}>{children}</span>;
}
