"use client";

import { CheckCircle2, ChevronDown, ChevronUp, Plus, Trash2, XCircle } from "lucide-react";

import { Panel } from "@/components/panel";
import {
  hostsList,
  playValidationOf,
  type Play,
  type PlaybookValidation,
} from "@/components/playbook-editor/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PlaysSidebar({
  plays,
  selectedId,
  validation,
  onSelect,
  onAdd,
  onDelete,
  onMove,
}: {
  plays: Play[];
  selectedId: string | null;
  validation: PlaybookValidation | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDelete: (play: Play) => void;
  onMove: (index: number, delta: number) => void;
}) {
  return (
    <Panel className="flex w-[280px] shrink-0 flex-col">
      <div className="space-y-3 border-b border-foreground/10 p-4">
        <p className="text-[13px] font-medium tracking-wide text-muted-foreground uppercase">
          Plays
        </p>
        <Button className="w-full" size="sm" onClick={onAdd}>
          <Plus />
          Add Play
        </Button>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {plays.length === 0 ? (
          <p className="px-2 py-8 text-center text-sm text-muted-foreground">
            No plays yet
          </p>
        ) : (
          plays.map((play, index) => {
            const id = play.id || "";
            const selected = id === selectedId;
            const playVal = playValidationOf(validation, id);
            const hasErrors = Boolean(playVal?.errors?.length);
            const hosts = hostsList(play.hosts);
            const roles = play.roles?.length ?? 0;
            return (
              <div
                key={id || index}
                className={cn(
                  "rounded-lg border p-3",
                  selected ? "border-primary bg-primary/5" : "border-border",
                )}
              >
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto w-full justify-start rounded-md p-0 font-normal"
                  onClick={() => onSelect(id)}
                >
                  <div className="mb-1 flex items-center gap-2">
                    {hasErrors ? (
                      <XCircle className="size-4 text-destructive" />
                    ) : (
                      <CheckCircle2 className="size-4 text-success" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {play.name || "Unnamed Play"}
                    </span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {hosts[0] || "no hosts"} · {roles} roles
                  </p>
                </Button>
                <div className="mt-2 flex items-center justify-end gap-1">
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    disabled={index === 0}
                    onClick={() => onMove(index, -1)}
                    aria-label="Move play up"
                  >
                    <ChevronUp />
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    disabled={index === plays.length - 1}
                    onClick={() => onMove(index, 1)}
                    aria-label="Move play down"
                  >
                    <ChevronDown />
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => onDelete(play)}
                    aria-label="Delete play"
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Panel>
  );
}
