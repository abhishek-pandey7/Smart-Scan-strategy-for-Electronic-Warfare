"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const NAV_LINKS = [
  { href: "/", label: "Overview" },
  { href: "/mission", label: "Mission" },
  { href: "/how-it-decides", label: "How it decides" },
  { href: "/benchmark", label: "Benchmark" },
] as const;

export default function Nav() {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));
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
