import type { NextConfig } from "next";

const API = process.env.PRIMES_API_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  // Allow opening the dev server as 127.0.0.1 as well as localhost (demo machines, headless checks).
  allowedDevOrigins: ["127.0.0.1"],
  // The Python backend does the replays; the browser only talks to this origin.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API}/api/:path*` }];
  },
  experimental: {
    // A PRIMES replay on a large Turing scenario can take ~1 minute on first request.
    proxyTimeout: 600_000,
  },
};

export default nextConfig;
