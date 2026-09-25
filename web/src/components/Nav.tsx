"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const NAV_LINKS = [
  { href: "/", label: "Overview" },
  { href: "/mission", label: "Mission" },
  { href: "/how-it-decides", label: "How it decides" },
  { href: "/smart-scan", label: "Smart Scan math" },
  { href: "/benchmark", label: "Benchmark" },
] as const;

function useIsActive() {
  const path = usePathname();
  return (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));
}

export default function Nav() {
  const active = useIsActive();
  return (
    <nav className="nav" aria-label="Main">
      {NAV_LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={active(l.href) ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

export function FooterNav() {
  const active = useIsActive();
  return (
    <nav className="site-footer-nav" aria-label="Footer">
      {NAV_LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={active(l.href) ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
