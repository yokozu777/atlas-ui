"use client";

import { Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function FavoriteStar({
  pressed,
  onToggle,
  label = "Favorite",
}: {
  pressed: boolean;
  onToggle: () => void;
  label?: string;
}) {
  const text = pressed ? `Unfavorite ${label}` : `Favorite ${label}`;
  return (
    <Button
      type="button"
      size="icon-xs"
      variant="ghost"
      className={cn(
        "rounded-md",
        pressed
          ? "text-amber-400 hover:text-amber-300"
          : "text-muted-foreground hover:text-foreground",
      )}
      aria-label={text}
      aria-pressed={pressed}
      title={text}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      <Star className={cn(pressed && "fill-current")} />
    </Button>
  );
}
