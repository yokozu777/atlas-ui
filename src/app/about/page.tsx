import packageJson from "../../../package.json";

import { AboutPage } from "@/components/about-page";

export const dynamic = "force-dynamic";

export default function AboutRoute() {
  const nextVersion = String(packageJson.dependencies.next).replace(/^[^\d]*/, "");
  return (
    <AboutPage
      consoleVersion={packageJson.version}
      nextVersion={nextVersion}
    />
  );
}
