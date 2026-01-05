const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000";

async function getJSON<T>(path: string): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export function getSummary(vertical: string, days: number) {
  return getJSON(`/metrics/summary?vertical=${encodeURIComponent(vertical)}&days=${days}`);
}

export async function getTrend(vertical: string, days: number, bucket?: "day" | "week" | "month") {
  const base = process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000";
  const url =
    `${base}/metrics/trend` +
    `?vertical=${encodeURIComponent(vertical)}` +
    `&days=${encodeURIComponent(String(days))}` +
    `&bucket=${encodeURIComponent(bucket)}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export function getAspects(vertical: string, days: number) {
  return getJSON(`/metrics/aspects?vertical=${encodeURIComponent(vertical)}&days=${days}`);
}

export function getReviews(
  vertical: string,
  limit = 50,
  offset = 0,
  opts?: { aspect?: string; stakeholder?: string; sentiment?: string }
) {
  const params = new URLSearchParams({
    vertical,
    limit: String(limit),
    offset: String(offset),
  });

  if (opts?.aspect) params.set("aspect", opts.aspect);
  if (opts?.stakeholder) params.set("stakeholder", opts.stakeholder);
  if (opts?.sentiment) params.set("sentiment", opts.sentiment);

  return getJSON(`/reviews?${params.toString()}`);
}


export function getVerticalsConfig() {
  return getJSON(`/config/verticals`);
}

export async function runPipeline(params?: {
  vertical?: string;
  pages?: number;
  count?: number;
  batch?: number;
}) {
  const res = await fetch(`${API_BASE}/pipeline/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params ?? {}),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ job_id: string }>;
}

export async function getPipelineJob(jobId: string) {
  const res = await fetch(`${API_BASE}/pipeline/jobs/${jobId}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{
    id: string;
    state: "queued" | "running" | "succeeded" | "failed";
    created_at: string;
    started_at?: string | null;
    finished_at?: string | null;
    return_code?: number | null;
    error?: string | null;
    log_tail: string;
  }>;
}
export async function getAspectOptions(vertical: string, days: number) {
  const base = process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000";
  const url = new URL(`${base}/options/aspects`);
  url.searchParams.set("vertical", vertical);
  url.searchParams.set("days", String(days));
  const r = await fetch(url.toString());
  if (!r.ok) throw new Error(`getAspectOptions failed: ${r.status}`);
  return r.json();
}
