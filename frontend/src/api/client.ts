import type {
  ActionEvent,
  ActionValue,
  BenchmarkResponse,
  ClaimDetail,
  ImportResponse,
  Language,
  QueueResponse,
  ReviewReceipt,
} from "./types";
import { fixtureServer } from "../fixtures/fixtureServer";

/** Error raised for a non-2xx response, carrying FastAPI's `detail`. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function detailText(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    // FastAPI 422 validation errors: [{loc, msg, ...}]
    return detail
      .map((d) => {
        if (d && typeof d === "object" && "msg" in d) {
          const loc = Array.isArray((d as { loc?: unknown[] }).loc)
            ? (d as { loc: unknown[] }).loc.filter((p) => p !== "body").join(".")
            : "";
          return loc ? `${loc}: ${(d as { msg: string }).msg}` : (d as { msg: string }).msg;
        }
        return String(d);
      })
      .join("; ");
  }
  return "";
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Cannot reach the Sabūt API. Check that the local FastAPI service is running.");
  }
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const detail = data && typeof data === "object" ? detailText((data as { detail?: unknown }).detail) : "";
    throw new ApiError(res.status, detail || `The API returned ${res.status} ${res.statusText}.`);
  }
  return data as T;
}

export interface Api {
  mode: "live" | "fixtures";
  health(): Promise<{ status: string }>;
  importClaims(geojson: unknown): Promise<ImportResponse>;
  loadDemo(): Promise<ImportResponse>;
  queue(budget: number): Promise<QueueResponse>;
  claim(id: string, budget: number): Promise<ClaimDetail>;
  recordAction(
    id: string,
    budget: number,
    body: { action: ActionValue; reason: string; actor: string },
  ): Promise<ActionEvent>;
  requestReview(id: string, body: { reason: string; language: Language }): Promise<ReviewReceipt>;
  benchmark(): Promise<BenchmarkResponse>;
}

const enc = encodeURIComponent;

const liveApi: Api = {
  mode: "live",
  health: () => request("GET", "/health"),
  importClaims: (geojson) => request("POST", "/claims/import", geojson),
  loadDemo: () => request("POST", "/demo/load"),
  queue: (budget) => request("GET", `/queue?budget=${budget}`),
  claim: (id, budget) => request("GET", `/claims/${enc(id)}?budget=${budget}`),
  recordAction: (id, budget, body) => request("POST", `/claims/${enc(id)}/actions?budget=${budget}`, body),
  requestReview: (id, body) => request("POST", `/claims/${enc(id)}/review-requests`, body),
  benchmark: () => request("GET", "/benchmark"),
};

/** `?fixtures` in the URL (or VITE_FIXTURES=1) runs the UI against captured, contract-shaped payloads. */
export function useFixtures(): boolean {
  if (import.meta.env.VITE_FIXTURES === "1") return true;
  return new URLSearchParams(window.location.search).has("fixtures");
}

export const api: Api = useFixtures() ? fixtureServer : liveApi;
