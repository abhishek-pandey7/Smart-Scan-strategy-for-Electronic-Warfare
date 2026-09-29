import type { NextConfig } from "next";

const API = process.env.EKLAVYA_API_URL ?? "http://127.0.0.1:8000";
// Static export for free hosting (Cloudflare Pages / Vercel): the API is baked into
// web/public/api by scripts/export_static.py, so there is no backend to proxy to.
const STATIC = process.env.NEXT_PUBLIC_STATIC === "1";

const nextConfig: NextConfig = {
  ...(STATIC ? { output: "export" as const, images: { unoptimized: true } } : {}),
  // Allow opening the dev server as 127.0.0.1 as well as localhost (demo machines, headless checks).
  allowedDevOrigins: ["127.0.0.1"],
  // The Python backend does the replays; the browser only talks to this origin.
  // A static build has no rewrites: it reads the baked JSON directly.
  ...(STATIC ? {} : {
    async rewrites() {
      return [{ source: "/api/:path*", destination: `${API}/api/:path*` }];
    },
    experimental: {
      // An Ekalavya replay on a large Turing scenario can take ~1 minute on first request.
      proxyTimeout: 600_000,
    },
  }),
};

export default nextConfig;
