import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

export default function nextConfig(phase: string): NextConfig {
  const isDevServer = phase === PHASE_DEVELOPMENT_SERVER;

  return {
    reactStrictMode: true,
    outputFileTracingRoot: process.cwd(),
    // Isolate dev output from production build output to avoid stale/missing chunk conflicts.
    distDir: isDevServer ? ".next-dev" : ".next",
  };
}
