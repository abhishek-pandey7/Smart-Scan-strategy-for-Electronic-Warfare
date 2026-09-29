import type { Metadata } from "next";
import EklavyaLab from "@/components/eklavya/EklavyaLab";

export const metadata: Metadata = {
  title: "Ekalavya math",
  description: "Ekalavya's scoring equation evaluated live on a replay: exploit, discovery and information gain per second of listening, at every decision.",
};

export default function EklavyaPage() {
  return <EklavyaLab />;
}
