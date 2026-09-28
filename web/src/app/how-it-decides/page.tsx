import type { Metadata } from "next";
import { Suspense } from "react";
import HowItDecides from "@/components/explain/HowItDecides";

export const metadata: Metadata = {
  title: "How it decides",
  description: "Smart Scan's predict-then-score decision loop, replayed decision by decision, and the Double-DQN reinforcement learning comparator.",
};

export default function HowItDecidesPage() {
  return (
    <Suspense fallback={<div className="notice" style={{ marginTop: 40 }}>Loading…</div>}>
      <HowItDecides />
    </Suspense>
  );
}
