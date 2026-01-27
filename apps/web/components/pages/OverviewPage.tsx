"use client";

import React, { useEffect, useState } from "react";
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
  series: Array<{ day: string; total: number; negative: number; positive: number }>;
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

  // Reviews left block tabs (aspects vs stakeholders)
  const [reviewsLeftTab, setReviewsLeftTab] = useState<"aspects" | "stakeholders">("aspects");

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

  const topNegAspect = (summary?.top_negative_aspects ?? []).slice(0, 3);
  const topNegStakeholder = (summary?.stakeholder_negative_counts ?? []).slice(0, 3);

  const drilldownActive = Boolean(aspectFilter || stakeholderFilter);

  const clearDrilldown = () => {
    setAspectFilter("");
    setStakeholderFilter("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header row (page title + controls) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(200px, 1fr))",
          gap: 12,
          alignItems: "end",
        }}
      >
        <div style={{ gridColumn: "span 2", display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -0.2 }}>Overview</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            Review intelligence across verticals — filters drive all KPIs and drilldowns.
          </div>
        </div>

        <div style={{ gridColumn: "span 2" }}>
          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: 14, width: "100%" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1 }}>
                <div style={{ flex: 1 }}>
                  <Select
                    label="Vertical"
                    value={vertical}
                    onChange={(v) => setVertical(v)}
                    options={verticalOptions.map((v) => ({ label: v, value: v }))}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <Select
                    label="Window"
                    value={String(days)}
                    onChange={(v) => setDays(Number(v))}
                    options={[0, 7, 30, 90, 365].map((d) => ({
                      label: d === 0 ? "All time" : `Last ${d} days`,
                      value: d,
                    }))}
                  />
                </div>
              </div>
              {(loading || err) && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                  {loading ? <span style={{ fontSize: 12, color: "var(--muted)" }}>Loading…</span> : null}
                  {err ? (
                    <span style={{ fontSize: 12, color: "var(--brand-red)", fontWeight: 800 }}>{err}</span>
                  ) : null}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* KPI row (Snapshot replaces Total + Negative KPIs) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(200px, 1fr))",
          gap: 12,
          alignItems: "stretch",
        }}
      >
        {/* Snapshot spans the space of two KPI blocks */}
        <div style={{ gridColumn: "span 2" }}>
          <Card>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <SectionTitle title="Snapshot" subtitle="Hover a segment to see its percentage." />
              <InteractiveDonut total={total} positive={posCount} neutral={neuCount} negative={negCount} />
            </div>
          </Card>
        </div>

        <Top3KPI
          title="Top Negative Aspects"
          hint="Top 3 by negative mentions in this window."
          items={topNegAspect.map((x) => ({ label: x.aspect, value: x.count }))}
          emptyLabel="No aspect data."
        />

        <Top3KPI
          title="Top Negative Stakeholders"
          hint="Top 3 by negative mentions in this window."
          items={topNegStakeholder.map((x) => ({ label: x.stakeholder, value: x.count }))}
          emptyLabel="No stakeholder data."
        />
      </div>

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
          <SectionTitle title="Trend" subtitle="Daily total vs positive vs negative counts." />

          <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 800 }}>Grouping</span>
            <SegmentTabs
              value={bucket}
              onChange={setBucket}
              options={[
                //{value: "day", label: "Daily"},
                { value: "week", label: "Weekly" },
                { value: "month", label: "Monthly" },
              ]}
            />
          </div>
        </div>
        <div style={{ height: 8 }} />

        <div
          style={{
            height: 560, // fixed block height for all buckets
            display: "flex",
            flexDirection: "column",
            gap: 10,
            minHeight: 0,
          }}
        >
          <TrendChart series={trend?.series ?? []} />

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
                      <th
                        style={{
                          ...th,
                          position: "sticky",
                          top: 0,
                          background: "var(--surface)",
                          zIndex: 1,
                        }}
                      >
                        Positive
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {trend.series.map((row) => (
                      <tr key={row.day}>
                        <td style={td}>{row.day}</td>
                        <td style={td}>{row.total}</td>
                        <td style={td}>{row.negative}</td>
                        <td style={td}>{row.positive}</td>
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
      </Card>

      {/* Reviews (negative stakeholders moved into the left block as a tab) */}
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
            height: 610, // fixed size for the whole block
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(200px, 1fr))",
            gap: 12,
            alignItems: "stretch",
            minHeight: 0,
          }}
        >
          {/* LEFT: Tabs + table (scrollable) */}
          <div style={{ gridColumn: "span 2" }}>
            <Card>
              <div style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                  <SectionTitle
                    title={reviewsLeftTab === "aspects" ? "Top negative aspects" : "Negative stakeholders"}
                    subtitle={
                      reviewsLeftTab === "aspects"
                        ? "Click an aspect to drill down."
                        : "Click a stakeholder to drill down."
                    }
                  />
                  <SegmentTabs
                    value={reviewsLeftTab}
                    onChange={setReviewsLeftTab}
                    options={[
                      { value: "aspects", label: "Aspects" },
                      { value: "stakeholders", label: "Stakeholders" },
                    ]}
                  />
                </div>

                <Stat
                  title="Total reviews in window"
                  value={String(total)}
                  hint="Counts and distributions are aggregated from these reviews."
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
                  {reviewsLeftTab === "aspects" ? (
                    (summary?.top_negative_aspects ?? []).length ? (
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
                    )
                  ) : (summary?.stakeholder_negative_counts ?? []).length ? (
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
                            Stakeholder
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
                      </tbody>
                    </table>
                  ) : (
                    <div style={{ padding: 12, fontSize: 12, color: "var(--muted)" }}>No stakeholder data.</div>
                  )}
                </div>
              </div>
            </Card>
          </div>

          {/* RIGHT: review feed (scrollable) */}
          <div style={{ gridColumn: "span 2", height: "100%", minHeight: 0, overflowY: "scroll", scrollbarGutter: "stable", paddingRight: 2 }}>
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

