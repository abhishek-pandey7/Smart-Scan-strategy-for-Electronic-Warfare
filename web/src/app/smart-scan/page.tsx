import type { Metadata } from "next";
import SmartScanLab from "@/components/smartscan/SmartScanLab";

export const metadata: Metadata = {
  title: "Smart Scan math",
  description: "Smart Scan's scoring equation evaluated live on a replay: exploit, discovery and information gain per second of listening, at every decision.",
};

export default function SmartScanPage() {
  return <SmartScanLab />;
}
