"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

export type ChangeReviewLine = {
  id: string;
  label: string;
  from: string;
  to: string;
  secret?: boolean;
  note?: "added" | "removed";
};

export type ChangeReviewGroup = {
  id: string;
  title: string;
  lines: ChangeReviewLine[];
};

export function ChangesReviewDialog({
  open,
  onOpenChange,
  groups,
  busy = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: ChangeReviewGroup[];
  busy?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="z-[80] bg-black/50 supports-backdrop-filter:backdrop-blur-none"
        className="z-[80] flex max-h-[min(32rem,80vh)] flex-col gap-0 overflow-hidden !bg-[#1c1c1f] p-0 sm:max-w-lg"
        style={{ backgroundColor: "#1c1c1f" }}
      >
        <div className="px-4 pt-4 pr-12 pb-3">
          <DialogTitle>Review changes</DialogTitle>
          <DialogDescription className="mt-1">
            These edits are saved when you confirm.
          </DialogDescription>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-border px-4 py-3">
          {groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">No unsaved changes.</p>
          ) : (
            <div className="space-y-3">
              {groups.map((group) => (
                <div key={group.id}>
                  <p className="truncate font-mono text-[11px] text-foreground/80">
                    {group.title}
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {group.lines.map((line) => (
                      <li
                        key={line.id}
                        className="flex min-w-0 items-baseline gap-2 text-[12px]"
                      >
                        <span className="w-40 shrink-0 truncate text-muted-foreground sm:w-52">
                          {line.label}
                        </span>
                        {line.secret ? (
                          <span className="truncate text-foreground">updated</span>
                        ) : line.note ? (
                          <span className="truncate text-foreground">{line.note}</span>
                        ) : (
                          <span className="min-w-0 truncate font-mono text-[11px]">
                            <span className="text-muted-foreground">{line.from}</span>
                            <span className="px-1 text-muted-foreground/70">→</span>
                            <span>{line.to}</span>
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy || groups.length === 0}
            onClick={onConfirm}
          >
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
