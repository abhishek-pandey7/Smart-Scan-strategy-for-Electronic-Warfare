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

// Chat apps cut the description at roughly 70 characters, so the result leads and the
// explanation follows: truncation then costs context, not the point.
const DESCRIPTION =
  "Catches 69.8% of radar flashes where a fixed sweep catches 16.8%. "
  + "An electronic-support receiver that learns when and where to listen.";

export const metadata: Metadata = {
  // Absolute URLs for og:image et al. are built from this; without it a relative
  // image is a build error and link previews come out blank.
  metadataBase: new URL("https://eklavya-e5l.pages.dev"),
  title: { default: "Ekalavya", template: "%s · Ekalavya" },
  description: DESCRIPTION,
  applicationName: "Ekalavya",
  openGraph: {
    type: "website",
    siteName: "Ekalavya",
    title: "Ekalavya",
    description: DESCRIPTION,
    url: "/",
    images: [{ url: "/og.png", width: 1200, height: 630, type: "image/png",
               alt: "Ekalavya: 69.8% of flashes caught, against 16.8% for a fixed sweep" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Ekalavya",
    description: DESCRIPTION,
    images: ["/og.png"],
  },
  icons: {
    icon: [{ url: "/icon.png", type: "image/png", sizes: "512x512" }],
    apple: "/apple-touch-icon.png",
  },
};

/** A drawn bow, arrow aimed at the flash it intercepts. Geometry mirrors scripts/make_brand.py. */
function BrandMark({ id }: { id: string }) {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden>
      <defs>
        <clipPath id={id}><rect width={32} height={32} rx={9.5} /></clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>
        <rect width={32} height={32} fill="var(--text-primary)" />
        <path d="M11 5.5Q24 16 11 26.5" fill="none" stroke="var(--page)" strokeWidth={2.1} strokeLinecap="round" />
        <path d="M11 5.5V26.5" fill="none" stroke="var(--page)" strokeWidth={1.3} strokeLinecap="round" opacity={0.55} />
        <path d="M5.5 16H21" fill="none" stroke="var(--page)" strokeWidth={2.1} strokeLinecap="round" />
        <circle cx={25} cy={16} r={3} fill="var(--accent)" />
      </g>
    </svg>
  );
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${serif.variable}`}>
      <body>
        <header className="topbar">
          <div className="topbar-inner">
            <Link href="/" className="brand"><BrandMark id="brand-glow-top" />Ekalavya<small>for electronic support receivers</small></Link>
            <Nav />
          </div>
        </header>
        <main className="shell">{children}</main>
        <footer className="site-footer">
          <div className="site-footer-inner">
            <div>
              <Link href="/" className="brand"><BrandMark id="brand-glow-foot" />Ekalavya</Link>
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
