import { useEffect, useRef, useState } from "react";
import { ApiError, api } from "../api/client";
import type { ActionEvent, ActionValue, ClaimDetail, ReviewReceipt } from "../api/types";
import { fmtLocal } from "../format";
import { LANGUAGE_NAME } from "../i18n/farmer";
import { ACTION_VALUES, actionLabel, statusLabel } from "../i18n/labels";
import { Tag } from "./Badges";

interface Props {
  detail: ClaimDetail;
  budget: number;
  actor: string;
  onActorChange: (actor: string) => void;
  onSaved: (event: ActionEvent) => void;
  highlightReceiptId?: string | number | null;
}

type Submit =
  | { state: "idle" }
  | { state: "saving" }
  | { state: "saved"; event: ActionEvent }
  | { state: "error"; message: string };

export function ActionPanel({ detail, budget, actor, onActorChange, onSaved, highlightReceiptId }: Props) {
  const [action, setAction] = useState<ActionValue>(detail.next_action);
  const [reason, setReason] = useState("");
  const [submit, setSubmit] = useState<Submit>({ state: "idle" });
  const [touched, setTouched] = useState(false);
  const reasonInput = useRef<HTMLTextAreaElement>(null);
  const actorInput = useRef<HTMLInputElement>(null);

  // Reset the form when Meena switches claims.
  useEffect(() => {
    setAction(detail.next_action);
    setReason("");
    setSubmit({ state: "idle" });
    setTouched(false);
  }, [detail.claim_id, detail.next_action]);

  const isOverride = action !== detail.next_action;
  const reasonMissing = !reason.trim();
  const actorMissing = !actor.trim();
  const current = detail.actions.length ? detail.actions[detail.actions.length - 1] : null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (submit.state === "saving") return;
    if (reasonMissing || actorMissing) {
      (reasonMissing ? reasonInput.current : actorInput.current)?.focus();
      return;
    }
    setSubmit({ state: "saving" });
    try {
      const event = await api.recordAction(detail.claim_id, budget, {
        action,
        reason: reason.trim(),
        actor: actor.trim(),
      });
      setSubmit({ state: "saved", event });
      setReason("");
      setTouched(false);
      onSaved(event);
    } catch (err) {
      setSubmit({
        state: "error",
        message: err instanceof ApiError ? err.message : "The action could not be saved.",
      });
    }
  }

  return (
    <section className="panel action-panel" aria-labelledby="action-h">
      <h2 id="action-h" tabIndex={-1}>Meena's decision</h2>
      <p className="muted small action-sub">Sabūt recommends. Meena decides; approval and payment stay outside the app.</p>

      <div className="current-row">
        <span className="eyebrow">Recorded action</span>
        {current ? (
          <span>
            <strong>{actionLabel(current.action)}</strong>
            {current.overrides_recommendation ? <Tag tone="warn">Override</Tag> : null}
            <span className="muted small"> · {current.actor}, {fmtLocal(current.timestamp)}</span>
          </span>
        ) : (
          <span className="muted">None yet</span>
        )}
      </div>

      <form onSubmit={save} className="action-form">
        <fieldset disabled={submit.state === "saving"}>
          <legend className="sr-only">Action</legend>
          <div className="action-options">
            {ACTION_VALUES.map((a) => (
              <label key={a} className={`action-opt ${action === a ? "on" : ""}`}>
                <input type="radio" name="action" value={a} checked={action === a} onChange={() => setAction(a)} />
                <span className="radio-dot" aria-hidden />
                <span>{actionLabel(a)}</span>
                {a === detail.next_action ? <small className="rec">Recommended</small> : null}
              </label>
            ))}
          </div>
          {isOverride ? (
            <p className="override-note" role="note">
              <strong>Override</strong> of “{actionLabel(detail.next_action)}”. Your reason is saved with the recommendation.
              {action === "request_field_visit" && !detail.in_visit_budget ? " This claim is outside the suggested visits." : ""}
            </p>
          ) : null}
          <div className="form-row">
            <label className="field grow">
              <span>Reason {isOverride ? "for override" : ""} (required)</span>
              <textarea
                ref={reasonInput}
                name="reason"
                autoComplete="off"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={
                  action === "request_field_visit" && detail.field_question
                    ? `e.g. ${detail.field_question.split("?")[0]}?`
                    : "Why are you taking this action?"
                }
                aria-required="true"
                aria-invalid={touched && reasonMissing}
                aria-describedby={touched && reasonMissing ? "decision-reason-error" : undefined}
              />
              {touched && reasonMissing ? <small className="err-text" id="decision-reason-error" role="alert">A reason is required for every action.</small> : null}
            </label>
            <label className="field actor">
              <span className="actor-field">
                <span>Officer</span>
                <input
                  ref={actorInput}
                  name="actor"
                  autoComplete="off"
                  value={actor}
                  onChange={(e) => onActorChange(e.target.value)}
                  aria-required="true"
                  aria-invalid={touched && actorMissing}
                  aria-describedby={touched && actorMissing ? "decision-officer-error" : undefined}
                />
              </span>
              {touched && actorMissing ? <small className="err-text" id="decision-officer-error" role="alert">Enter the officer’s name.</small> : null}
            </label>
          </div>
          <div className="form-actions">
            <button type="submit" className={`btn ${isOverride ? "btn-warn" : "btn-primary"}`}>
              {submit.state === "saving"
                ? "Saving…"
                : isOverride
                  ? `Save override: ${actionLabel(action)}`
                  : `Save: ${actionLabel(action)}`}
            </button>
            {submit.state === "saved" ? (
              <span className="ok-text" role="status">
                Saved event #{submit.event.id} at {fmtLocal(submit.event.timestamp)}
                {submit.event.overrides_recommendation ? " (override recorded)" : ""}.
              </span>
            ) : null}
            {submit.state === "error" ? (
              <span className="err-text" role="alert">
                Not saved: {submit.message}
              </span>
            ) : null}
          </div>
        </fieldset>
      </form>

      <History actions={detail.actions} requests={detail.review_requests} highlightReceiptId={highlightReceiptId} />
    </section>
  );
}

