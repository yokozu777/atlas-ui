"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/confirm-action";
import { useJobSession } from "@/components/job-session";
import { Button } from "@/components/ui/button";
import { maskArgvPreview } from "@/lib/mask-secrets";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

export function RunSheet({
  clusterId,
  open,
  onOpenChange,
  initialPhases = "",
  initialLimit = "",
}: {
  clusterId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPhases?: string;
  initialLimit?: string;
}) {
  const { startJob } = useJobSession();
  const [phases, setPhases] = useState(initialPhases);
  const [tags, setTags] = useState("all");
  const [limit, setLimit] = useState(initialLimit);
  const [extraVars, setExtraVars] = useState("");
  const [rootSsh, setRootSsh] = useState(false);
  const [gitSsh, setGitSsh] = useState(false);
  const [dryRun, setDryRun] = useState(false);
  const [executor, setExecutor] = useState("default");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const argv = useMemo(() => {
    const built: string[] = ["run"];
    if (executor && executor !== "default") {
      built.push("--executor", executor);
    }
    if (phases.trim()) {
      built.push("--phases", phases.trim());
    }
    if (tags.trim() && tags.trim() !== "all") {
      built.push("--tags", tags.trim());
    }
    if (limit.trim()) {
      built.push("--limit", limit.trim());
    }
    for (const line of extraVars.split("\n")) {
      const item = line.trim();
      if (item) built.push("-e", item);
    }
    if (rootSsh) built.push("--root-ssh");
    if (gitSsh) built.push("--git-ssh");
    if (dryRun) built.push("--dry-run");
    return built;
  }, [phases, tags, limit, extraVars, rootSsh, gitSsh, dryRun, executor]);

  const preview = maskArgvPreview(argv);

  async function onConfirm() {
    setBusy(true);
    try {
      await startJob({ argv, clusterId, wait: false });
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="w-full border-t-2 border-t-primary sm:max-w-lg"
          showCloseButton
        >
          <SheetHeader>
            <SheetTitle className="font-display">Run</SheetTitle>
            <SheetDescription className="font-mono text-xs">
              {clusterId}
            </SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4">
            <p className="font-mono text-xs text-muted-foreground break-all">
              {preview}
            </p>
            <div className="space-y-2">
              <Label htmlFor="phases">--phases</Label>
              <Input
                id="phases"
                value={phases}
                onChange={(e) => setPhases(e.target.value)}
                placeholder="NAME | start..end | a,b,c"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tags">--tags</Label>
              <Input
                id="tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="limit">--limit</Label>
              <Input
                id="limit"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="e">-e extra-vars (one per line)</Label>
              <Textarea
                id="e"
                value={extraVars}
                onChange={(e) => setExtraVars(e.target.value)}
                rows={3}
                placeholder="provision_mode=destroy"
              />
            </div>
            <div className="space-y-2">
              <Label>executor</Label>
              <Select
                value={executor}
                onValueChange={(value) => setExecutor(value ?? "default")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">cluster default</SelectItem>
                  <SelectItem value="local">local</SelectItem>
                  <SelectItem value="docker">docker</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Label className="font-normal">
              <Checkbox
                checked={rootSsh}
                onCheckedChange={(value) => setRootSsh(value === true)}
              />
              --root-ssh
            </Label>
            <Label className="font-normal">
              <Checkbox
                checked={gitSsh}
                onCheckedChange={(value) => setGitSsh(value === true)}
              />
              --git-ssh
            </Label>
            <Label className="font-normal">
              <Checkbox
                checked={dryRun}
                onCheckedChange={(value) => setDryRun(value === true)}
              />
              --dry-run
            </Label>
          </div>
          <SheetFooter>
            <Button
              type="button"
              disabled={busy}
              onClick={() => setConfirmOpen(true)}
            >
              Run
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <ConfirmAction
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Run on ${clusterId}?`}
        description={preview}
        confirmLabel="Run"
        onConfirm={onConfirm}
      />
    </>
  );
}
