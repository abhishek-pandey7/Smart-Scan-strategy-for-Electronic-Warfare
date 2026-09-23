import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import Nav from "@/components/Nav";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Smart Scan", template: "%s · Smart Scan" },
  description: "A receiver scheduler that learns when and where to listen, so it catches radar flashes a fixed sweep misses.",
};

function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 26 26" aria-hidden>
      <rect width={26} height={26} rx={7} fill="var(--text-primary)" />
      <path d="M5 17.5c2.2 0 2.2-9 4.4-9s2.2 9 4.4 9 2.2-9 4.4-9 2.2 9 2.8 9" fill="none" stroke="var(--page)" strokeWidth={1.8} strokeLinecap="round" />
      <circle cx={18.2} cy={8.5} r={2.4} fill="var(--accent)" stroke="var(--text-primary)" strokeWidth={1} />
    </svg>
  );
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <header className="topbar">
          <div className="topbar-inner">
            <Link href="/" className="brand"><BrandMark />Smart Scan<small>for electronic support receivers</small></Link>
            <Nav />
          </div>
        </header>
        <main className="shell">{children}</main>
      </body>
    </html>
  );
}
