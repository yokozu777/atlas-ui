import type { NextConfig } from "next";

const dockerStandalone = process.env.DOCKER_STANDALONE === "1";

const nextConfig: NextConfig = {
  ...(dockerStandalone ? { output: "standalone" as const } : {}),
  ...(dockerStandalone ? { typescript: { ignoreBuildErrors: true } } : {}),
  productionBrowserSourceMaps: false,
  outputFileTracingIncludes: {
    "/*": ["./docs/**/*.md", "./documentation/**/*.md", "./README.md", "./CONTRIBUTING.md"],
  },
  outputFileTracingExcludes: {
    "/*": [".env", ".env.*", "data/**"],
  },
};

export default nextConfig;