/** ---------- Small UI helpers ---------- */

function SegmentTabs<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        borderRadius: 999,
        padding: 4,
        border: "1px solid rgba(0,0,0,0.10)",
        background: "rgba(255,255,255,0.75)",
        gap: 4,
        alignSelf: "flex-start",
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            style={{
              border: "none",
              cursor: "pointer",
              borderRadius: 999,
              padding: "6px 10px",
              fontSize: 12,
              fontWeight: 900,
              background: active ? "var(--brand-red)" : "transparent",
              color: active ? "var(--white)" : "rgba(0,0,0,0.70)",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Top3KPI({
  title,
  hint,
  items,
  emptyLabel,
}: {
  title: string;
  hint?: string;
  items: Array<{ label: string; value: number }>;
  emptyLabel?: string;
}) {
  return (
    <Card>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: "rgba(0,0,0,0.70)" }}>{title}</div>
          {hint ? <div style={{ fontSize: 12, color: "var(--muted)" }}>{hint}</div> : null}
        </div>

        {items.length ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 0,
              borderRadius: 14,
              border: "1px solid rgba(0,0,0,0.06)",
              overflow: "hidden",
              background: "transparent",
            }}
          >
            {items.map((it, i) => (
              <div
                key={`${it.label}-${i}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "10px 12px",
                  background: "transparent",
                  borderTop: i === 0 ? "none" : "1px solid rgba(0,0,0,0.06)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  {/* rank chip */}
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 999,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      fontWeight: 900,
                      border: "1px solid rgba(0,0,0,0.12)",
                      background: "transparent",
                      color: "rgba(0,0,0,0.70)",
                      flexShrink: 0,
                    }}
                  >
                    {i + 1}
                  </span>

                  {/* label */}
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 900,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    title={it.label}
                  >
                    {it.label}
                  </span>
                </div>

                {/* score */}
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 900,
                    color: "rgba(0,0,0,0.55)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {it.value}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "var(--muted)" }}>{emptyLabel ?? "No data."}</div>
        )}
      </div>
    </Card>
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

/** Snapshot donut with hover-to-see-percent */
function InteractiveDonut({
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
  const [hover, setHover] = React.useState<null | "Positive" | "Negative" | "Neutral">(null);

  const safeTotal = Math.max(total, 1);
  const p = positive / safeTotal;
  const n = negative / safeTotal;
  const u = neutral / safeTotal;

  const pct = (v: number) => {
    if (!total) return 0;
    return Math.round((v / total) * 100);
  };

  const size = 132;
  const r = 46;
  const c = 2 * Math.PI * r;

  const pLen = c * p;
  const nLen = c * n;
  const uLen = c * u;

  const hoverValue =
    hover === "Positive" ? positive : hover === "Negative" ? negative : hover === "Neutral" ? neutral : null;

  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
      <div style={{ position: "relative", width: size, height: size }}>
        {/* Tooltip */}
        {hover ? (
          <div
            style={{
              position: "absolute",
              top: -10,
              left: "50%",
              transform: "translate(-50%, -100%)",
              border: "1px solid rgba(0,0,0,0.10)",
              background: "rgba(255,255,255,0.95)",
              borderRadius: 12,
              padding: "8px 10px",
              boxShadow: "0 8px 20px rgba(0,0,0,0.10)",
              minWidth: 170,
              pointerEvents: "none",
              zIndex: 2,
            }}
          >
            <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 900 }}>Sentiment</div>
            <div style={{ marginTop: 4, display: "flex", justifyContent: "space-between", gap: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 900 }}>{hover}</span>
              <span style={{ fontSize: 12, fontWeight: 900 }}>
                {hoverValue ?? 0} ({pct(hoverValue ?? 0)}%)
              </span>
            </div>
          </div>
        ) : null}

        <svg width={size} height={size} viewBox="0 0 140 140" style={{ display: "block" }}>
          <g transform="translate(70,70)">
            <circle r={r} fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="14" />

            {/* Positive */}
            <circle
              r={r}
              fill="none"
              stroke="var(--ok)"
              strokeWidth="14"
              strokeDasharray={`${pLen} ${c - pLen}`}
              strokeDashoffset="0"
              transform="rotate(-90)"
              style={{ cursor: "pointer", pointerEvents: "stroke", opacity: hover && hover !== "Positive" ? 0.35 : 1 }}
              onMouseEnter={() => setHover("Positive")}
              onMouseLeave={() => setHover(null)}
            />

            {/* Negative */}
            <circle
              r={r}
              fill="none"
              stroke="var(--neg)"
              strokeWidth="14"
              strokeDasharray={`${nLen} ${c - nLen}`}
              strokeDashoffset={-pLen}
              transform="rotate(-90)"
              style={{ cursor: "pointer", pointerEvents: "stroke", opacity: hover && hover !== "Negative" ? 0.35 : 1 }}
              onMouseEnter={() => setHover("Negative")}
              onMouseLeave={() => setHover(null)}
            />

            {/* Neutral */}
            <circle
              r={r}
              fill="none"
              stroke="var(--neu)"
              strokeWidth="14"
              strokeDasharray={`${uLen} ${c - uLen}`}
              strokeDashoffset={-(pLen + nLen)}
              transform="rotate(-90)"
              style={{ cursor: "pointer", pointerEvents: "stroke", opacity: hover && hover !== "Neutral" ? 0.35 : 1 }}
              onMouseEnter={() => setHover("Neutral")}
              onMouseLeave={() => setHover(null)}
            />

            <text x="0" y="6" textAnchor="middle" fontSize="18" fontWeight="900" fill="black">
              {total}
            </text>
            <text x="0" y="24" textAnchor="middle" fontSize="11" fontWeight="700" fill="rgba(0,0,0,0.55)">
              reviews
            </text>
          </g>
        </svg>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 220, flex: "1 1 auto" }}>
        <LegendRow label="Positive" value={positive} pct={pct(positive)} color="var(--ok)" active={hover === "Positive"} />
        <LegendRow label="Negative" value={negative} pct={pct(negative)} color="var(--neg)" active={hover === "Negative"} />
        <LegendRow label="Neutral" value={neutral} pct={pct(neutral)} color="var(--neu)" active={hover === "Neutral"} />
        <div style={{ fontSize: 12, color: "var(--muted)" }}>
          {total ? `Sentiment distribution for ${total} enriched reviews.` : "No reviews in this window."}
        </div>
      </div>
    </div>
  );
}

function LegendRow({
  label,
  value,
  pct,
  color,
  active,
}: {
  label: string;
  value: number;
  pct: number;
  color: string;
  active: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "6px 8px",
        borderRadius: 12,
        background: active ? "rgba(0,0,0,0.03)" : "transparent",
        border: active ? "1px solid rgba(0,0,0,0.08)" : "1px solid transparent",
      }}
    >
      <span style={{ width: 10, height: 10, borderRadius: 999, background: color, display: "inline-block" }} />
      <span style={{ fontSize: 12, color: "var(--muted)", width: 70, fontWeight: 900 }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 900 }}>{value}</span>
      <span style={{ fontSize: 12, color: "var(--muted)" }}>({pct}%)</span>
    </div>
  );
}

/** Chart: totals vs negative (simple, brand-aligned) */
function TrendChart({ series }: { series: Array<{ day: string; total: number; negative: number; positive: number }> }) {
  const [hover, setHover] = React.useState<null | {
    i: number;
    x: number;
    y: number;
    kind: "total" | "negative" | "positive";
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
  const height = 380;
  const padL = 52;
  const padR = 18;
  const padT = 18;
  const padB = 42;

  const maxY = Math.max(...series.map((s) => Math.max(s.total ?? 0, s.negative ?? 0, s.positive ?? 0)), 1);

  const x = (i: number) => padL + (i * (width - padL - padR)) / (series.length - 1);
  const y = (v: number) => height - padB - ((v ?? 0) * (height - padT - padB)) / maxY;

  const pathFor = (key: "total" | "negative" | "positive") =>
    series
      .map((s, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(s[key] ?? 0).toFixed(1)}`)
      .join(" ");

  const yTicks = 5;
  const ticks = Array.from({ length: yTicks }, (_, k) => {
    const t = (k / (yTicks - 1)) * maxY;
    return Math.round(t);
  }).reverse();

  const maxXLabels = 6;
  const step = Math.max(1, Math.ceil(series.length / maxXLabels));
  const xLabelIdx = new Set<number>();
  for (let i = 0; i < series.length; i += step) xLabelIdx.add(i);
  xLabelIdx.add(0);
  xLabelIdx.add(series.length - 1);

  const fmtX = (s: string) => {
    if (s.length >= 10 && s[4] === "-" && s[7] === "-") return s.slice(0, 10);
    return s;
  };

  const tooltip = hover
    ? {
      day: fmtX(series[hover.i].day),
      total: series[hover.i].total,
      negative: series[hover.i].negative,
      positive: series[hover.i].positive,
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
          <div style={{ marginTop: 4, display: "flex", justifyContent: "space-between", gap: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 900, color: "var(--ok)" }}>Positive</span>
            <span style={{ fontSize: 12, fontWeight: 900, color: "var(--ok)" }}>{tooltip.positive}</span>
          </div>
          <div style={{ marginTop: 6, fontSize: 11, color: "var(--muted)" }}>
            Hovering: <strong>{tooltip.kind}</strong>
          </div>
        </div>
      ) : null}

      <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
        {ticks.map((tv, idx) => {
          const yy = y(tv);
          return (
            <g key={idx}>
              <line x1={padL} y1={yy} x2={width - padR} y2={yy} stroke="rgba(0,0,0,0.06)" />
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

        <line x1={padL} y1={padT} x2={padL} y2={height - padB} stroke="rgba(0,0,0,0.12)" />
        <line x1={padL} y1={height - padB} x2={width - padR} y2={height - padB} stroke="rgba(0,0,0,0.12)" />

        <path d={pathFor("total")} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth="2.5" />
        <path d={pathFor("negative")} fill="none" stroke="var(--brand-red)" strokeWidth="2.5" strokeDasharray="5 4" />
        <path d={pathFor("positive")} fill="none" stroke="var(--ok)" strokeWidth="2.5" />

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

        {series.map((s, i) => {
          const xt = x(i);
          const yt = y(s.total);
          const yn = y(s.negative);
          const yp = y(s.positive);

          return (
            <g key={s.day}>
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
              />

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
              />

              <circle
                cx={xt}
                cy={yp}
                r={6}
                fill="transparent"
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setHover({ i, x: xt, y: yp, kind: "positive" })}
              />
              <circle
                cx={xt}
                cy={yp}
                r={hover?.i === i && hover.kind === "positive" ? 4 : 2.5}
                fill="var(--ok)"
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Skeleton({ h, w }: { h: number; w: string }) {
  return (
    <div
      style={{
        height: h,
        width: w,
        borderRadius: 999,
        background: "linear-gradient(90deg, rgba(0,0,0,0.04), rgba(0,0,0,0.08), rgba(0,0,0,0.04))",
      }}
    />
  );
}
