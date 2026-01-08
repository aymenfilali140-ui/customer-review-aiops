"use client";

import React, { useEffect, useMemo, useState } from "react";
import { getAspects, getReviews, getSummary, getTrend, getVerticalsConfig } from "../../lib/api";
import { Card, SectionTitle, Button, Select, Stat, th, td } from "../ui";

type SummaryResp = {
  filters: { vertical: string; days: number };
  total_reviews: number;
  sentiment_distribution: Record<string, number>;
  top_negative_aspects: Array<{ aspect: string; count: number }>;
  stakeholder_negative_counts: Array<{ stakeholder: string; count: number }>;
};

type TrendResp = {
  filters: { vertical: string; days: number; bucket?: string };
  series: Array<{ day: string; total: number; negative: number }>;
};

type AspectsResp = {
  filters: { vertical: string; days: number };
  items: Array<{ stakeholder: string; aspect: string; sentiment: string; count: number }>;
  aspect_totals: Array<{ aspect: string; count: number }>;
  stakeholder_totals: Array<{ stakeholder: string; count: number }>;
};

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

export default function OverviewPage() {
  const [days, setDays] = useState<number>(0);
  const [vertical, setVertical] = useState<string>("groceries");
  const [verticalOptions, setVerticalOptions] = useState<string[]>(["groceries"]);

  // Drilldown filters for the review feed
  const [aspectFilter, setAspectFilter] = useState<string>("");
  const [stakeholderFilter, setStakeholderFilter] = useState<string>("");

  const [summary, setSummary] = useState<SummaryResp | null>(null);
  const [trend, setTrend] = useState<TrendResp | null>(null);
  const [aspects, setAspects] = useState<AspectsResp | null>(null);
  const [reviews, setReviews] = useState<ReviewsResp | null>(null);

  const [loading, setLoading] = useState<boolean>(false);
  const [err, setErr] = useState<string>("");
  const [bucket, setBucket] = useState<"day" | "week" | "month">("week");

  // Load vertical options from config (fallback is groceries)
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
        // Keep fallback
      }
    })();
  }, []);

  // Reset drilldown on major filter change
  useEffect(() => {
    setAspectFilter("");
    setStakeholderFilter("");
  }, [vertical, days]);

  // Fetch summary/trend/aspects on vertical/days change
  useEffect(() => {
    if (!vertical) return;

    (async () => {
      setLoading(true);
      setErr("");
      try {
        const [s, t, a] = await Promise.all([
          getSummary(vertical, days),
          getTrend(vertical, days, bucket),
          getAspects(vertical, days),
        ]);
        setSummary(s);
        setTrend(t);
        setAspects(a);
      } catch (e: any) {
        setErr(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [vertical, days, bucket]);

  // Fetch reviews whenever drilldown changes
  useEffect(() => {
    if (!vertical) return;

    (async () => {
      try {
        const r = await getReviews(vertical, 50, 0, {
          aspect: aspectFilter || undefined,
          stakeholder: stakeholderFilter || undefined,
        });
        setReviews(r);
      } catch (e: any) {
        setErr(e?.message ?? String(e));
      }
    })();
  }, [vertical, aspectFilter, stakeholderFilter]);

  const total = summary?.total_reviews ?? 0;
  const negCount = summary?.sentiment_distribution?.Negative ?? 0;
  const posCount = summary?.sentiment_distribution?.Positive ?? 0;
  const neuCount = summary?.sentiment_distribution?.Neutral ?? 0;

  const negPct = total ? Math.round((negCount / total) * 100) : 0;

  const topNegAspect = summary?.top_negative_aspects?.[0]?.aspect ?? "-";
  const topNegStakeholder = summary?.stakeholder_negative_counts?.[0]?.stakeholder ?? "-";

  const drilldownActive = Boolean(aspectFilter || stakeholderFilter);

  const clearDrilldown = () => {
    setAspectFilter("");
    setStakeholderFilter("");
  };

  // Build a stakeholder x aspect matrix (negative counts only)
  const matrix = useMemo(() => {
    if (!aspects) return { stakeholders: [], aspects: [], cell: new Map<string, number>() };

    // 1) Only negative rows
    const negItems = aspects.items.filter((i) => i.sentiment === "Negative" && i.stakeholder && i.aspect);

    // 2) Build totals by stakeholder and by aspect (negative only)
    const stakeholderNegTotals = new Map<string, number>();
    const aspectNegTotals = new Map<string, number>();

    // 3) Build cell counts
    const cell = new Map<string, number>();

    for (const it of negItems) {
      const s = it.stakeholder;
      const a = it.aspect;
      const n = it.count ?? 0;

      stakeholderNegTotals.set(s, (stakeholderNegTotals.get(s) ?? 0) + n);
      aspectNegTotals.set(a, (aspectNegTotals.get(a) ?? 0) + n);

      const key = `${s}||${a}`;
      cell.set(key, (cell.get(key) ?? 0) + n);
    }

    // 4) Sort stakeholders by most negative signals (desc)
    const stakeholders = Array.from(stakeholderNegTotals.entries())
      .sort((x, y) => y[1] - x[1])
      .map(([name]) => name);

    // 5) Sort aspects by most negative signals (desc)
    const aspectsSorted = Array.from(aspectNegTotals.entries())
      .sort((x, y) => y[1] - x[1])
      .map(([name]) => name);

    // 6) Optional: cap to keep the table readable
    const MAX_ROWS = 10;
    const MAX_COLS = 10;

    return {
      stakeholders: stakeholders.slice(0, MAX_ROWS),
      aspects: aspectsSorted.slice(0, MAX_COLS),
      cell,
    };
  }, [aspects]);


  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header row (page title + controls) */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -0.2 }}>Overview</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            Review intelligence across verticals — filters drive all KPIs and drilldowns.
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
              options={[0, 7, 30, 90, 365].map((d) => ({
                label: d === 0 ? "All time" : `Last ${d} days`,
                value: d,
              }))}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {loading ? <span style={{ fontSize: 12, color: "var(--muted)" }}>Loading…</span> : null}
              {err ? (
                <span style={{ fontSize: 12, color: "var(--brand-red)", fontWeight: 800 }}>{err}</span>
              ) : null}
            </div>
          </div>
        </Card>
      </div>

      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(200px, 1fr))", gap: 12 }}>
        <Stat
          title="Total reviews"
          value={String(total)}
          hint={`Positive ${posCount} · Neutral ${neuCount} · Negative ${negCount}`}
        />
        <Stat
          title="Negative reviews"
          value={`${negCount} (${negPct}%)`}
          hint="Counts are based on enriched reviews in the selected window."
        />
        <Stat title="Top negative aspect" value={topNegAspect} hint="Click an aspect below to drill down to examples." />
        <Stat
          title="Top stakeholder (neg)"
          value={topNegStakeholder}
          hint="Click a stakeholder below to filter the review feed."
        />
      </div>

      {/* Trend + Snapshot (fixed height + scrollable table; snapshot stretches to bottom) */}
      <Card>
        {/* Header row: title on left, subtle grouping on right */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <SectionTitle title="Trend" subtitle="Daily totals vs negative counts (bucketed)." />

          <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 800 }}>Grouping</span>
            <select
              value={bucket}
              onChange={(e) => setBucket(e.target.value as any)}
              style={{
                height: 34,
                padding: "0 10px",
                borderRadius: 999,
                border: "1px solid rgba(0,0,0,0.10)",
                background: "rgba(255,255,255,0.85)",
                fontWeight: 900,
                fontSize: 12,
                outline: "none",
                cursor: "pointer",
              }}
            >
              <option value="day">Daily</option>
              <option value="week">Weekly</option>
              <option value="month">Monthly</option>
            </select>
          </div>
        </div>

        <div style={{ height: 8 }} />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.65fr) minmax(0, 1fr)",
            gap: 12,
            alignItems: "stretch",
          }}
        >
          {/* LEFT: trend chart + scrollable table inside a fixed-height column */}
          <div
            style={{
              height: 560, // fixed block height for all buckets
              display: "flex",
              flexDirection: "column",
              gap: 10,
              minHeight: 0,
            }}
          >
            {/* Taller chart */}
            <TrendChart series={trend?.series ?? []} />

            {/* Scroll container for the table */}
            <div
              style={{
                flex: "1 1 auto",
                minHeight: 0,
                overflowY: "scroll",
                scrollbarGutter: "stable",
                border: "1px solid rgba(0,0,0,0.06)",
                borderRadius: "var(--r-lg)",
                background: "rgba(255,255,255,0.9)",
              }}
            >
              <div style={{ height: "100%", overflowX: "auto" }}>
                {trend?.series?.length ? (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th
                          style={{
                            ...th,
                            position: "sticky",
                            top: 0,
                            background: "var(--surface)",
                            zIndex: 1,
                          }}
                        >
                          Day
                        </th>
                        <th
                          style={{
                            ...th,
                            position: "sticky",
                            top: 0,
                            background: "var(--surface)",
                            zIndex: 1,
                          }}
                        >
                          Total
                        </th>
                        <th
                          style={{
                            ...th,
                            position: "sticky",
                            top: 0,
                            background: "var(--surface)",
                            zIndex: 1,
                          }}
                        >
                          Negative
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {trend.series.map((row) => (
                        <tr key={row.day}>
                          <td style={td}>{row.day}</td>
                          <td style={td}>{row.total}</td>
                          <td style={td}>{row.negative}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ padding: 12, fontSize: 12, color: "var(--muted)" }}>No trend data.</div>
                )}
              </div>
            </div>
          </div>

          <div
            style={{
              height: 580,
              display: "flex",
              width: "100%",
              minWidth: 0,
              justifySelf: "stretch",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <Card>
                <SectionTitle title="Snapshot" subtitle="Distribution + stakeholder negatives for this window." />
                <MiniDonut total={total} positive={posCount} neutral={neuCount} negative={negCount} />

                <div style={{ height: 12 }} />
                <div style={{ borderTop: "1px solid rgba(0,0,0,0.06)", paddingTop: 12 }}>
                  <SectionTitle title="Stakeholder negatives" subtitle="Click to drill down the review feed." />

                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          <th style={th}>Stakeholder</th>
                          <th style={th}>Count</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(summary?.stakeholder_negative_counts ?? []).map((s) => (
                          <tr
                            key={s.stakeholder}
                            onClick={() => setStakeholderFilter(s.stakeholder)}
                            className={`row-click ${stakeholderFilter === s.stakeholder ? "row-selected" : ""}`}
                            title="Click to filter review feed"
                          >
                            <td style={{ ...td, fontWeight: 800 }}>{s.stakeholder}</td>
                            <td style={td}>{s.count}</td>
                          </tr>
                        ))}
                        {!(summary?.stakeholder_negative_counts ?? []).length ? (
                          <tr>
                            <td style={td} colSpan={2}>
                              <span style={{ fontSize: 12, color: "var(--muted)" }}>No stakeholder data.</span>
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </Card>

      {/* Matrix */}
      <Card>
        <SectionTitle title="Negative signals matrix" subtitle="Stakeholder × aspect (negative counts, top aspects only)." />
        <div style={{ overflowX: "auto" }}>
          {matrix.stakeholders.length && matrix.aspects.length ? (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Stakeholder</th>
                  {matrix.aspects.map((a) => (
                    <th key={a} style={th}>
                      {a}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.stakeholders.map((s) => (
                  <tr key={s}>
                    <td style={{ ...td, fontWeight: 900 }}>{s}</td>
                    {matrix.aspects.map((a) => {
                      const key = `${s}||${a}`;
                      const v = matrix.cell.get(key) ?? 0;
                      return (
                        <td key={a} style={td}>
                          <span
                            style={{
                              display: "inline-flex",
                              minWidth: 28,
                              justifyContent: "center",
                              borderRadius: 999,
                              padding: "2px 8px",
                              border: "1px solid rgba(0,0,0,0.08)",
                              background: v > 0 ? "rgba(217,2,23,0.08)" : "rgba(0,0,0,0.03)",
                              color: v > 0 ? "var(--brand-red)" : "var(--muted)",
                              fontWeight: 900,
                            }}
                          >
                            {v}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ fontSize: 12, color: "var(--muted)" }}>No aspect matrix data.</div>
          )}
        </div>
      </Card>

      {/* Reviews (fixed height + scrollable aspects table and review feed). Bar chart removed; KPI added. */}
      <Card>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <SectionTitle
            title="Reviews"
            subtitle={drilldownActive ? "Filtered feed based on your selections." : "Most recent enriched reviews."}
          />
          {drilldownActive ? (
            <Button variant="secondary" onClick={clearDrilldown}>
              Clear drilldown
            </Button>
          ) : null}
        </div>

        <div style={{ height: 10 }} />

        <div
          style={{
            height: 680, // fixed size for the whole block
            display: "grid",
            gridTemplateColumns: "1fr 1.2fr",
            gap: 12,
            alignItems: "stretch",
            minHeight: 0,
          }}
        >
          {/* LEFT: KPI + aspects table (scrollable) */}
          <Card>
            <div style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
              <SectionTitle title="Top negative aspects" subtitle="Click an aspect to drill down." />

              <Stat
                title="Total reviews in window"
                value={String(total)}
                hint="Aspect counts are aggregated from these reviews."
              />

              <div style={{ height: 10 }} />

              <div
                style={{
                  flex: "1 1 auto",
                  minHeight: 0,
                  overflowY: "scroll",
                  overflowX: "auto",
                  scrollbarGutter: "stable",
                  border: "1px solid rgba(0,0,0,0.06)",
                  borderRadius: "var(--r-lg)",
                  background: "rgba(255,255,255,0.9)",
                }}
              >
                {(summary?.top_negative_aspects ?? []).length ? (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th
                          style={{
                            ...th,
                            position: "sticky",
                            top: 0,
                            background: "var(--surface)",
                            zIndex: 1,
                          }}
                        >
                          Aspect
                        </th>
                        <th
                          style={{
                            ...th,
                            position: "sticky",
                            top: 0,
                            background: "var(--surface)",
                            zIndex: 1,
                          }}
                        >
                          Count
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(summary?.top_negative_aspects ?? []).map((a) => (
                        <tr
                          key={a.aspect}
                          onClick={() => setAspectFilter(a.aspect)}
                          className={`row-click ${aspectFilter === a.aspect ? "row-selected" : ""}`}
                          title="Click to filter review feed"
                        >
                          <td style={{ ...td, fontWeight: 800 }}>{a.aspect}</td>
                          <td style={td}>{a.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ padding: 12, fontSize: 12, color: "var(--muted)" }}>No aspect data.</div>
                )}
              </div>
            </div>
          </Card>

          {/* RIGHT: review feed (scrollable) */}
          <div style={{ height: "100%", minHeight: 0, overflowY: "scroll", scrollbarGutter: "stable", paddingRight: 2 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {loading && !reviews ? (
                <>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      style={{
                        border: "1px solid var(--border)",
                        borderRadius: "var(--r-lg)",
                        padding: 12,
                        background: "rgba(255,255,255,0.9)",
                      }}
                    >
                      <Skeleton h={14} w="40%" />
                      <div style={{ height: 10 }} />
                      <Skeleton h={12} w="85%" />
                    </div>
                  ))}
                </>
              ) : (
                <>
                  {(reviews?.items ?? []).map((r) => (
                    <ReviewCard key={r.id} r={r} />
                  ))}
                  {reviews && reviews.items.length === 0 ? (
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>No reviews match the current drilldown filters.</div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

/** ---------- Presentational components ---------- */

function ReviewCard({ r }: { r: ReviewsResp["items"][0] }) {
  const summaryText = r.aspects_json?.overall_summary ?? "";
  const mentioned = r.aspects_json?.mentioned_aspects ?? [];

  const badge = sentimentBadge(r.overall_sentiment);

  return (
    <details
      style={{
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
        padding: 12,
        background: "rgba(255,255,255,0.9)",
      }}
    >
      <summary
        style={{
          cursor: "pointer",
          listStyle: "none" as any,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
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

/** Minimal “donut-like” snapshot (no extra libraries) */
function MiniDonut({
  total,
  positive,
  neutral,
  negative,
}: {
  total: number;
  positive: number;
  neutral: number;
  negative: number;
}) {
  const safeTotal = Math.max(total, 1);
  const p = positive / safeTotal;
  const n = negative / safeTotal;
  const u = neutral / safeTotal;

  const size = 140;
  const r = 48;
  const c = 2 * Math.PI * r;

  const pLen = c * p;
  const nLen = c * n;
  const uLen = c * u;

  return (
    <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
      <svg width={size} height={size} viewBox="0 0 140 140">
        <g transform="translate(70,70)">
          <circle r={r} fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="14" />
          <circle
            r={r}
            fill="none"
            stroke="var(--ok)"
            strokeWidth="14"
            strokeDasharray={`${pLen} ${c - pLen}`}
            strokeDashoffset="0"
            transform="rotate(-90)"
          />
          <circle
            r={r}
            fill="none"
            stroke="var(--neg)"
            strokeWidth="14"
            strokeDasharray={`${nLen} ${c - nLen}`}
            strokeDashoffset={-pLen}
            transform="rotate(-90)"
          />
          <circle
            r={r}
            fill="none"
            stroke="var(--neu)"
            strokeWidth="14"
            strokeDasharray={`${uLen} ${c - uLen}`}
            strokeDashoffset={-(pLen + nLen)}
            transform="rotate(-90)"
          />
          <text x="0" y="6" textAnchor="middle" fontSize="18" fontWeight="900" fill="black">
            {total}
          </text>
          <text x="0" y="24" textAnchor="middle" fontSize="11" fontWeight="700" fill="rgba(0,0,0,0.55)">
            reviews
          </text>
        </g>
      </svg>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <LegendRow label="Positive" value={positive} color="var(--ok)" />
        <LegendRow label="Negative" value={negative} color="var(--neg)" />
        <LegendRow label="Neutral" value={neutral} color="var(--neu)" />
      </div>
    </div>
  );
}

function LegendRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ width: 10, height: 10, borderRadius: 999, background: color, display: "inline-block" }} />
      <span style={{ fontSize: 12, color: "var(--muted)", width: 60 }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 900 }}>{value}</span>
    </div>
  );
}

/** Chart: totals vs negative (simple, brand-aligned) */
function TrendChart({ series }: { series: Array<{ day: string; total: number; negative: number }> }) {
  const [hover, setHover] = React.useState<null | {
    i: number;
    x: number;
    y: number;
    kind: "total" | "negative";
  }>(null);

  if (!series.length) return <div style={{ fontSize: 12, color: "var(--muted)" }}>No chart data.</div>;
  if (series.length === 1) {
    return (
      <div style={{ fontSize: 12, color: "var(--muted)" }}>
        Only one data point available. Once you run ingestion+analysis daily, this will become a true trend line.
      </div>
    );
  }

  // --- sizing ---
  const width = 980;
  const height = 380; // taller for readability
  const padL = 52; // left padding for y-axis labels
  const padR = 18;
  const padT = 18;
  const padB = 42; // bottom padding for x-axis labels

  const maxY = Math.max(...series.map((s) => Math.max(s.total, s.negative)), 1);

  const x = (i: number) => padL + (i * (width - padL - padR)) / (series.length - 1);
  const y = (v: number) => height - padB - (v * (height - padT - padB)) / maxY;

  const pathFor = (key: "total" | "negative") =>
    series
      .map((s, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(s[key]).toFixed(1)}`)
      .join(" ");

  // nice y ticks (5 lines)
  const yTicks = 5;
  const ticks = Array.from({ length: yTicks }, (_, k) => {
    const t = (k / (yTicks - 1)) * maxY;
    return Math.round(t);
  }).reverse(); // top to bottom labels

  // show fewer x labels (avoid clutter)
  const maxXLabels = 6;
  const step = Math.max(1, Math.ceil(series.length / maxXLabels));
  const xLabelIdx = new Set<number>();
  for (let i = 0; i < series.length; i += step) xLabelIdx.add(i);
  xLabelIdx.add(0);
  xLabelIdx.add(series.length - 1);

  const fmtX = (s: string) => {
    // ISO date-like? show YYYY-MM-DD
    if (s.length >= 10 && s[4] === "-" && s[7] === "-") return s.slice(0, 10);
    return s;
  };

  // Tooltip: display in top-right corner inside the chart container
  const tooltip = hover
    ? {
        day: fmtX(series[hover.i].day),
        total: series[hover.i].total,
        negative: series[hover.i].negative,
        kind: hover.kind,
      }
    : null;

  return (
    <div
      style={{
        border: "1px solid rgba(0,0,0,0.06)",
        borderRadius: "var(--r-lg)",
        padding: 10,
        background: "var(--surface)",
        position: "relative",
      }}
      onMouseLeave={() => setHover(null)}
    >
      {tooltip ? (
        <div
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            zIndex: 2,
            border: "1px solid rgba(0,0,0,0.10)",
            background: "rgba(255,255,255,0.92)",
            borderRadius: 12,
            padding: "8px 10px",
            minWidth: 180,
            boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
          }}
        >
          <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 900 }}>{tooltip.day}</div>
          <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", gap: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 900, color: "rgba(0,0,0,0.70)" }}>Total</span>
            <span style={{ fontSize: 12, fontWeight: 900 }}>{tooltip.total}</span>
          </div>
          <div style={{ marginTop: 4, display: "flex", justifyContent: "space-between", gap: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 900, color: "var(--brand-red)" }}>Negative</span>
            <span style={{ fontSize: 12, fontWeight: 900, color: "var(--brand-red)" }}>{tooltip.negative}</span>
          </div>
          <div style={{ marginTop: 6, fontSize: 11, color: "var(--muted)" }}>
            Hovering: <strong>{tooltip.kind}</strong>
          </div>
        </div>
      ) : null}

      <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
        {/* grid + y ticks */}
        {ticks.map((tv, idx) => {
          const yy = y(tv);
          return (
            <g key={idx}>
              <line
                x1={padL}
                y1={yy}
                x2={width - padR}
                y2={yy}
                stroke="rgba(0,0,0,0.06)"
              />
              <text
                x={padL - 10}
                y={yy + 4}
                textAnchor="end"
                fontSize="11"
                fill="rgba(0,0,0,0.55)"
                fontWeight="700"
              >
                {tv}
              </text>
            </g>
          );
        })}

        {/* axes */}
        <line x1={padL} y1={padT} x2={padL} y2={height - padB} stroke="rgba(0,0,0,0.12)" />
        <line x1={padL} y1={height - padB} x2={width - padR} y2={height - padB} stroke="rgba(0,0,0,0.12)" />

        {/* lines */}
        <path d={pathFor("total")} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth="2.5" />
        <path d={pathFor("negative")} fill="none" stroke="var(--brand-red)" strokeWidth="2.5" strokeDasharray="5 4" />

        {/* x labels */}
        {series.map((s, i) => {
          if (!xLabelIdx.has(i)) return null;
          return (
            <text
              key={s.day}
              x={x(i)}
              y={height - 18}
              textAnchor="middle"
              fontSize="10"
              fill="rgba(0,0,0,0.55)"
              fontWeight="700"
            >
              {fmtX(s.day)}
            </text>
          );
        })}

        {/* hover points */}
        {series.map((s, i) => {
          const xt = x(i);
          const yt = y(s.total);
          const yn = y(s.negative);

          return (
            <g key={s.day}>
              {/* total point */}
              <circle
                cx={xt}
                cy={yt}
                r={6}
                fill="transparent"
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setHover({ i, x: xt, y: yt, kind: "total" })}
              />
              <circle
                cx={xt}
                cy={yt}
                r={hover?.i === i && hover.kind === "total" ? 4 : 2.5}
                fill="rgba(0,0,0,0.55)"
                opacity={hover?.i === i && hover.kind === "total" ? 1 : 0.8}
                pointerEvents="none"
              />

              {/* negative point */}
              <circle
                cx={xt}
                cy={yn}
                r={6}
                fill="transparent"
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setHover({ i, x: xt, y: yn, kind: "negative" })}
              />
              <circle
                cx={xt}
                cy={yn}
                r={hover?.i === i && hover.kind === "negative" ? 4 : 2.5}
                fill="var(--brand-red)"
                opacity={hover?.i === i && hover.kind === "negative" ? 1 : 0.85}
                pointerEvents="none"
              />
            </g>
          );
        })}

        {/* legend */}
        <g>
          <text x={padL} y={padT} fontSize="12" fill="rgba(0,0,0,0.60)" fontWeight="800">
            Total
          </text>
          <text x={padL + 52} y={padT} fontSize="12" fill="var(--brand-red)" fontWeight="900">
            Negative
          </text>
        </g>
      </svg>
    </div>
  );
}


function Skeleton({ h = 12, w = "100%" }: { h?: number; w?: number | string }) {
  return (
    <div
      style={{
        height: h,
        width: w,
        borderRadius: 10,
        background: "linear-gradient(90deg, rgba(0,0,0,0.04), rgba(0,0,0,0.08), rgba(0,0,0,0.04))",
        backgroundSize: "200% 100%",
        animation: "shimmer 1.2s infinite",
      }}
    />
  );
}
