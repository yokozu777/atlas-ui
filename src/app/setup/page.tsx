import { SetupForm } from "@/components/setup-form";
import { PageHeader } from "@/components/page-header";

export default function SetupPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <PageHeader
        kicker="Setup"
        title="Clusterctl path"
        description={
          <>
            atlas-ui only spawns <code className="font-mono">./cluster</code>{" "}
            inside the checkout you name. Bind is loopback — same trust as a
            shell on this host.
          </>
        }
      />
      <SetupForm defaultPath="../atlas-clusterctl" />
    </div>
  );
}
