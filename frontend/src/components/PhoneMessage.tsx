import { useEffect, useRef } from "react";
import type { ActionValue, ClaimDetail, Language, ReviewReceipt } from "../api/types";
import type { FARMER_TEXT } from "../i18n/farmer";
import { fmtLocal } from "../format";

interface Props {
  t: (typeof FARMER_TEXT)[Language];
  language: Language;
  detail: ClaimDetail;
  step: ActionValue;
  overridden: boolean;
  recordedAt: string | null;
  reason: string;
  onReason: (r: string) => void;
  sending: boolean;
  error: string | null;
  latest: ReviewReceipt | null;
  onSend: (e: React.FormEvent) => void;
}

/**
 * The same farmer notice as a chat message on a phone: what the satellite review
 * found, what happens next, and a reply box to contest it. Replies go through the
 * same review-request API as the card form.
 */
export function PhoneMessage({ t, language, detail, step, overridden, recordedAt, reason, onReason, sending, error, latest, onSend }: Props) {
  const status = t.status[detail.status];
  const replies = [...detail.review_requests];
  if (latest && !replies.some((r) => String(r.id) === String(latest.id))) replies.push(latest);
  const thread = useRef<HTMLDivElement>(null);
  const count = replies.length;

  // Show the newest reply and its receipt once a correction request is sent.
  useEffect(() => {
    const el = thread.current;
    if (el && count) el.scrollTop = el.scrollHeight;
  }, [count]);

  return (
    <div className="phone" lang={language} aria-label="Farmer notice as a phone message">
      <div className="phone-notch" aria-hidden="true" />
      <header className="phone-bar">
        <span className="phone-avatar" aria-hidden="true">स</span>
        <div>
          <strong>{t.msgSender}</strong>
          <span className="phone-sub">{t.simulatedNote}</span>
        </div>
      </header>

      <div className="phone-thread" ref={thread}>
        <div className="bubble in">
          <strong className="bubble-title">{t.cardTitle}</strong>
          <p className="bubble-facts">
            {t.claim}: {detail.claim_id} · {detail.season}
            <br />
            {t.methods[detail.claimed_method] ?? detail.claimed_method}
            {detail.claimed_acres !== null ? ` · ${t.acres(detail.claimed_acres)}` : ""}
          </p>
          <p>
            <b>{status.title}</b>
            <br />
            {status.body}
          </p>
          {overridden ? <p className="bubble-note">{t.officerOverride}</p> : null}
          <p>
            <b>{t.nextStepHeading}:</b> {t.nextStep[step]}
          </p>
          {step === "request_field_visit" ? (
            <p>
              <b>{t.fieldQuestionHeading}:</b> {t.fieldQuestion}
            </p>
          ) : null}
          {recordedAt ? <span className="bubble-time">{fmtLocal(recordedAt)}</span> : null}
        </div>

        <div className="bubble in">
          <p>{t.rights}</p>
          <p>
            <b>{t.msgHowToContest}</b>
          </p>
        </div>

        {replies.map((r) => (
          <div key={r.id} className="phone-pair">
            <div className="bubble out">
              <p>{r.reason}</p>
              <span className="bubble-time">{fmtLocal(r.timestamp)} ✓✓</span>
            </div>
            <div className="bubble in">
              <p>{t.msgReceipt(r.id)}</p>
            </div>
          </div>
        ))}
      </div>

      <form className="phone-compose" onSubmit={onSend}>
        <div className="phone-quick">
          {t.presets.map((p) => (
            <button type="button" key={p} className="quick" aria-pressed={reason === p} disabled={sending} onClick={() => onReason(p)}>
              {p}
            </button>
          ))}
        </div>
        <div className="phone-input">
          <input
            name="phone-reason"
            autoComplete="off"
            value={reason}
            onChange={(e) => onReason(e.target.value)}
            placeholder={t.msgReplyPlaceholder}
            aria-label={t.reasonLabel}
            disabled={sending}
          />
          <button type="submit" className="phone-send" disabled={sending || !reason.trim()} aria-label={t.submit}>
            {sending ? "…" : "➤"}
          </button>
        </div>
        {error ? (
          <p className="err-text small" role="alert" lang="en">
            Not sent: {error}
          </p>
        ) : null}
      </form>
    </div>
  );
}
