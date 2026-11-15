// In-memory stand-in for the FastAPI service, used only with `?fixtures`.
// Payloads were captured from the real backend (build/core) or written to the
// CONTRACT.md shapes. Allocation for each budget is taken from the captured
// server responses — this file does not implement the ranking policy.
import type { Api } from "../api/client";
import { ApiError } from "../api/client";
import type { ActionEvent, ClaimDetail, ImportResponse, QueueItem, ReviewReceipt } from "../api/types";
import queue0 from "./queue-0.json";
import queue1 from "./queue-1.json";
import claimA from "./claim-A.json";
import claimB from "./claim-B.json";
import claimC from "./claim-C.json";
import claimD from "./claim-D-uncached.json";
import importPartial from "./import-partial.json";
import benchmarkPending from "./benchmark-pending.json";
import { retrospectiveFixture, incompatibleFixture } from "./extraFixtures";

const delay = (ms = 250) => new Promise((r) => setTimeout(r, ms));
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

const details: Record<string, ClaimDetail> = {};
let loaded = false;
let nextId = 100;

function itemFields(d: ClaimDetail): QueueItem {
  const {
    claim_id, season, claimed_method, status, reason_code, reason, next_action,
    field_question, rank, rank_reason, claimed_acres, visit_priority, in_visit_budget,
  } = d;
  return {
    claim_id, season, claimed_method, status, reason_code, reason, next_action,
    field_question, rank, rank_reason, claimed_acres, visit_priority, in_visit_budget,
  };
}

function seed() {
  for (const c of [claimA, claimB, claimC, retrospectiveFixture, incompatibleFixture] as unknown as ClaimDetail[]) {
    details[c.claim_id] = clone(c);
  }
  loaded = true;
}

function allocation(budget: number): Record<string, Pick<QueueItem, "in_visit_budget">> {
  const source = (budget === 0 ? queue0 : queue1) as { items: QueueItem[] };
  return Object.fromEntries(source.items.map((i) => [i.claim_id, { in_visit_budget: i.in_visit_budget }]));
}

function snapshot(id: string, budget: number): QueueItem {
  const d = details[id];
  return { ...itemFields(d), ...(allocation(budget)[id] ?? {}) };
}

function queueOrder(): string[] {
  const captured = (queue1 as { items: QueueItem[] }).items.map((i) => i.claim_id);
  const rest = Object.keys(details).filter((id) => !captured.includes(id)).sort();
  return [...captured.filter((id) => details[id]), ...rest];
}

export const fixtureServer: Api = {
  mode: "fixtures",
  async health() {
    await delay(50);
    return { status: "ok" };
  },
  async loadDemo() {
    await delay();
    seed();
    return { imported_ids: ["A", "B", "C"], errors: [] };
  },
  async importClaims(geojson) {
    await delay();
    if (!geojson || typeof geojson !== "object" || (geojson as { type?: string }).type !== "FeatureCollection") {
      throw new ApiError(422, "The request body must be a GeoJSON FeatureCollection.");
    }
    // Uploads in fixture mode replay the captured partial-import response.
    if (!loaded) seed();
    details.D = clone(claimD) as unknown as ClaimDetail;
    return clone(importPartial) as ImportResponse;
  },
  async queue(budget) {
    await delay(150);
    if (budget < 0) throw new ApiError(422, "budget: Input should be greater than or equal to 0");
    return { budget, items: loaded ? queueOrder().map((id) => snapshot(id, budget)) : [] };
  },
  async claim(id, budget) {
    await delay(150);
    const d = details[id];
    if (!d) throw new ApiError(404, "Claim not found.");
    return { ...clone(d), ...snapshot(id, budget) };
  },
  async claims(budget) {
    await delay(150);
    if (budget < 0) throw new ApiError(422, "budget: Input should be greater than or equal to 0");
    const items = loaded ? queueOrder().filter((id) => details[id]).map((id) => ({ ...clone(details[id]), ...snapshot(id, budget) })) : [];
    return { budget, items };
  },
  async recordAction(id, budget, body) {
    await delay(500);
    const d = details[id];
    if (!d) throw new ApiError(404, "Claim not found.");
    if (body.reason.trim().toLowerCase() === "fail") throw new ApiError(500, "Simulated server error (fixture mode).");
    const event: ActionEvent = {
      id: nextId++,
      ...body,
      timestamp: new Date().toISOString(),
      overrides_recommendation: body.action !== d.next_action,
      recommendation: snapshot(id, budget),
    };
    d.actions.push(event);
    return clone(event);
  },
  async requestReview(id, body) {
    await delay(500);
    const d = details[id];
    if (!d) throw new ApiError(404, "Claim not found.");
    const receipt: ReviewReceipt = { id: nextId++, ...body, timestamp: new Date().toISOString(), simulated: true };
    d.review_requests.push(receipt);
    return clone(receipt);
  },
  async benchmark() {
    await delay(150);
    return clone(benchmarkPending);
  },
};
