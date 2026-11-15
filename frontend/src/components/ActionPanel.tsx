import { useEffect, useState } from "react";
import { ApiError, api } from "../api/client";
import type { ActionEvent, ActionValue, ClaimDetail, ReviewReceipt } from "../api/types";
import { fmtLocal } from "../format";
import { LANGUAGE_NAME } from "../i18n/farmer";
import { ACTION_VALUES, actionLabel, statusLabel } from "../i18n/labels";
import { Tag } from "./Badges";

interface Props {
  detail: ClaimDetail;
  budget: number;
  onSaved: (event: ActionEvent) => void;
  highlightReceiptId?: string | number | null;
}

type Submit =
  | { state: "idle" }
  | { state: "saving" }
  | { state: "saved"; event: ActionEvent }
  | { state: "error"; message: string };

export function ActionPanel({ detail, budget, onSaved, highlightReceiptId }: Props) {
  const [action, setAction] = useState<ActionValue>(detail.next_action);
  const [reason, setReason] = useState("");
  const [actor, setActor] = useState("Meena");
  const [submit, setSubmit] = useState<Submit>({ state: "idle" });
  const [touched, setTouched] = useState(false);

  // Reset the form when Meena switches claims.
  useEffect(() => {
    setAction(detail.next_action);
    setReason("");
    setSubmit({ state: "idle" });
    setTouched(false);
  }, [detail.claim_id, detail.next_action]);

  const isOverride = action !== detail.next_action;
  const reasonMissing = !reason.trim();
  const current = detail.actions.length ? detail.actions[detail.actions.length - 1] : null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (reasonMissing || !actor.trim() || submit.state === "saving") return;
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
      <div className="panel-head">
        <h3 id="action-h">Meena's decision</h3>
        <span className="muted small">Officer-owned. Sabūt recommends; it never approves, rejects or pays.</span>
      </div>

      <div className="current-row">
        <div>
          <span className="eyebrow">Recommendation</span>
          <strong>{actionLabel(detail.next_action)}</strong>
          <span className="muted small"> · {statusLabel(detail.status)}</span>
        </div>
        <div>
          <span className="eyebrow">Current recorded action</span>
          {current ? (
            <>
              <strong>{actionLabel(current.action)}</strong>
              {current.overrides_recommendation ? <Tag tone="warn">Override</Tag> : null}
              <span className="muted small">
                {" "}
                · {current.actor}, {fmtLocal(current.timestamp)}
              </span>
            </>
          ) : (
            <span className="muted">None recorded yet</span>
          )}
        </div>
      </div>

      <form onSubmit={save} className="action-form">
        <fieldset disabled={submit.state === "saving"}>
          <legend className="sr-only">Action</legend>
          <div className="action-options">
            {ACTION_VALUES.map((a) => (
              <label key={a} className={`action-opt ${action === a ? "on" : ""}`}>
                <input type="radio" name="action" value={a} checked={action === a} onChange={() => setAction(a)} />
                <span>{actionLabel(a)}</span>
                {a === detail.next_action ? <small className="rec">recommended</small> : null}
              </label>
            ))}
          </div>
          {isOverride ? (
            <p className="override-note" role="note">
              <strong>Override.</strong> The recommendation is “{actionLabel(detail.next_action)}”. Your reason is
              recorded with the recommendation snapshot.
              {action === "request_field_visit" && !detail.in_visit_budget
                ? " This claim is outside the suggested visit allocation; an officer may still send a visit."
                : ""}
            </p>
          ) : null}
          <div className="form-row">
            <label className="field grow">
              <span>Reason {isOverride ? "for override" : ""} (required)</span>
              <textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={
                  action === "request_field_visit" && detail.field_question
                    ? `e.g. ${detail.field_question.split("?")[0]}?`
                    : "Why are you taking this action?"
                }
                aria-invalid={touched && reasonMissing}
              />
              {touched && reasonMissing ? <small className="err-text">A reason is required for every action.</small> : null}
            </label>
            <label className="field actor">
              <span>Officer</span>
              <input value={actor} onChange={(e) => setActor(e.target.value)} />
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

  return (
    <div className="history">
      <h4>
        History <span className="muted small">({actions.length} officer action{actions.length === 1 ? "" : "s"}, {requests.length} farmer request{requests.length === 1 ? "" : "s"})</span>
      </h4>
      {!entries.length ? <p className="muted small">No recorded events for this claim.</p> : null}
      <ol className="timeline">
        {entries.map((en) =>
          en.kind === "action" ? (
            <li key={`a${en.e.id}`} className="tl-action">
              <div className="tl-head">
                <strong>{actionLabel(en.e.action)}</strong>
                {en.e.overrides_recommendation ? <Tag tone="warn">Override</Tag> : <Tag tone="good">Follows recommendation</Tag>}
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
    </div>
  );
}
