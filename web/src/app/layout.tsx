import type { Metadata } from "next";
import Nav from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "PRIMES · Smart Scan for Electronic Support",
  description: "Machine-learning ES receiver scheduler: learn when and where to look, without prior intelligence.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <div className="brand">PRIMES<small>Smart scan strategy for electronic support</small></div>
          <Nav />
        </header>
        <main className="shell">{children}</main>
      </body>
    </html>
  );
}
