"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";

import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  downloadPrivateKey,
  downloadPublicKey,
  fetchGlobalSecretExport,
  fetchProjectSecretExport,
} from "@/lib/secret-keys";
import { cn } from "@/lib/utils";

export function SecretKeyDownloadMenu({
  kind,
  projectId,
  name,
  secretId,
}: {
  kind: "project" | "global";
  projectId?: string;
  name: string;
  secretId?: string;
}) {
  const [busy, setBusy] = useState(false);

  async function download(which: "public" | "private") {
    setBusy(true);
    try {
      const data =
        kind === "project"
          ? await fetchProjectSecretExport(projectId || "", name)
          : await fetchGlobalSecretExport(secretId || "");
      const label = data.name || name;
      if (which === "public") {
        if (!data.publicKey) throw new Error("Public key is not stored");
        downloadPublicKey(label, data.publicKey);
        toast.success("Public key downloaded");
      } else {
        if (!data.privateKey) throw new Error("Private key is not stored");
        downloadPrivateKey(label, data.privateKey);
        toast.success("Private key downloaded");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={busy}
        className={cn(buttonVariants({ variant: "ghost", size: "xs" }))}
      >
        <Download />
        Keys
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuItem
          disabled={busy}
          onClick={() => void download("public")}
        >
          Download public key
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={busy}
          onClick={() => void download("private")}
        >
          Download private key
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
