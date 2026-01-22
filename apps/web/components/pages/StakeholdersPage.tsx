"use client";

import React, { useEffect, useMemo, useState } from "react";
import { getAspects, getReviews, getSummary, getVerticalsConfig } from "../../lib/api";
import { Card, SectionTitle, Button, Select, Stat } from "../ui";

type SummaryResp = {
  filters: { vertical: string; days: number };
  total_reviews: number;
  sentiment_distribution: Record<string, number>;
  top_negative_aspects: Array<{ aspect: string; count: number }>;
  stakeholder_negative_counts: Array<{ stakeholder: string; count: number }>;
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

type Bucket = "day" | "week" | "month";
type DrawerMode = "evidence" | "insights";

export default function StakeholdersPage() {
  const [days, setDays] = useState<number>(0);
  const [vertical, setVertical] = useState<string>("groceries");
  const [verticalOptions, setVerticalOptions] = useState<string[]>(["groceries"]);

  const [bucket, setBucket] = useState<Bucket>("week");
  const [stakeholder, setStakeholder] = useState<string>("");

  // Selecting a driver should filter chart + KPIs (interactive)
  const [aspectFocus, setAspectFocus] = useState<string>("");

  const [summary, setSummary] = useState<SummaryResp | null>(null);
  const [aspects, setAspects] = useState<AspectsResp | null>(null);

  // Stakeholder-wide reviews (chart + KPIs derive from this, then filter client-side by aspectFocus)
  const [stakeholderReviews, setStakeholderReviews] = useState<ReviewsResp | null>(null);

  // Drawer reviews (stakeholder + specific aspect), used ONLY for recommended actions
  const [drawerReviews, setDrawerReviews] = useState<ReviewsResp | null>(null);
  const [drawerLoading, setDrawerLoading] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(false);
  const [err, setErr] = useState<string>("");

  // Drivers toast
  const [driversOpen, setDriversOpen] = useState<boolean>(false);

  // Drawer
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("evidence");
  const [drawerAspect, setDrawerAspect] = useState<string>("");

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

  // Fetch summary + aspects when vertical/days changes
  useEffect(() => {
    if (!vertical) return;

    (async () => {
      setLoading(true);
      setErr("");
      try {
        const [s, a] = await Promise.all([getSummary(vertical, days), getAspects(vertical, days)]);
        setSummary(s);
        setAspects(a);

        // Choose default stakeholder if empty
        const candidates = (s?.stakeholder_negative_counts ?? [])
          .map((x: any) => x.stakeholder)
          .filter(Boolean);
        const first = candidates[0] ?? "";
        setStakeholder((prev) => prev || first);
      } catch (e: any) {
        setErr(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [vertical, days]);

  // Reset focus + close drivers on major filter change
  useEffect(() => {
    setAspectFocus("");
    setDriversOpen(false);
  }, [vertical, days, stakeholder]);

  // Fetch stakeholder-wide reviews whenever stakeholder changes
  useEffect(() => {
    if (!vertical || !stakeholder) return;

    (async () => {
      try {
        const r = await getReviews(vertical, 500, 0, {
          stakeholder: stakeholder || undefined,
        });
        setStakeholderReviews(r);
      } catch (e: any) {
        setErr(e?.message ?? String(e));
      }
    })();
  }, [vertical, stakeholder]);

  // Fetch drawer reviews when drawer opens (stakeholder + aspect)
  useEffect(() => {
    if (!drawerOpen) return;
    if (!vertical || !stakeholder) return;
    if (!drawerAspect) return;

    (async () => {
      setDrawerLoading(true);
      try {
        const r = await getReviews(vertical, 300, 0, {
          stakeholder: stakeholder || undefined,
          aspect: drawerAspect || undefined,
        });
        setDrawerReviews(r);
      } catch (e: any) {
        setErr(e?.message ?? String(e));
      } finally {
        setDrawerLoading(false);
      }
    })();
  }, [drawerOpen, vertical, stakeholder, drawerAspect]);

  const stakeholderOptions = useMemo(() => {
    const fromSummary = (summary?.stakeholder_negative_counts ?? [])
      .map((x) => x.stakeholder)
      .filter(Boolean);

    const fromAspects = (aspects?.stakeholder_totals ?? [])
      .map((x) => x.stakeholder)
      .filter(Boolean);

    const merged = Array.from(new Set([...fromSummary, ...fromAspects])).sort();
    return merged.length ? merged : ["product", "operations", "customer_support"];
  }, [summary, aspects]);

  // Drivers for selected stakeholder (negative only)
  const stakeholderDrivers = useMemo(() => {
    const items = aspects?.items ?? [];
    const map = new Map<string, number>();
    for (const it of items) {
      if (it.stakeholder !== stakeholder) continue;
      if (it.sentiment !== "Negative") continue;
      map.set(it.aspect, (map.get(it.aspect) ?? 0) + it.count);
    }
    return Array.from(map.entries())
      .map(([aspect, count]) => ({ aspect, count }))
      .sort((a, b) => b.count - a.count);
  }, [aspects, stakeholder]);

  // Filter stakeholder reviews client-side when a driver is selected
  const effectiveReviewItems = useMemo(() => {
    const items = stakeholderReviews?.items ?? [];
    if (!aspectFocus) return items;
    return items.filter((r) => reviewHasStakeholderAspect(r, stakeholder, aspectFocus));
  }, [stakeholderReviews, stakeholder, aspectFocus]);

  // Trend from effectiveReviewItems
  const trendSeries = useMemo(() => {
    return bucketSeries(effectiveReviewItems, bucket);
  }, [effectiveReviewItems, bucket]);

  const totalMentions = effectiveReviewItems.length;
  const negMentions = useMemo(() => {
    return effectiveReviewItems.filter((r) => r.overall_sentiment === "Negative").length;
  }, [effectiveReviewItems]);
  const negPct = totalMentions ? Math.round((negMentions / totalMentions) * 100) : 0;

  const defaultTopDriver = stakeholderDrivers[0]?.aspect ?? "-";
  const defaultTopDriverCount = stakeholderDrivers[0]?.count ?? 0;

  const focusedDriverCount = useMemo(() => {
    if (!aspectFocus) return 0;
    return stakeholderDrivers.find((d) => d.aspect === aspectFocus)?.count ?? 0;
  }, [stakeholderDrivers, aspectFocus]);

  const topDriverLabel = aspectFocus || defaultTopDriver;
  const topDriverCountLabel = aspectFocus ? focusedDriverCount : defaultTopDriverCount;

  // Prioritized actions derived from drivers (MVP)
  const prioritizedActions = useMemo(() => {
    const top = stakeholderDrivers.slice(0, 7);
    return top.map((d, idx) => ({
      rank: idx + 1,
      aspect: d.aspect,
      impact: d.count,
      rationale: buildRationale(d.aspect),
      owner: stakeholder,
    }));
  }, [stakeholderDrivers, stakeholder]);

  // Drawer is ONLY for recommended actions
  const openEvidenceDrawer = (aspect: string) => {
    setDrawerMode("evidence");
    setDrawerAspect(aspect);
    setDrawerOpen(true);
  };

  const openInsightsDrawer = (aspect: string) => {
    setDrawerMode("insights");
    setDrawerAspect(aspect);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setDrawerLoading(false);
  };

  // Driver click now updates chart (interactive) instead of opening drawer
  const chooseDriver = (aspect: string) => {
    setAspectFocus(aspect);
    setDriversOpen(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Title row */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -0.2 }}>Stakeholders</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            Stakeholder narrative: trend, drivers, and actions — with evidence and insights available on demand.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {loading ? <span style={{ fontSize: 12, color: "var(--muted)" }}>Loading…</span> : null}
          {err ? <span style={{ fontSize: 12, color: "var(--brand-red)", fontWeight: 800 }}>{err}</span> : null}
        </div>
      </div>

      {/* Pronounced full-width control bar (alignment fixed: 3 selects in one row) */}
      <div style={controlBar}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 0.2 }}>Filters</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            Choose the vertical, then select a stakeholder and time window.
          </div>

          {aspectFocus ? (
            <div style={{ marginTop: 8, fontSize: 12, color: "var(--muted)" }}>
              Context: <strong style={{ color: "var(--text)" }}>{aspectFocus}</strong>
              <button
                onClick={() => setAspectFocus("")}
                style={{
                  marginLeft: 10,
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  color: "var(--brand-red)",
                  fontWeight: 900,
                  fontSize: 12,
                }}
                title="Clear context"
              >
                Clear
              </button>
            </div>
          ) : null}
        </div>

        <div style={controlGrid}>
          <FilterSelect
            label="Vertical"
            value={vertical}
            onChange={(v) => setVertical(v)}
            options={verticalOptions.map((v) => ({ label: v, value: v }))}
          />

          <FilterSelect
            label="Stakeholder"
            value={stakeholder || stakeholderOptions[0]}
            onChange={(v) => setStakeholder(v)}
            options={stakeholderOptions.map((s) => ({ label: s, value: s }))}
          />

          <FilterSelect
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

      {/* HERO: Stakeholder story with Drivers toast integrated */}
      <Card>
        <div style={{ position: "relative" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
            <SectionTitle
              title={`Stakeholder story: ${stakeholder || "—"}`}
              subtitle={
                aspectFocus
                  ? `Trend is filtered to driver: ${aspectFocus}.`
                  : "Trend is computed from reviews that mention this stakeholder (via extracted aspects)."
              }
            />

            <div style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 800 }}>Grouping</span>
              <select
                value={bucket}
                onChange={(e) => setBucket(e.target.value as Bucket)}
                style={pillSelect}
              >
                <option value="day">Daily</option>
                <option value="week">Weekly</option>
                <option value="month">Monthly</option>
              </select>

              <button
                onClick={() => setDriversOpen((v) => !v)}
                style={{
                  ...pillButton,
                  borderColor: driversOpen ? "rgba(217,2,23,0.45)" : "rgba(0,0,0,0.10)",
                  background: driversOpen ? "rgba(217,2,23,0.08)" : "rgba(255,255,255,0.9)",
                  color: "var(--text)",
                }}
                title="Open drivers"
              >
                Drivers
                <span style={{ marginLeft: 8, color: "var(--muted)", fontWeight: 900 }}>
                  ({Math.min(stakeholderDrivers.length, 12)})
                </span>
              </button>
            </div>
          </div>

          {/* Drivers toast/popup (now sets aspectFocus instead of opening drawer) */}
          {driversOpen ? (
            <div style={driversToast}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                <div style={{ fontWeight: 900, fontSize: 12 }}>Top drivers (negative)</div>
                <button onClick={() => setDriversOpen(false)} style={xBtn} aria-label="Close drivers">
                  ✕
                </button>
              </div>

              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto" }}>
                {stakeholderDrivers.slice(0, 12).map((d) => {
                  const selected = d.aspect === aspectFocus;
                  return (
                    <button
                      key={d.aspect}
                      onClick={() => chooseDriver(d.aspect)}
                      style={{
                        ...driverRowBtn,
                        background: selected ? "rgba(217,2,23,0.06)" : "rgba(255,255,255,0.95)",
                        borderColor: selected ? "rgba(217,2,23,0.25)" : "rgba(0,0,0,0.08)",
                      }}
                      title="Filter the chart to this driver"
                    >
                      <span style={{ fontWeight: 900, textAlign: "left" }}>{d.aspect}</span>
                      <span style={driverCount}>{d.count}</span>
                    </button>
                  );
                })}

                {!stakeholderDrivers.length ? (
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>
                    No negative drivers found for this stakeholder in this window.
                  </div>
                ) : null}
              </div>

              <div style={{ marginTop: 10, fontSize: 12, color: "var(--muted)" }}>
                Tip: click a driver to filter the trend. Use actions below for evidence/insights.
              </div>
            </div>
          ) : null}
        </div>

        <div style={{ height: 10 }} />

        <div style={{ display: "grid", gridTemplateColumns: "1.55fr 1fr", gap: 12, alignItems: "stretch" }}>
          <div style={{ minHeight: 340 }}>
            <StakeholderTrendChart series={trendSeries} height={320} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Stat
                title={aspectFocus ? "Mentions (filtered)" : "Mentions (reviews)"}
                value={String(totalMentions)}
                hint={aspectFocus ? "Filtered to selected driver." : "Reviews containing stakeholder-tagged aspects."}
              />
              <Stat
                title="Negative reviews"
                value={`${negMentions} (${negPct}%)`}
                hint="Based on overall_sentiment in enriched reviews."
              />
              <Stat
                title={aspectFocus ? "Selected driver" : "Top driver"}
                value={topDriverLabel}
                hint={aspectFocus ? "This driver is currently filtering the chart." : "Most frequent negative aspect for this stakeholder."}
              />
              <Stat
                title={aspectFocus ? "Selected driver count" : "Top driver count"}
                value={String(topDriverCountLabel)}
                hint="Negative mentions for this driver."
              />
            </div>

            <div
              style={{
                border: "1px solid rgba(0,0,0,0.06)",
                borderRadius: "var(--r-lg)",
                padding: 12,
                background: "rgba(255,255,255,0.9)",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 900 }}>How to use this</div>
              <div style={{ marginTop: 6, fontSize: 12, color: "var(--muted)" }}>
                Open <strong>Drivers</strong> to filter the chart. Use <strong>Show evidence</strong> / <strong>Show insights</strong> below to deep-dive.
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Recommended actions (drawer stays here only) */}
      <Card>
        <SectionTitle
          title="Recommended actions"
          subtitle="Prioritized actions derived from the top negative drivers. Evidence and insights open in a drawer."
        />

        <div style={{ height: 10 }} />

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {prioritizedActions.map((a) => (
            <div key={a.rank} style={actionCard}>
              <div style={rankPill}>{a.rank}</div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 900, fontSize: 14 }}>{a.aspect}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 900 }}>
                    Impact: {a.impact}
                  </div>
                </div>

                <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.35 }}>{a.rationale}</div>

                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button onClick={() => openEvidenceDrawer(a.aspect)} style={pillButton} title="Open evidence drawer">
                      Show evidence
                    </button>

                    <button
                      onClick={() => openInsightsDrawer(a.aspect)}
                      style={{
                        ...pillButton,
                        borderColor: "rgba(217,2,23,0.35)",
                        background: "rgba(217,2,23,0.06)",
                      }}
                      title="Open insights drawer"
                    >
                      <span style={aiLogo}>AI</span>
                      Show insights
                    </button>
                  </div>

                  <span style={{ fontSize: 12, color: "var(--muted)" }}>
                    Owner: <strong style={{ color: "var(--text)" }}>{a.owner}</strong>
                  </span>
                </div>
              </div>
            </div>
          ))}

          {!prioritizedActions.length ? (
            <div style={{ fontSize: 12, color: "var(--muted)" }}>No actions to recommend (no drivers found).</div>
          ) : null}
        </div>
      </Card>

      {/* Drawer (Evidence / Insights) */}
      {drawerOpen ? (
        <div style={drawerOverlay} onClick={closeDrawer}>
          <div style={drawerPanel} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 900 }}>
                  {drawerMode === "evidence" ? "Evidence" : "Insights"}: {drawerAspect}
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                  Stakeholder: <strong style={{ color: "var(--text)" }}>{stakeholder}</strong>
                </div>
              </div>

              <Button variant="secondary" onClick={closeDrawer}>
                Close
              </Button>
            </div>

            <div style={{ height: 12 }} />

            {drawerMode === "evidence" ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 12, alignItems: "start" }}>
                <Card>
                  <SectionTitle title="Key evidence" subtitle="Top snippets related to this issue." />
                  <div style={{ height: 10 }} />
                  {drawerLoading ? (
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>Loading evidence…</div>
                  ) : (
                    <EvidenceList reviews={drawerReviews?.items ?? []} stakeholder={stakeholder} aspectFocus={drawerAspect} />
                  )}
                </Card>

                <div style={{ height: 620, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 900 }}>
                    Review feed (filtered)
                  </div>

                  <div style={scrollBox}>
                    {drawerLoading ? (
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>Loading reviews…</div>
                    ) : (
                      <>
                        {(drawerReviews?.items ?? []).map((r) => (
                          <div key={r.id} style={{ marginBottom: 10 }}>
                            <ReviewCard r={r} />
                          </div>
                        ))}
                        {drawerReviews && (drawerReviews.items?.length ?? 0) === 0 ? (
                          <div style={{ fontSize: 12, color: "var(--muted)" }}>No reviews match this issue.</div>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <Card>
                  <SectionTitle
                    title="AI insights (placeholder)"
                    subtitle="Later this will be AI-generated insights for the selected issue."
                  />
                  <div style={{ height: 10 }} />

                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <div style={aiBadgeLarge}>AI</div>
                    <div style={{ flex: 1, minWidth: 260 }}>
                      <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
                        This panel is intentionally a placeholder for now. Suggested structure when you wire it:
                      </div>

                      <ul style={{ marginTop: 10, paddingLeft: 18, color: "var(--text)", fontSize: 13, lineHeight: 1.55 }}>
                        <li><strong>Summary:</strong> What users are reporting about “{drawerAspect}”.</li>
                        <li><strong>Likely root causes:</strong> Operational / product / partner breakdown hypotheses.</li>
                        <li><strong>Recommended next steps:</strong> Concrete experiments and owners.</li>
                        <li><strong>Confidence:</strong> Evidence strength and sample size checks.</li>
                      </ul>

                      <div style={{ marginTop: 12, fontSize: 12, color: "var(--muted)" }}>
                        When you’re ready, we can connect this to an “insights” endpoint or compute it on the fly from evidence.
                      </div>
                    </div>
                  </div>
                </Card>

                <Card>
                  <SectionTitle title="Related evidence (optional)" subtitle="Kept here so insights can reference concrete examples." />
                  <div style={{ height: 10 }} />
                  {drawerLoading ? (
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>Loading…</div>
                  ) : (
                    <EvidenceList reviews={drawerReviews?.items ?? []} stakeholder={stakeholder} aspectFocus={drawerAspect} />
                  )}
                </Card>
              </div>
            )}

            {err ? (
              <div style={{ marginTop: 10, fontSize: 12, color: "var(--brand-red)", fontWeight: 800 }}>{err}</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** ---------- Evidence + charts + helpers ---------- */

function reviewHasStakeholderAspect(r: ReviewsResp["items"][0], stakeholder: string, aspect: string) {
  const mentioned = r.aspects_json?.mentioned_aspects ?? [];
  for (const m of mentioned) {
    if ((m?.stakeholder ?? "") !== stakeholder) continue;
    if ((m?.aspect ?? "") !== aspect) continue;
    return true;
  }
  return false;
}

function EvidenceList({
  reviews,
  stakeholder,
  aspectFocus,
}: {
  reviews: ReviewsResp["items"];
  stakeholder: string;
  aspectFocus: string;
}) {
  const snippets = useMemo(() => {
    const out: Array<{ aspect: string; sentiment: string; evidence: string; created_at: string }> = [];
    for (const r of reviews) {
      const mentioned = r.aspects_json?.mentioned_aspects ?? [];
      for (const m of mentioned) {
        if ((m?.stakeholder ?? "") !== stakeholder) continue;
        if (aspectFocus && (m?.aspect ?? "") !== aspectFocus) continue;
        if ((m?.evidence ?? "").trim().length < 2) continue;
        out.push({
          aspect: m.aspect,
          sentiment: m.sentiment,
          evidence: String(m.evidence).slice(0, 240),
          created_at: r.created_at,
        });
      }
    }
    out.sort((a, b) => {
      const s = scoreSentiment(b.sentiment) - scoreSentiment(a.sentiment);
      if (s !== 0) return s;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return out.slice(0, 10);
  }, [reviews, stakeholder, aspectFocus]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {snippets.map((s, idx) => (
        <div key={idx} style={evidenceCard}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 900 }}>{s.aspect}</div>
            <span style={{ fontSize: 12, fontWeight: 900, color: sentimentColor(s.sentiment) }}>{s.sentiment}</span>
          </div>
          <div style={{ marginTop: 6, fontSize: 13, color: "var(--text)" }}>“{s.evidence}”</div>
          <div style={{ marginTop: 8, fontSize: 12, color: "var(--muted)" }}>
            {new Date(s.created_at).toLocaleString()}
          </div>
        </div>
      ))}
      {!snippets.length ? (
        <div style={{ fontSize: 12, color: "var(--muted)" }}>
          No evidence snippets found for the current issue.
        </div>
      ) : null}
    </div>
  );
}

function StakeholderTrendChart({
  series,
  height = 280,
}: {
  series: Array<{ label: string; total: number; negative: number }>;
  height?: number;
}) {
  if (!series.length) {
    return <div style={{ fontSize: 12, color: "var(--muted)" }}>No trend data.</div>;
  }
  if (series.length === 1) {
    return <div style={{ fontSize: 12, color: "var(--muted)" }}>Only one bucket available.</div>;
  }

  const width = 980;
  const pad = 18;
  const maxY = Math.max(...series.map((s) => Math.max(s.total, s.negative)), 1);

  const x = (i: number) => pad + (i * (width - 2 * pad)) / (series.length - 1);
  const y = (v: number) => height - pad - (v * (height - 2 * pad)) / maxY;

  const pathFor = (key: "total" | "negative") =>
    series
      .map((s, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(s[key]).toFixed(1)}`)
      .join(" ");

  return (
    <div style={{ border: "1px solid rgba(0,0,0,0.06)", borderRadius: "var(--r-lg)", padding: 10, background: "var(--surface)" }}>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`}>
        <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="rgba(0,0,0,0.08)" />
        <path d={pathFor("total")} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth="2.5" />
        <path d={pathFor("negative")} fill="none" stroke="var(--brand-red)" strokeWidth="2.5" strokeDasharray="5 4" />

        <text x={pad} y={pad} fontSize="12" fill="rgba(0,0,0,0.60)" fontWeight="800">Total</text>
        <text x={pad + 52} y={pad} fontSize="12" fill="var(--brand-red)" fontWeight="900">Negative</text>

        <text x={x(0)} y={height - 4} fontSize="10" fill="rgba(0,0,0,0.55)" textAnchor="start">{series[0].label}</text>
        <text x={x(series.length - 1)} y={height - 4} fontSize="10" fill="rgba(0,0,0,0.55)" textAnchor="end">
          {series[series.length - 1].label}
        </text>
      </svg>
    </div>
  );
}

function ReviewCard({ r }: { r: ReviewsResp["items"][0] }) {
  const summaryText = r.aspects_json?.overall_summary ?? "";
  const mentioned = r.aspects_json?.mentioned_aspects ?? [];
  const badge = sentimentBadge(r.overall_sentiment);

  return (
    <details
      style={{
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: "var(--r-lg)",
        padding: 12,
        background: "rgba(255,255,255,0.95)",
      }}
    >
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

      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        {mentioned.length ? (
          mentioned.slice(0, 8).map((m: any, idx: number) => (
            <div
              key={idx}
              style={{
                border: "1px solid rgba(0,0,0,0.06)",
                borderRadius: 14,
                padding: 10,
                background: "var(--surface)",
              }}
            >
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontWeight: 900 }}>{m.aspect}</span>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>{m.stakeholder}</span>
                <span style={{ fontSize: 12, fontWeight: 900, color: sentimentColor(m.sentiment) }}>{m.sentiment}</span>
              </div>
              <div style={{ marginTop: 6, color: "#333", fontSize: 13 }}>“{m.evidence}”</div>
            </div>
          ))
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

function sentimentColor(sentiment: string) {
  if (sentiment === "Negative") return "var(--brand-red)";
  if (sentiment === "Positive") return "var(--ok)";
  return "var(--muted)";
}

function scoreSentiment(sent: string) {
  if (sent === "Negative") return 3;
  if (sent === "Neutral") return 2;
  if (sent === "Positive") return 1;
  return 0;
}

function buildRationale(aspect: string) {
  if (aspect.toLowerCase().includes("timeliness")) return "Customers report delays; focus on SLA adherence and dispatch/ETA accuracy.";
  if (aspect.toLowerCase().includes("driver")) return "Reports of driver behavior issues; tighten training and quality controls.";
  if (aspect.toLowerCase().includes("refund")) return "Refund handling complaints; streamline policies and reduce turnaround time.";
  if (aspect.toLowerCase().includes("customer_support")) return "Support is a recurring pain point; improve responsiveness and resolution quality.";
  if (aspect.toLowerCase().includes("app")) return "App UX/bugs are driving dissatisfaction; prioritize stability and core flows.";
  return "High-frequency negative driver; prioritize investigation and an operational fix plan.";
}

function bucketSeries(items: ReviewsResp["items"], bucket: Bucket) {
  const toKey = (d: Date) => {
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");

    if (bucket === "day") return `${yyyy}-${mm}-${dd}`;

    if (bucket === "week") {
      const tmp = new Date(Date.UTC(yyyy, d.getUTCMonth(), d.getUTCDate()));
      const day = tmp.getUTCDay() || 7;
      tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
      const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
      const weekNo = Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
      return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
    }

    return `${yyyy}-${mm}`;
  };

  const map = new Map<string, { total: number; negative: number }>();
  for (const r of items) {
    const dt = new Date(r.created_at);
    const key = toKey(dt);
    const cur = map.get(key) ?? { total: 0, negative: 0 };
    cur.total += 1;
    if (r.overall_sentiment === "Negative") cur.negative += 1;
    map.set(key, cur);
  }

  const labels = Array.from(map.keys()).sort();
  return labels.map((label) => ({
    label,
    total: map.get(label)!.total,
    negative: map.get(label)!.negative,
  }));
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  options: Array<{ label: string; value: string | number }>;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        minWidth: 220,
      }}
    >
      <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 800 }}>{label}</div>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={pillSelect}>
        {options.map((o) => (
          <option key={String(o.value)} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** ---------- styles ---------- */

const controlBar: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 12,
  padding: 14,
  borderRadius: 18,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "linear-gradient(90deg, rgba(217,2,23,0.08), rgba(255,255,255,0.92) 55%)",
  boxShadow: "0 10px 26px rgba(0,0,0,0.06)",
};

const controlGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
  alignItems: "end",
  flex: "1 1 520px",
  minWidth: 260,
};

const pillSelect: React.CSSProperties = {
  height: 34,
  padding: "0 10px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(255,255,255,0.85)",
  fontWeight: 900,
  fontSize: 12,
  outline: "none",
  cursor: "pointer",
};

const pillButton: React.CSSProperties = {
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(255,255,255,0.9)",
  borderRadius: 999,
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 900,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
};

const driversToast: React.CSSProperties = {
  position: "absolute",
  right: 0,
  top: 46,
  width: 360,
  maxWidth: "90vw",
  borderRadius: 18,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.97)",
  boxShadow: "0 18px 40px rgba(0,0,0,0.12)",
  padding: 12,
  zIndex: 20,
};

const xBtn: React.CSSProperties = {
  border: "none",
  background: "transparent",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 900,
  color: "var(--muted)",
  lineHeight: 1,
};

const driverRowBtn: React.CSSProperties = {
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 14,
  padding: "8px 10px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  cursor: "pointer",
};

const driverCount: React.CSSProperties = {
  minWidth: 34,
  textAlign: "center",
  padding: "2px 8px",
  borderRadius: 999,
  border: "1px solid rgba(217,2,23,0.25)",
  background: "rgba(217,2,23,0.08)",
  color: "var(--brand-red)",
  fontSize: 12,
  fontWeight: 900,
};

const actionCard: React.CSSProperties = {
  border: "1px solid rgba(0,0,0,0.06)",
  borderRadius: 18,
  padding: 12,
  background: "rgba(255,255,255,0.95)",
  display: "flex",
  gap: 12,
  alignItems: "flex-start",
};

const rankPill: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 12,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(217,2,23,0.10)",
  color: "var(--brand-red)",
  fontWeight: 900,
};

const aiLogo: React.CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: 8,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(217,2,23,0.14)",
  color: "var(--brand-red)",
  fontWeight: 900,
  fontSize: 11,
};

const aiBadgeLarge: React.CSSProperties = {
  width: 52,
  height: 52,
  borderRadius: 18,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(217,2,23,0.12)",
  color: "var(--brand-red)",
  fontWeight: 900,
  fontSize: 16,
  border: "1px solid rgba(217,2,23,0.20)",
};

const evidenceCard: React.CSSProperties = {
  border: "1px solid rgba(0,0,0,0.06)",
  borderRadius: 18,
  padding: 12,
  background: "rgba(255,255,255,0.95)",
};

const scrollBox: React.CSSProperties = {
  flex: "1 1 auto",
  overflowY: "auto",
  scrollbarGutter: "stable",
  border: "1px solid rgba(0,0,0,0.06)",
  borderRadius: "var(--r-lg)",
  background: "rgba(255,255,255,0.9)",
  padding: 10,
};

const drawerOverlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.35)",
  zIndex: 50,
  display: "flex",
  justifyContent: "flex-end",
};

const drawerPanel: React.CSSProperties = {
  width: "min(1100px, 96vw)",
  height: "100%",
  background: "rgba(255,255,255,0.97)",
  borderLeft: "1px solid rgba(0,0,0,0.10)",
  padding: 16,
  overflowY: "auto",
};
