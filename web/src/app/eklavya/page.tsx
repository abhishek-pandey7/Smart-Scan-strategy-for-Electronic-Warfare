import type { Metadata } from "next";
import EklavyaLab from "@/components/eklavya/EklavyaLab";

export const metadata: Metadata = {
  title: "Eklavya math",
  description: "Eklavya's scoring equation evaluated live on a replay: exploit, discovery and information gain per second of listening, at every decision.",
};

export default function EklavyaPage() {
  return <EklavyaLab />;
}
