import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  productionBrowserSourceMaps: false,
  outputFileTracingIncludes: {
    "/*": ["./docs/**/*.md"],
  },
  outputFileTracingExcludes: {
    "/*": [".env", ".env.*", "data/**"],
  },
};

export default nextConfig;
