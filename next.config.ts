import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  productionBrowserSourceMaps: false,
  outputFileTracingIncludes: {
    "/*": ["./docs/**/*.md", "./documentation/**/*.md", "./README.md", "./CONTRIBUTING.md"],
  },
  outputFileTracingExcludes: {
    "/*": [".env", ".env.*", "data/**"],
  },
};

export default nextConfig;
