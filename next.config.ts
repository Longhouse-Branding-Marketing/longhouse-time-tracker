import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  experimental: {
    // Repair / settings server actions; CSV import uses /api/import/* instead.
    serverActions: {
      bodySizeLimit: "4mb",
    },
    optimizePackageImports: ["@phosphor-icons/react"],
  },
};

export default nextConfig;
