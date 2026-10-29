import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // e2e builds into its own folder, so it runs alongside your dev server (Next allows one per build folder).
  // Sharing .next/dev with a server on another env sometimes left e2e pages reloading in a loop.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
