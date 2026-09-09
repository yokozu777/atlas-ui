"use client";

import Link from "next/link";
import { useMemo, type ComponentPropsWithoutRef } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { codeBlockBodyClass } from "@/components/code-block";
import { cn } from "@/lib/utils";

export function MarkdownDoc({
  markdown,
  currentId,
  activeId,
  compact,
  resolveHref,
}: {
  markdown: string;
  currentId: string;
  activeId?: string;
  compact?: boolean;
  resolveHref: (fromId: string, href: string) => { href: string; id: string } | null;
}) {
  const components = useMemo(
    () => markdownComponents(currentId, activeId ?? currentId, compact, resolveHref),
    [currentId, activeId, compact, resolveHref],
  );
  return (
    <div className={compact ? "max-w-none text-sm" : "max-w-3xl"}>
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {markdown}
      </Markdown>
    </div>
  );
}

function markdownComponents(
  currentId: string,
  activeId: string,
  compact: boolean | undefined,
  resolveHref: (fromId: string, href: string) => { href: string; id: string } | null,
) {
  const heading = compact
    ? "mt-4 mb-2 text-sm font-medium first:mt-0"
    : "mt-8 mb-4 font-display text-3xl font-medium tracking-tight first:mt-0";
  const heading2 = compact
    ? "mt-4 mb-2 text-sm font-medium"
    : "mt-8 mb-3 font-display text-2xl font-medium tracking-tight";
  return {
    h1: ({ className, ...props }: ComponentPropsWithoutRef<"h1">) => (
      <h1 className={cn(heading, className)} {...props} />
    ),
    h2: ({ className, ...props }: ComponentPropsWithoutRef<"h2">) => (
      <h2 className={cn(heading2, className)} {...props} />
    ),
    h3: ({ className, ...props }: ComponentPropsWithoutRef<"h3">) => (
      <h3
        className={cn(
          compact ? "mt-3 mb-1 text-sm font-medium" : "mt-6 mb-2 text-lg font-medium",
          className,
        )}
        {...props}
      />
    ),
    p: ({ className, ...props }: ComponentPropsWithoutRef<"p">) => (
      <p
        className={cn(
          compact
            ? "my-2 leading-6 text-muted-foreground"
            : "my-3 leading-7 text-muted-foreground",
          className,
        )}
        {...props}
      />
    ),
    a: ({
      href,
      className,
      children,
      ...props
    }: ComponentPropsWithoutRef<"a">) => {
      const next = resolveHref(currentId, href ?? "");
      const cls = cn("text-foreground underline underline-offset-4", className);
      if (next) {
        return (
          <Link
            href={next.href}
            className={cn(cls, next.id === activeId && "font-medium")}
          >
            {children}
          </Link>
        );
      }
      return (
        <a className={cls} href={href} {...props}>
          {children}
        </a>
      );
    },
    ul: ({ className, ...props }: ComponentPropsWithoutRef<"ul">) => (
      <ul
        className={cn(
          compact
            ? "my-2 list-disc space-y-1 pl-4 text-muted-foreground"
            : "my-3 list-disc space-y-1 pl-6 text-muted-foreground",
          className,
        )}
        {...props}
      />
    ),
    ol: ({ className, ...props }: ComponentPropsWithoutRef<"ol">) => (
      <ol
        className={cn(
          "my-3 list-decimal space-y-1 pl-6 text-muted-foreground",
          className,
        )}
        {...props}
      />
    ),
    li: ({ className, ...props }: ComponentPropsWithoutRef<"li">) => (
      <li className={cn("leading-7", className)} {...props} />
    ),
    pre: ({ className, ...props }: ComponentPropsWithoutRef<"pre">) => (
      <pre
        className={cn("my-4 rounded-lg", codeBlockBodyClass, className)}
        {...props}
      />
    ),
    code: ({ className, ...props }: ComponentPropsWithoutRef<"code">) => {
      const block = Boolean(className);
      return (
        <code
          className={cn(
            block
              ? "font-mono text-xs"
              : "rounded bg-black/50 px-1.5 py-0.5 font-mono text-[0.85em] text-foreground",
            className,
          )}
          {...props}
        />
      );
    },
    table: ({ className, ...props }: ComponentPropsWithoutRef<"table">) => (
      <div className="my-4 overflow-x-auto">
        <table className={cn("w-full border-collapse text-sm", className)} {...props} />
      </div>
    ),
    th: ({ className, ...props }: ComponentPropsWithoutRef<"th">) => (
      <th
        className={cn("border-b border-border px-3 py-2 text-left font-medium", className)}
        {...props}
      />
    ),
    td: ({ className, ...props }: ComponentPropsWithoutRef<"td">) => (
      <td
        className={cn(
          "border-b border-border/60 px-3 py-2 text-muted-foreground",
          className,
        )}
        {...props}
      />
    ),
    blockquote: ({ className, ...props }: ComponentPropsWithoutRef<"blockquote">) => (
      <blockquote
        className={cn("my-4 border-l-2 border-border pl-4 text-muted-foreground", className)}
        {...props}
      />
    ),
    hr: ({ className, ...props }: ComponentPropsWithoutRef<"hr">) => (
      <hr className={cn("my-8 border-border", className)} {...props} />
    ),
  };
}
