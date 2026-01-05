"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "./ui"; // adjust if your Button is in a different path
import { runPipeline, getPipelineJob } from "../lib/api"; // adjust path if needed

type JobState = "queued" | "running" | "succeeded" | "failed";

export default function NavTabs() {
  const pathname = usePathname();

  const tabs = [
    { label: "Overview", href: "/overview" },
    { label: "Stakeholders", href: "/stakeholders" },
    { label: "Reviews", href: "/reviews" },
  ];

  const [jobId, setJobId] = useState<string>("");
  const [jobState, setJobState] = useState<JobState | "">("");
  const [jobMsg, setJobMsg] = useState<string>("");
  const [running, setRunning] = useState(false);

  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

  async function startPipeline() {
    try {
      setJobMsg("");
      setJobState("queued");
      setRunning(true);

      // tweak defaults as you like
      const r = await runPipeline({ vertical: "food", pages: 2, count: 200, batch: 50 });
      setJobId(r.job_id);

      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = window.setInterval(async () => {
        try {
          const j = await getPipelineJob(r.job_id);
          setJobState(j.state);

          if (j.state === "succeeded") {
            setRunning(false);
            setJobMsg("Pipeline completed.");
            if (pollRef.current) window.clearInterval(pollRef.current);
          } else if (j.state === "failed") {
            setRunning(false);
            setJobMsg(j.error || "Pipeline failed.");
            if (pollRef.current) window.clearInterval(pollRef.current);
          }
        } catch (e: any) {
          setRunning(false);
          setJobMsg(e?.message ?? String(e));
          if (pollRef.current) window.clearInterval(pollRef.current);
        }
      }, 1200);
    } catch (e: any) {
      setRunning(false);
      setJobMsg(e?.message ?? String(e));
    }
  }

  const stateLabel =
    jobState === "queued"
      ? "Queued"
      : jobState === "running"
      ? "Running"
      : jobState === "succeeded"
      ? "Done"
      : jobState === "failed"
      ? "Failed"
      : "";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      {/* Tabs */}
      <div
        style={{
          display: "inline-flex",
          gap: 6,
          padding: 6,
          borderRadius: 999,
          border: "1px solid var(--border)",
          background: "rgba(255,255,255,0.7)",
        }}
      >
        {tabs.map((t) => {
          const active = pathname === t.href || (t.href !== "/" && pathname?.startsWith(t.href));
          return (
            <Link
              key={t.href}
              href={t.href}
              style={{
                padding: "8px 12px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 900,
                textDecoration: "none",
                color: active ? "var(--white)" : "var(--text)",
                background: active ? "var(--brand-red)" : "transparent",
              }}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {/* Run pipeline */}
      <Button variant="secondary" onClick={startPipeline} disabled={running}>
        {running ? "Running…" : "Run pipeline"}
      </Button>

      {/* Status */}
      {jobState ? (
        <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 800 }}>
          {stateLabel}
        </span>
      ) : null}

      {jobMsg ? (
        <span
          style={{
            fontSize: 12,
            fontWeight: 800,
            color: jobState === "failed" ? "var(--brand-red)" : "var(--muted)",
            maxWidth: 320,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          title={jobMsg}
        >
          {jobMsg}
        </span>
      ) : null}
    </div>
  );
}
