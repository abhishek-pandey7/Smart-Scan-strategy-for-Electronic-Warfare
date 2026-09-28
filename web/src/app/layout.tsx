import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import Nav, { FooterNav } from "@/components/Nav";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });
const serif = Newsreader({
  subsets: ["latin"], variable: "--font-serif", display: "swap", style: ["normal", "italic"], axes: ["opsz"],
});

export const metadata: Metadata = {
  title: { default: "Smart Scan", template: "%s · Smart Scan" },
  description: "A receiver scheduler that learns when and where to listen, so it catches radar flashes a fixed sweep misses.",
};

function BrandMark({ id }: { id: string }) {
  return (
    <svg className="brand-mark" viewBox="0 0 30 30" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f3a052" />
          <stop offset="1" stopColor="#c2581a" />
        </linearGradient>
      </defs>
      <rect width={30} height={30} rx={9} fill="var(--text-primary)" />
      <path d="M6 20c2.5 0 2.5-10 5-10s2.5 10 5 10 2.5-10 5-10 2.5 10 3 10" fill="none" stroke="var(--page)" strokeWidth={1.9} strokeLinecap="round" />
      <circle cx={21} cy={10} r={2.9} fill={`url(#${id})`} stroke="var(--text-primary)" strokeWidth={1.2} />
    </svg>
  );
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${serif.variable}`}>
      <body>
        <header className="topbar">
          <div className="topbar-inner">
            <Link href="/" className="brand"><BrandMark id="brand-glow-top" />Smart Scan<small>for electronic support receivers</small></Link>
            <Nav />
          </div>
        </header>
        <main className="shell">{children}</main>
        <footer className="site-footer">
          <div className="site-footer-inner">
            <div>
              <Link href="/" className="brand"><BrandMark id="brand-glow-foot" />Smart Scan</Link>
              <p className="site-footer-tag">
                A receiver scheduler that learns each radar&apos;s rhythm and spends its listening time where the next flash will be.
              </p>
            </div>
            <FooterNav />
            <div className="site-footer-note">
              <span>Research demo · every receiver replays identical ground truth</span>
              <span>Light mode · built for 1920 × 1080</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
