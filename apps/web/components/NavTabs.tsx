"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = {
  label: string;
  href: string;
};

const TABS: Tab[] = [
  { label: "Overview", href: "/overview" },
  { label: "Stakeholders", href: "/stakeholders" },
  { label: "Reviews", href: "/reviews" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export default function NavTabs() {
  const pathname = usePathname() || "/";

  return (
    <nav
      aria-label="Primary navigation"
      style={{
        display: "inline-flex",
        gap: 6,
        padding: 6,
        borderRadius: 999,
        border: "1px solid var(--border)",
        background: "rgba(255,255,255,0.7)",
      }}
    >
      {TABS.map((t) => {
        const active = isActive(pathname, t.href);

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
              border: active ? "1px solid rgba(0,0,0,0.06)" : "1px solid transparent",
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
