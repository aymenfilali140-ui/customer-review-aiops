"use client";

import React from "react";

export function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-xl)",
        boxShadow: "var(--shadow-sm)",
        padding: 16,
      }}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
      <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.2 }}>{title}</div>
      {subtitle ? <div style={{ fontSize: 12, color: "var(--muted)" }}>{subtitle}</div> : null}
    </div>
  );
}

export function Button({
  children,
  variant = "primary",
  onClick,
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  onClick?: () => void;
}) {
  const styles: Record<string, React.CSSProperties> = {
    primary: {
      background: "var(--brand-red)",
      color: "var(--white)",
      border: "1px solid transparent",
    },
    secondary: {
      background: "var(--white)",
      color: "var(--brand-red)",
      border: "1px solid rgba(217,2,23,0.35)",
    },
    ghost: {
      background: "transparent",
      color: "var(--text)",
      border: "1px solid var(--border)",
    },
  };

  return (
    <button
      onClick={onClick}
      style={{
        borderRadius: 999,
        padding: "8px 12px",
        cursor: "pointer",
        fontWeight: 700,
        ...styles[variant],
      }}
    >
      {children}
    </button>
  );
}

export function Chip({ label, onClear }: { label: string; onClear?: () => void }) {
  return (
    <span
      style={{
        display: "inline-flex",
        gap: 8,
        alignItems: "center",
        border: "1px solid var(--border)",
        background: "rgba(255,255,255,0.9)",
        borderRadius: 999,
        padding: "6px 10px",
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 700 }}>{label}</span>
      {onClear ? (
        <button
          onClick={onClear}
          style={{ border: "none", background: "transparent", cursor: "pointer", fontWeight: 900 }}
          aria-label="Clear"
        >
          ×
        </button>
      ) : null}
    </span>
  );
}

export function Select({
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
    <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
      <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          borderRadius: 999,
          border: "1px solid var(--border)",
          background: "var(--surface)",
          padding: "8px 12px",
          outline: "none",
        }}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Stat({
  title,
  value,
  hint,
}: {
  title: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>{title}</div>
        <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -0.2 }}>{value}</div>
        {hint ? <div style={{ fontSize: 12, color: "var(--muted)" }}>{hint}</div> : null}
      </div>
    </Card>
  );
}

export const th: React.CSSProperties = {
  textAlign: "left",
  borderBottom: "1px solid var(--border)",
  padding: "10px 8px",
  fontSize: 12,
  color: "var(--muted)",
  fontWeight: 800,
};

export const td: React.CSSProperties = {
  borderBottom: "1px solid rgba(0,0,0,0.06)",
  padding: "10px 8px",
  verticalAlign: "top",
  fontSize: 13,
};