type Entry = { kind: "action"; at: string; e: ActionEvent } | { kind: "request"; at: string; r: ReviewReceipt };

export function History({
  actions,
  requests,
  highlightReceiptId,
}: {
  actions: ActionEvent[];
  requests: ReviewReceipt[];
  highlightReceiptId?: string | number | null;
}) {
  const entries: Entry[] = [
    ...actions.map((e) => ({ kind: "action" as const, at: e.timestamp, e })),
    ...requests.map((r) => ({ kind: "request" as const, at: r.timestamp, r })),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  const [all, setAll] = useState(false);
  const highlighted = entries.findIndex((entry) => entry.kind === "request" && String(entry.r.id) === String(highlightReceiptId));
  const showAll = all || highlighted >= 3;
  const shown = showAll ? entries : entries.slice(0, 3);
  return (
    <div className="history">
      <h3>
        History <span className="muted small">· {actions.length} action{actions.length === 1 ? "" : "s"}, {requests.length} farmer request{requests.length === 1 ? "" : "s"}</span>
      </h3>
      {!entries.length ? <p className="muted small">No recorded events for this claim.</p> : null}
      <ol className="timeline">
        {shown.map((en) =>
          en.kind === "action" ? (
            <li key={`a${en.e.id}`} className="tl-action">
              <div className="tl-head">
                <strong>{actionLabel(en.e.action)}</strong>
                {en.e.overrides_recommendation ? <Tag tone="warn">Override</Tag> : <Tag tone="good">As recommended</Tag>}
                <span className="muted small">
                  #{en.e.id} · {en.e.actor} · {fmtLocal(en.e.timestamp)}
                </span>
              </div>
              <p className="tl-reason">“{en.e.reason}”</p>
              {en.e.recommendation ? (
                <p className="muted small">
                  Recommendation at the time: {statusLabel(String(en.e.recommendation.status ?? ""))} →{" "}
                  {actionLabel(String(en.e.recommendation.next_action ?? ""))}
                  {en.e.recommendation.rank ? ` · visit rank ${en.e.recommendation.rank}` : ""}
                  {en.e.recommendation.in_visit_budget ? " · in visit budget" : ""}
                </p>
              ) : null}
            </li>
          ) : (
            <li
              key={`r${en.r.id}`}
              tabIndex={String(highlightReceiptId) === String(en.r.id) ? -1 : undefined}
              className={`tl-request ${String(highlightReceiptId) === String(en.r.id) ? "tl-new" : ""}`}
            >
              <div className="tl-head">
                <strong>Farmer correction request</strong>
                {en.r.simulated ? <Tag tone="info">Simulated</Tag> : null}
                <Tag>{LANGUAGE_NAME[en.r.language] ?? en.r.language}</Tag>
                <span className="muted small">
                  Receipt #{en.r.id} · {fmtLocal(en.r.timestamp)}
                </span>
              </div>
              <p className="tl-reason" lang={en.r.language}>
                “{en.r.reason}”
              </p>
            </li>
          ),
        )}
      </ol>
      {entries.length > 3 && highlighted < 3 ? (
        <button className="link-btn small" onClick={() => setAll((v) => !v)}>
          {all ? "Show latest 3" : `Show all ${entries.length} events`}
        </button>
      ) : null}
    </div>
  );
}
