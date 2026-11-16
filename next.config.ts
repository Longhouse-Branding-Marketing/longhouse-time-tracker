import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  allowedDevOrigins: ["127.0.0.1"],
  experimental: {
    // Repair / settings server actions; CSV import uses /api/import/* instead.
    serverActions: {
      bodySizeLimit: "4mb",
    },
    optimizePackageImports: ["@phosphor-icons/react"],
  },
};

export default nextConfig;
