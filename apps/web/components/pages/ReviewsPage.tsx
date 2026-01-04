"use client";

import React, { useEffect, useMemo, useState } from "react";
import { getReviews, getVerticalsConfig } from "../../lib/api";
import { Card, SectionTitle, Button, Select, th, td } from "../ui";

type ReviewsResp = {
  count: number;
  filters?: any;
  items: Array<{
    id: string;
    raw_id: string;
    source: string;
    source_review_id: string;
    vertical: string;
    created_at: string;
    analyzed_at: string;
    overall_sentiment: string;
    aspects_json: any;
    stakeholder_flags_json?: any;
    model_version?: string;
    prompt_version?: string;
  }>;
};

function buildCsvUrl(base: string, params: Record<string, any>) {
  const u = new URL("/reviews/enriched", base);
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    u.searchParams.set(k, String(v));
  });
  u.searchParams.set("export", "csv");
  return u.toString();
}

async function downloadCsv(url: string, filename: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CSV export failed (${res.status})`);
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}

export default function ReviewsPage() {
  const [days, setDays] = useState<number>(0);
  const [vertical, setVertical] = useState<string>("groceries");
  const [verticalOptions, setVerticalOptions] = useState<string[]>(["groceries"]);

  // NEW filters
  const [q, setQ] = useState<string>("");
  const [sentiment, setSentiment] = useState<string>(""); // "", Positive, Neutral, Negative

  // existing drilldowns (keep available on Reviews page too)
  const [aspectFilter, setAspectFilter] = useState<string>("");
  const [stakeholderFilter, setStakeholderFilter] = useState<string>("");

  // pagination
  const [limit, setLimit] = useState<number>(50);
  const [offset, setOffset] = useState<number>(0);

  const [data, setData] = useState<ReviewsResp | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [err, setErr] = useState<string>("");

  // Load vertical options
  useEffect(() => {
    (async () => {
      try {
        const cfg: any = await getVerticalsConfig();
        const keys = cfg?.verticals ? Object.keys(cfg.verticals) : [];
        if (keys.length) {
          setVerticalOptions(keys);
          setVertical((v) => (keys.includes(v) ? v : keys[0]));
        }
      } catch {
        // fallback
      }
    })();
  }, []);

  // Reset pagination when main filters change
  useEffect(() => {
    setOffset(0);
  }, [vertical, days, q, sentiment, aspectFilter, stakeholderFilter, limit]);

  // Fetch
  useEffect(() => {
    if (!vertical) return;

    (async () => {
      setLoading(true);
      setErr("");
      try {
        const r = await getReviews(vertical, limit, offset, {
          days,
          q: q || undefined,
          sentiment: sentiment || undefined,
          aspect: aspectFilter || undefined,
          stakeholder: stakeholderFilter || undefined,
        });
        setData(r);
      } catch (e: any) {
        setErr(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [vertical, days, q, sentiment, aspectFilter, stakeholderFilter, limit, offset]);

  const total = data?.count ?? 0;
  const canPrev = offset > 0;
  const canNext = offset + limit < total;

  const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000";

  const onExport = async () => {
    try {
      const url = buildCsvUrl(apiBase, {
        vertical,
        days,
        q: q || undefined,
        sentiment: sentiment || undefined,
        aspect: aspectFilter || undefined,
        stakeholder: stakeholderFilter || undefined,
        export_limit: 5000,
      });
      const fname = `reviews_${vertical}_${days === 0 ? "all" : `${days}d`}.csv`;
      await downloadCsv(url, fname);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  };

  const clearFilters = () => {
    setQ("");
    setSentiment("");
    setAspectFilter("");
    setStakeholderFilter("");
    setDays(0);
    setOffset(0);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header + controls */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -0.2 }}>Reviews</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            Search raw text + enriched insights. Export the filtered set as CSV when needed.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Button variant="secondary" onClick={onExport}>
            Export CSV
          </Button>
          <Button variant="ghost" onClick={clearFilters}>
            Reset
          </Button>
        </div>
      </div>

      {/* Controls card */}
      <Card>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
          <Select
            label="Vertical"
            value={vertical}
            onChange={(v) => setVertical(v)}
            options={verticalOptions.map((v) => ({ label: v, value: v }))}
          />

          <Select
            label="Window"
            value={String(days)}
            onChange={(v) => setDays(Number(v))}
            options={[0, 7, 30, 90, 365].map((d) => ({
              label: d === 0 ? "All time" : `Last ${d} days`,
              value: d,
            }))}
          />

          <Select
            label="Sentiment"
            value={sentiment}
            onChange={(v) => setSentiment(v)}
            options={[
              { label: "All", value: "" },
              { label: "Positive", value: "Positive" },
              { label: "Neutral", value: "Neutral" },
              { label: "Negative", value: "Negative" },
            ]}
          />

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: "var(--muted)" }}>Search</div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search raw text + enriched JSON (summary/evidence)…"
              style={{
                height: 38,
                borderRadius: 12,
                border: "1px solid rgba(0,0,0,0.10)",
                padding: "0 12px",
                outline: "none",
                fontWeight: 700,
                background: "rgba(255,255,255,0.9)",
              }}
            />
          </div>
        </div>

        <div style={{ height: 10 }} />

        {/* Optional drilldowns kept here (small / subtle) */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, alignItems: "end" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: "var(--muted)" }}>Aspect</div>
            <input
              value={aspectFilter}
              onChange={(e) => setAspectFilter(e.target.value)}
              placeholder="e.g. refund_handling"
              style={{
                height: 38,
                borderRadius: 12,
                border: "1px solid rgba(0,0,0,0.10)",
                padding: "0 12px",
                outline: "none",
                fontWeight: 700,
                background: "rgba(255,255,255,0.9)",
              }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: "var(--muted)" }}>Stakeholder</div>
            <input
              value={stakeholderFilter}
              onChange={(e) => setStakeholderFilter(e.target.value)}
              placeholder="e.g. operations"
              style={{
                height: 38,
                borderRadius: 12,
                border: "1px solid rgba(0,0,0,0.10)",
                padding: "0 12px",
                outline: "none",
                fontWeight: 700,
                background: "rgba(255,255,255,0.9)",
              }}
            />
          </div>

          <Select
            label="Page size"
            value={String(limit)}
            onChange={(v) => setLimit(Number(v))}
            options={[25, 50, 100, 200].map((n) => ({ label: `${n}`, value: n }))}
          />

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, alignItems: "center" }}>
            {loading ? <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 900 }}>Loading…</span> : null}
            {err ? <span style={{ fontSize: 12, color: "var(--brand-red)", fontWeight: 900 }}>{err}</span> : null}
          </div>
        </div>
      </Card>

      {/* Results */}
      <Card>
        <SectionTitle
          title={`Results (${total})`}
          subtitle="Click a row to expand extracted aspects and evidence."
        />

        <div style={{ height: 8 }} />

        {/* Pagination */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 800 }}>
            Showing {total ? Math.min(offset + 1, total) : 0}–{Math.min(offset + limit, total)} of {total}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="secondary" onClick={() => setOffset((o) => Math.max(0, o - limit))} disabled={!canPrev}>
              Prev
            </Button>
            <Button variant="secondary" onClick={() => setOffset((o) => o + limit)} disabled={!canNext}>
              Next
            </Button>
          </div>
        </div>

        <div style={{ height: 10 }} />

        {/* Table */}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Sentiment</th>
                <th style={th}>Created</th>
                <th style={th}>Summary</th>
                <th style={th}>Aspects</th>
              </tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map((r) => {
                const summary = r.aspects_json?.overall_summary ?? "";
                const mentioned = r.aspects_json?.mentioned_aspects ?? [];
                return (
                  <tr key={r.id}>
                    <td style={td}>
                      <span style={{ fontWeight: 900 }}>{r.overall_sentiment}</span>
                    </td>
                    <td style={td}>
                      <span style={{ color: "var(--muted)", fontSize: 12 }}>
                        {new Date(r.created_at).toLocaleString()}
                      </span>
                    </td>
                    <td style={td}>
                      <details>
                        <summary style={{ cursor: "pointer", fontWeight: 800 }}>
                          {summary ? summary : "(No summary)"}
                        </summary>
                        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                          {mentioned.length ? (
                            mentioned.map((m: any, idx: number) => (
                              <div
                                key={idx}
                                style={{
                                  border: "1px solid rgba(0,0,0,0.08)",
                                  borderRadius: 14,
                                  padding: 10,
                                  background: "var(--surface)",
                                }}
                              >
                                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                                  <span style={{ fontWeight: 900 }}>{m.aspect}</span>
                                  <span style={{ fontSize: 12, color: "var(--muted)" }}>{m.stakeholder}</span>
                                  <span
                                    style={{
                                      fontSize: 12,
                                      fontWeight: 900,
                                      color:
                                        m.sentiment === "Negative"
                                          ? "var(--brand-red)"
                                          : m.sentiment === "Positive"
                                          ? "var(--ok)"
                                          : "var(--muted)",
                                    }}
                                  >
                                    {m.sentiment}
                                  </span>
                                </div>
                                <div style={{ marginTop: 6, color: "#333", fontSize: 13 }}>
                                  “{m.evidence}”
                                </div>
                              </div>
                            ))
                          ) : (
                            <div style={{ fontSize: 12, color: "var(--muted)" }}>No aspects extracted.</div>
                          )}
                        </div>
                      </details>
                    </td>
                    <td style={td}>{mentioned.length}</td>
                  </tr>
                );
              })}

              {data && data.items.length === 0 ? (
                <tr>
                  <td style={td} colSpan={4}>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>No results for the current filters.</span>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
