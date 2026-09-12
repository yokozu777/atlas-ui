import { SetupForm } from "@/components/setup-form";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { defaultDest, defaultGitUrl } from "@/server/clusterctl-defaults";

export const dynamic = "force-dynamic";

export default function SetupPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <PageHeader
        kicker="Setup"
        title="Clusterctl path"
        description={
          <>
            Clone atlas-clusterctl from GitHub or point at an existing checkout.
            atlas-ui only spawns <code className="font-mono">./cluster</code>{" "}
            inside that directory. Bind is loopback — same trust as a shell on
            this host.
          </>
        }
      />
      <Panel className="p-6">
        <SetupForm defaultPath={defaultDest()} defaultGitUrl={defaultGitUrl()} />
      </Panel>
    </div>
  );
}
