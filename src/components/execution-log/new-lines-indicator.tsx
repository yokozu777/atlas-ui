"use client";

import { ArrowDown } from "lucide-react";

import { Button } from "@/components/ui/button";

export function NewLinesIndicator({
  count,
  onClick,
}: {
  count: number;
  onClick: () => void;
}) {
  if (count <= 0) {
    return null;
  }
  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      data-slot="new-lines-indicator"
      className="absolute right-4 bottom-4 z-20 shadow-md"
      onClick={onClick}
    >
      <ArrowDown />
      {count.toLocaleString()} new line{count === 1 ? "" : "s"}
    </Button>
  );
}
