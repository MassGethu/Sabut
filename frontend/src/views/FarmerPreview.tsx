import { useEffect, useState } from "react";
import { ApiError, api } from "../api/client";
import type { ClaimDetail, Language, ReviewReceipt } from "../api/types";
import { fmtLocal } from "../format";
import { FARMER_TEXT, LANGUAGE_NAME } from "../i18n/farmer";
import { actionLabel, statusLabel } from "../i18n/labels";

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
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [submit, setSubmit] = useState<Submit>({ state: "idle" });

  useEffect(() => {
    setSubmit({ state: "idle" });
    setReason("");
    setTouched(false);
  }, [detail?.claim_id]);

  if (!detail) {
    return (
      <div className="farmer-empty panel">
        <h2>Farmer preview</h2>
        <p>Load the demo batch in the officer workspace first.</p>
      </div>
    );
  }

  // The card reflects Meena's latest recorded action when there is one, else the server recommendation.
  const recorded = detail.actions.length ? detail.actions[detail.actions.length - 1] : null;
  const step = recorded ? recorded.action : detail.next_action;
  const status = t.status[detail.status];

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!reason.trim() || submit.state === "sending" || !detail) return;
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
      <aside className="farmer-controls panel">
        <h2>Farmer preview</h2>
        <p className="muted small">
          A local preview of the card a farmer would receive. Farmers and claims are fictional; correction requests are
          simulated but saved through the API.
        </p>
        <label className="field">
          <span>Claim</span>
          <select value={detail.claim_id} onChange={(e) => onClaim(e.target.value)}>
            {claims.map((c) => (
              <option key={c.claim_id} value={c.claim_id}>
                {c.claim_id} — {statusLabel(c.status)}
              </option>
            ))}
          </select>
        </label>
        <div className="field">
          <span>Language</span>
          <div className="seg" role="radiogroup" aria-label="Card language">
            {(["hi", "pa"] as Language[]).map((l) => (
              <button
                key={l}
                role="radio"
                aria-checked={language === l}
                className={language === l ? "on" : ""}
                onClick={() => onLanguage(l)}
                lang={l}
              >
                {LANGUAGE_NAME[l]}
              </button>
            ))}
          </div>
        </div>
        <div className="officer-gloss">
          <span className="eyebrow">Officer view of this card (English)</span>
          <p>
            Status: <strong>{statusLabel(detail.status)}</strong>
            <br />
            Shown next step: <strong>{actionLabel(step)}</strong> {recorded ? "(Meena's recorded action)" : "(recommendation; nothing recorded yet)"}
          </p>
        </div>
      </aside>

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
        </section>

        <section className="fc-next">
          <span className="eyebrow">{t.nextStepHeading}</span>
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
              <button type="button" key={p} className="chip" onClick={() => setReason(p)}>
                {p}
              </button>
            ))}
          </div>
          <label className="field">
            <span>{t.reasonLabel}</span>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t.reasonPlaceholder}
              aria-invalid={touched && !reason.trim()}
              disabled={submit.state === "sending"}
            />
          </label>
          {touched && !reason.trim() ? <p className="err-text small">{t.required}</p> : null}
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
    </div>
  );
}
