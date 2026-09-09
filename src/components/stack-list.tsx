"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function StackList({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-slot="stack-list"
      className={cn("divide-y divide-foreground/10", className)}
    >
      {children}
    </div>
  );
}

const rowClass =
  "h-auto min-h-0 w-full justify-start gap-3 rounded-none px-4 py-3 text-left font-normal";

export function StackListRow({
  title,
  description,
  trailing,
  onClick,
  href,
  className,
  children,
}: {
  title?: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  href?: string;
  className?: string;
  children?: ReactNode;
}) {
  const inner = (
    <>
      <span className="min-w-0 flex-1">
        {title ? (
          <span className="block truncate text-sm font-medium">{title}</span>
        ) : null}
        {description ? (
          <span className="mt-0.5 block text-[13px] text-muted-foreground">
            {description}
          </span>
        ) : null}
        {children}
      </span>
      {trailing ? <span className="shrink-0">{trailing}</span> : null}
    </>
  );

  if (href) {
    return (
      <Button
        type="button"
        variant="ghost"
        className={cn(rowClass, className)}
        render={<Link href={href} />}
      >
        {inner}
      </Button>
    );
  }

  if (onClick) {
    return (
      <Button
        type="button"
        variant="ghost"
        className={cn(rowClass, className)}
        onClick={onClick}
      >
        {inner}
      </Button>
    );
  }

  return (
    <div
      data-slot="stack-list-row"
      className={cn("flex items-center gap-3 px-4 py-3", className)}
    >
      {inner}
    </div>
  );
}
