import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  experimental: {
    // Keep Phosphor tree-shakeable when importing named icons from the package root.
    optimizePackageImports: ["@phosphor-icons/react"],
  },
};

export default nextConfig;
