"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function DashboardMetric({
  href,
  icon,
  label,
  value,
  hint,
  hintTone = "muted",
}: {
  href: string;
  icon: ReactNode;
  label: string;
  value: string;
  hint: string;
  hintTone?: "muted" | "destructive" | "warning" | "success";
}) {
  return (
    <Link
      href={href}
      className="block rounded-xl outline-none ring-offset-2 ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Card size="sm" className="transition-colors hover:bg-white/5">
        <CardHeader className="gap-2">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[13px] text-muted-foreground">{label}</p>
            <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-4">
              {icon}
            </span>
          </div>
          <p className="text-2xl font-medium tracking-tight tabular-nums">
            {value}
          </p>
          <p
            className={cn(
              "text-[13px]",
              hintTone === "destructive" && "text-destructive",
              hintTone === "warning" && "text-warning",
              hintTone === "success" && "text-success",
              hintTone === "muted" && "text-muted-foreground",
            )}
          >
            {hint}
          </p>
        </CardHeader>
      </Card>
    </Link>
  );
}
