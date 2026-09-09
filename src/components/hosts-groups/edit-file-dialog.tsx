"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { YamlEditor } from "@/components/yaml-editor";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function EditFileDialog({
  open,
  onOpenChange,
  title,
  description,
  value,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  value: string;
  onSave: (content: string) => Promise<void>;
}) {
  const [text, setText] = useState(value);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setText(value);
  }, [open, value]);

  async function submit() {
    setBusy(true);
    try {
      await onSave(text);
      toast.success("Saved");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <YamlEditor
          value={text}
          onChange={setText}
          className="min-h-[16rem] rounded-lg"
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
