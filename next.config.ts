import type { NextConfig } from "next";

/** Where the app lives: Meta's webhook and the Google sign-in point here */
const CANONICAL = "https://www.wardrobe-stylist.xyz";

const nextConfig: NextConfig = {
  // e2e builds into its own folder, so it runs alongside your dev server (Next allows one per build folder).
  // Sharing .next/dev with a server on another env sometimes left e2e pages reloading in a loop.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async redirects() {
    // production only, so preview deployments stay reachable on their own .vercel.app urls
    if (process.env.VERCEL_ENV !== "production") return [];
    return [{
      // the cron isn't redirected: Vercel may call it on the .vercel.app url, and it doesn't follow redirects
      source: "/:path((?!api/cron/).*)",
      has: [{ type: "host", value: ".*\\.vercel\\.app" }],
      destination: `${CANONICAL}/:path`,
      permanent: false,
    }];
  },
};

export default nextConfig;
