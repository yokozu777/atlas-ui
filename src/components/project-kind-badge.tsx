import { Badge } from "@/components/ui/badge";
import type { ProjectKind } from "@/lib/project-types";
import { cn } from "@/lib/utils";

export function projectKindLabel(kind?: ProjectKind | string): string {
  if (kind === "atlas") return "Atlas";
  if (kind === "ansible") return "Ansible";
  return kind || "Unknown";
}

export function projectKindBadgeVariant(
  kind?: ProjectKind | string,
): "info" | "warning" | "outline" {
  if (kind === "atlas") return "info";
  if (kind === "ansible") return "warning";
  return "outline";
}

export function projectKindButtonClass(
  kind: ProjectKind,
  selected: boolean,
): string {
  if (kind === "ansible") {
    return selected
      ? "border-transparent bg-warning/30 text-warning ring-1 ring-warning/40 hover:bg-warning/40 hover:text-warning"
      : "border-transparent bg-transparent text-warning/35 ring-1 ring-warning/15 hover:bg-warning/10 hover:text-warning/70";
  }
  return selected
    ? "border-transparent bg-info/30 text-info ring-1 ring-info/40 hover:bg-info/40 hover:text-info"
    : "border-transparent bg-transparent text-info/35 ring-1 ring-info/15 hover:bg-info/10 hover:text-info/70";
}

export function ProjectKindBadge({
  kind,
  className,
}: {
  kind?: ProjectKind | string;
  className?: string;
}) {
  return (
    <Badge
      variant={projectKindBadgeVariant(kind)}
      className={cn("shrink-0", className)}
    >
      {projectKindLabel(kind)}
    </Badge>
  );
}
