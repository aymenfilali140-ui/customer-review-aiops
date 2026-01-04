"use client";

import React, { useEffect, useMemo, useState } from "react";
import { getReviews, getVerticalsConfig } from "../../lib/api";
import { Card, SectionTitle, Select, Button } from "../ui";

type ReviewsResp = {
  count: number;
  filters?: any;
  items: Array<{
    id: string;
    raw_id: string;
    vertical: string;
    created_at: string;
    analyzed_at: string;
    overall_sentiment: string;
    aspects_json: any;
  }>;
};

export default function ReviewsPage() {
  const [days, setDays] = useState<number>(30);
  const [vertical, setVertical] = useState<string>("groceries");
  const [verticalOptions, setVerticalOptions] = useState<string[]>(["groceries"]);

  const [stakeholder, setStakeholder] = useState<string>("");
  const [aspect, setAspect] = useState<string>("");
  const [sentiment, setSentiment] = useState<string>(""); // optional; backend may ignore

  const [limit, setLimit] = useState<number>(25);
  const [offset, setOffset] = useState<number>(0);

  const [data, setData] = useState<ReviewsResp | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [err, setErr] = useState<string>("");

  // Load vertical options from config
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

  // Reset pagination when major filters change
  useEffect(() => {
    setOffset(0);
  }, [vertical, days, stakeholder, aspect, sentiment, limit]);

  // Fetch reviews
  useEffect(() => {
    if (!vertical) return;

    (async () => {
      setLoading(true);
      setErr("");
      try {
        const r = await getReviews(vertical, limit, offset, {
          days,
          stakeholder: stakeholder || undefined,
          aspect: aspect || undefined,
          sentiment: sentiment || undefined,
        });
        setData(r);
      } catch (e: any) {
        setErr(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [vertical, days, stakeholder, aspect, sentiment, limit, offset]);

  const items = useMemo(() => {
    const base = data?.items ?? [];
    // If backend doesn't support sentiment filtering yet, keep UI useful by filtering client-side too.
    if (!sentiment) return base;
    return base.filter((r) => r.overall_sentiment === sentiment);
  }, [data, sentiment]);

  const totalCount = data?.count ?? 0;
  const pageFrom = totalCount ? offset + 1 : 0;
  const pageTo = Math.min(offset + limit, totalCount);

  const canPrev = offset > 0;
  const canNext = offset + limit < totalCount;

  const clearFilters = () => {
    setStakeholder("");
    setAspect("");
    setSentiment("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -0.2 }}>Reviews</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            Browse enriched reviews with filters and pagination.
          </div>
        </div>

        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
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
              options={[
                { label: "All time", value: 0 },
                { label: "Last 7 days", value: 7 },
                { label: "Last 30 days", value: 30 },
                { label: "Last 90 days", value: 90 },
                { label: "Last 365 days", value: 365 },
              ]}
            />
            <Select
              label="Sentiment"
              value={sentiment}
              onChange={(v) => setSentiment(v)}
              options={[
                { label: "All", value: "" },
                { label: "Negative", value: "Negative" },
                { label: "Positive", value: "Positive" },
                { label: "Neutral", value: "Neutral" },
              ]}
            />
            <Select
              label="Page size"
              value={String(limit)}
              onChange={(v) => setLimit(Number(v))}
              options={[
                { label: "25", value: 25 },
                { label: "50", value: 50 },
                { label: "100", value: 100 },
              ]}
            />

            {loading ? <span style={{ fontSize: 12, color: "var(--muted)" }}>Loading…</span> : null}
            {err ? <span style={{ fontSize: 12, color: "var(--brand-red)", fontWeight: 800 }}>{err}</span> : null}
          </div>
        </Card>
      </div>

      <Card>
        <SectionTitle title="Filters" subtitle="(Optional) Type filters; we can upgrade to dropdowns once we have config-driven lists." />
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "var(--muted)" }}>
            Stakeholder
            <input
              value={stakeholder}
              onChange={(e) => setStakeholder(e.target.value)}
              placeholder="e.g. operations"
              style={inputStyle}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "var(--muted)" }}>
            Aspect
            <input
              value={aspect}
              onChange={(e) => setAspect(e.target.value)}
              placeholder="e.g. app_experience"
              style={inputStyle}
            />
          </label>

          <Button variant="secondary" onClick={clearFilters} disabled={!stakeholder && !aspect && !sentiment}>
            Clear filters
          </Button>

          <div style={{ marginLeft: "auto", fontSize: 12, color: "var(--muted)", fontWeight: 800 }}>
            Showing {pageFrom}–{pageTo} of {totalCount}
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle title="Review feed" subtitle="Expand a row to see extracted aspects and evidence." />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
          <Button variant="secondary" onClick={() => setOffset((o) => Math.max(0, o - limit))} disabled={!canPrev}>
            Previous
          </Button>
          <Button variant="secondary" onClick={() => setOffset((o) => o + limit)} disabled={!canNext}>
            Next
          </Button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map((r) => (
            <ReviewCard key={r.id} r={r} />
          ))}

          {!loading && items.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--muted)" }}>No reviews match the current filters.</div>
          ) : null}
        </div>
      </Card>
    </div>
  );
}

function ReviewCard({ r }: { r: ReviewsResp["items"][0] }) {
  const summaryText = r.aspects_json?.overall_summary ?? "";
  const mentioned = r.aspects_json?.mentioned_aspects ?? [];
  const badge = sentimentBadge(r.overall_sentiment);

  return (
    <details style={{ border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: 12, background: "rgba(255,255,255,0.9)" }}>
      <summary style={{ cursor: "pointer", listStyle: "none" as any, display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            borderRadius: 999,
            padding: "4px 10px",
            fontWeight: 900,
            fontSize: 12,
            border: "1px solid rgba(0,0,0,0.08)",
            background: badge.bg,
            color: badge.fg,
          }}
        >
          {r.overall_sentiment}
        </span>

        <span style={{ color: "var(--muted)", fontSize: 12 }}>{new Date(r.created_at).toLocaleString()}</span>
        <span style={{ fontWeight: 800, fontSize: 13, flex: 1 }}>{summaryText || "(No summary)"}</span>
      </summary>

      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        {mentioned.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {mentioned.map((m: any, idx: number) => (
              <div key={idx} style={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 14, padding: 10, background: "var(--surface)" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 900 }}>{m.aspect}</span>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>{m.stakeholder}</span>
                  <span style={{ fontSize: 12, fontWeight: 900, color: m.sentiment === "Negative" ? "var(--brand-red)" : m.sentiment === "Positive" ? "var(--ok)" : "var(--muted)" }}>
                    {m.sentiment}
                  </span>
                </div>
                <div style={{ marginTop: 6, color: "#333", fontSize: 13 }}>“{m.evidence}”</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "var(--muted)" }}>No aspects extracted.</div>
        )}
      </div>
    </details>
  );
}

function sentimentBadge(sentiment: string) {
  if (sentiment === "Negative") return { bg: "var(--neg-bg)", fg: "var(--neg)" };
  if (sentiment === "Positive") return { bg: "var(--ok-bg)", fg: "var(--ok)" };
  return { bg: "var(--neu-bg)", fg: "var(--neu)" };
}

const inputStyle: React.CSSProperties = {
  height: 38,
  padding: "0 12px",
  borderRadius: 999,
  border: "1px solid var(--border)",
  background: "rgba(255,255,255,0.9)",
  outline: "none",
  fontSize: 13,
  minWidth: 220,
};
