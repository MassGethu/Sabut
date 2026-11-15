import { useEffect, useRef, useState } from "react";
import { ApiError, api } from "../api/client";
import type { ClaimDetail, Language, ReviewReceipt } from "../api/types";
import { fmtLocal } from "../format";
import { FARMER_TEXT, LANGUAGE_NAME } from "../i18n/farmer";
import { actionLabel, statusLabel } from "../i18n/labels";
import { PhoneMessage } from "../components/PhoneMessage";

interface Props {
  claims: ClaimDetail[];
  claimId: string | null;
  language: Language;
  onLanguage: (l: Language) => void;
  onClaim: (id: string) => void;
  onSubmitted: (claimId: string, receipt: ReviewReceipt) => void;
  onOpenOfficer: (claimId: string, receiptId: string | number) => void;
}

type Submit =
  | { state: "idle" }
  | { state: "sending" }
  | { state: "sent"; receipt: ReviewReceipt }
  | { state: "error"; message: string };

export function FarmerPreview({ claims, claimId, language, onLanguage, onClaim, onSubmitted, onOpenOfficer }: Props) {
  const t = FARMER_TEXT[language];
  const detail = claims.find((c) => c.claim_id === claimId) ?? claims[0] ?? null;
  const reasonInput = useRef<HTMLTextAreaElement>(null);
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [submit, setSubmit] = useState<Submit>({ state: "idle" });
  const [mode, setMode] = useState<"card" | "phone">("card");

  useEffect(() => {
    setSubmit({ state: "idle" });
    setReason("");
    setTouched(false);
  }, [detail?.claim_id]);

  if (!detail) {
    return (
      <div className="farmer-empty panel">
        <h1>Farmer Preview</h1>
        <p>Load the demo batch in the officer workspace first.</p>
      </div>
    );
  }

  // The card reflects Meena's latest recorded action when there is one, else the server recommendation.
  const recorded = detail.actions.length ? detail.actions[detail.actions.length - 1] : null;
  const step = recorded ? recorded.action : detail.next_action;
  const overridden = recorded !== null && recorded.action !== detail.next_action;
  const status = t.status[detail.status];

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (submit.state === "sending" || !detail) return;
    if (!reason.trim()) {
      reasonInput.current?.focus();
      return;
    }
    setSubmit({ state: "sending" });
    try {
      const receipt = await api.requestReview(detail.claim_id, { reason: reason.trim(), language });
      setSubmit({ state: "sent", receipt });
      setReason("");
      setTouched(false);
      onSubmitted(detail.claim_id, receipt);
    } catch (err) {
      setSubmit({ state: "error", message: err instanceof ApiError ? err.message : String(err) });
    }
  }

  return (
    <div className="farmer-layout">
      <section className="farmer-controls panel" aria-label="Preview settings">
        <h1>Farmer Preview</h1>
        <p className="muted small">
          A local preview of the card a farmer would receive. Farmers and claims are fictional; correction requests are
          simulated but saved through the API.
        </p>
        <div className="preview-settings">
          <label className="field">
            <span>Claim</span>
            <select name="claim" value={detail.claim_id} onChange={(e) => onClaim(e.target.value)}>
              {claims.map((c) => (
                <option key={c.claim_id} value={c.claim_id}>
                  {c.claim_id} — {statusLabel(c.status)}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="field language-field">
            <legend>Language</legend>
            <div className="seg">
              {(["hi", "pa", "en"] as const).map((l) => (
                <label key={l} className={language === l ? "on" : ""} lang={l}>
                  <input type="radio" name="card-language" value={l} checked={language === l} onChange={() => onLanguage(l)} />
                  {LANGUAGE_NAME[l]}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="field language-field">
            <legend>Show as</legend>
            <div className="seg">
              {(["card", "phone"] as const).map((m) => (
                <label key={m} className={mode === m ? "on" : ""}>
                  <input type="radio" name="farmer-mode" value={m} checked={mode === m} onChange={() => setMode(m)} />
                  {m === "card" ? "Card" : "Phone"}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        <details className="officer-gloss">
          <summary>Officer view of this card (English)</summary>
          <p>
            Satellite review status: <strong>{statusLabel(detail.status)}</strong>
            <br />
            Shown next step: <strong>{actionLabel(step)}</strong> {recorded ? (overridden ? "(Meena's override of the recommendation)" : "(Meena's recorded action)") : "(recommendation; nothing recorded yet)"}
          </p>
        </details>
      </section>

      {mode === "phone" ? (
        <PhoneMessage
          t={t}
          language={language}
          detail={detail}
          step={step}
          overridden={overridden}
          recordedAt={recorded?.timestamp ?? null}
          reason={reason}
          onReason={setReason}
          sending={submit.state === "sending"}
          error={submit.state === "error" ? submit.message : null}
          latest={submit.state === "sent" ? submit.receipt : null}
          onSend={send}
        />
      ) : (
      <article className={`farmer-card lang-${language}`} lang={language} aria-label="Farmer evidence card">
        <header className="fc-head">
          <div>
            <span className="fc-brand">सबूत · ਸਬੂਤ · Sabūt</span>
            <h2>{t.cardTitle}</h2>
          </div>
          <span className="fc-sim">{t.simulatedNote}</span>
        </header>
        <dl className="fc-facts">
          <div>
            <dt>{t.claim}</dt>
            <dd>{detail.claim_id}</dd>
          </div>
          <div>
            <dt>{t.season}</dt>
            <dd>{detail.season}</dd>
          </div>
          <div>
            <dt>{t.claimedMethod}</dt>
            <dd>
              {t.methods[detail.claimed_method] ?? detail.claimed_method}
              {detail.claimed_acres !== null ? ` · ${t.acres(detail.claimed_acres)}` : ""}
            </dd>
          </div>
        </dl>

        <section className={`fc-status fc-${detail.status}`}>
          <span className="eyebrow">{t.statusHeading}</span>
          <h3>{status.title}</h3>
          <p>{status.body}</p>
          {overridden ? <p className="fc-override">{t.officerOverride}</p> : null}
        </section>

        <section className="fc-next">
          <span className="eyebrow">{recorded ? t.officerNextHeading : t.nextStepHeading}</span>
          <p className="fc-next-text">{t.nextStep[step]}</p>
          <p className="fc-recorded small">
            {recorded ? (
              <>
                {t.officerRecorded}: {fmtLocal(recorded.timestamp)}
              </>
            ) : (
              t.officerPending
            )}
          </p>
          {step === "request_field_visit" ? (
            <div className="fc-question">
              <span className="eyebrow">{t.fieldQuestionHeading}</span>
              <p>{t.fieldQuestion}</p>
            </div>
          ) : null}
        </section>

        <section className="fc-rights">
          <span className="eyebrow">{t.rightsHeading}</span>
          <p>{t.rights}</p>
        </section>

        <form className="fc-form" onSubmit={send}>
          <h3>{t.formHeading}</h3>
          <p className="small">{t.formIntro}</p>
          <div className="fc-presets">
            {t.presets.map((p) => (
              <button type="button" key={p} className="chip" aria-pressed={reason === p} disabled={submit.state === "sending"} onClick={() => setReason(p)}>
                {p}
              </button>
            ))}
          </div>
          <label className="field">
            <span>{t.reasonLabel}</span>
            <textarea
              ref={reasonInput}
              name="reason"
              autoComplete="off"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t.reasonPlaceholder}
              aria-required="true"
              aria-invalid={touched && !reason.trim()}
              aria-describedby={touched && !reason.trim() ? "farmer-reason-error" : undefined}
              disabled={submit.state === "sending"}
            />
          </label>
          {touched && !reason.trim() ? <p className="err-text small" id="farmer-reason-error" role="alert">{t.required}</p> : null}
          <button className="btn btn-primary" type="submit" disabled={submit.state === "sending"}>
            {submit.state === "sending" ? t.submitting : t.submit}
          </button>
          {submit.state === "error" ? (
            <p className="err-text" role="alert" lang="en">
              Not sent: {submit.message}
            </p>
          ) : null}
        </form>

        {submit.state === "sent" ? (
          <section className="fc-receipt" role="status">
            <h3>✓ {t.receiptHeading}</h3>
            <dl>
              <div>
                <dt>{t.receiptId}</dt>
                <dd className="mono">#{submit.receipt.id}</dd>
              </div>
              <div>
                <dt>{t.receiptTime}</dt>
                <dd>{fmtLocal(submit.receipt.timestamp)}</dd>
              </div>
              <div>
                <dt>{t.receiptLanguage}</dt>
                <dd>{LANGUAGE_NAME[submit.receipt.language]}</dd>
              </div>
            </dl>
            <p className="small">“{submit.receipt.reason}”</p>
            {submit.receipt.simulated ? <p className="fc-sim-tag small">{t.receiptSimulated}</p> : null}
            <button
              type="button"
              className="btn btn-ghost"
              lang="en"
              onClick={() => onOpenOfficer(detail.claim_id, submit.receipt.id)}
            >
              See it in Meena's workspace →
            </button>
          </section>
        ) : null}

        {detail.review_requests.length ? (
          <section className="fc-previous">
            <span className="eyebrow">{t.previous}</span>
            <ul>
              {[...detail.review_requests].reverse().map((r) => (
                <li key={r.id}>
                  <span className="mono">#{r.id}</span> · {fmtLocal(r.timestamp)} · {LANGUAGE_NAME[r.language]} — “{r.reason}”
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </article>
      )}
    </div>
  );
}
