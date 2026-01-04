import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import NavTabs from "../components/NavTabs";


const altform = localFont({
  variable: "--font-snoonu-latin",
  display: "swap",
  src: [
    { path: "./fonts/Altform-Regular.otf", weight: "400", style: "normal" },
    { path: "./fonts/Altform-RegularItalic.otf", weight: "400", style: "italic" },
    { path: "./fonts/Altform-Bold.otf", weight: "700", style: "normal" },
    { path: "./fonts/Altform-BoldItalic.otf", weight: "700", style: "italic" },
    { path: "./fonts/Altform-Black.otf", weight: "900", style: "normal" },
    { path: "./fonts/Altform-BlackItalic.otf", weight: "900", style: "italic" },
  ],
});

const estedad = localFont({
  variable: "--font-snoonu-arabic",
  display: "swap",
  src: [
    { path: "./fonts/Estedad-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/Estedad-Medium.woff2", weight: "500", style: "normal" },
    { path: "./fonts/Estedad-SemiBold.woff2", weight: "600", style: "normal" },
    { path: "./fonts/Estedad-Bold.woff2", weight: "700", style: "normal" },
    { path: "./fonts/Estedad-ExtraBold.woff2", weight: "800", style: "normal" },
  ],
});

export const metadata: Metadata = {
  title: "Customer Reviews AIOps",
  description: "Snoonu — Customer reviews intelligence dashboard",
  icons: {
    icon: "/snoonu-s.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${altform.variable} ${estedad.variable}`}>
      <body>
        <div className="topbar">
          <div className="container topbar-inner">
            <div className="brand">
              <div className="brand-badge">
                {/* Uses your provided S icon */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/snoonu-s.png" alt="Snoonu" style={{ width: 22, height: 22 }} />
              </div>
              <div className="brand-title">
                <strong>Customer Reviews AIOps</strong>
                <span>Snoonu internal prototype</span>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <NavTabs />
              <span style={{ color: "var(--muted)", fontSize: 12 }}>
                API: {process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000"}
              </span>
            </div>
          </div>
        </div>

        <div className="container page">{children}</div>
      </body>
    </html>
  );
}
