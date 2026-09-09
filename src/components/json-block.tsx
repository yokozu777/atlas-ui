"use client";

import { forwardRef, useMemo } from "react";
import { Virtuoso } from "react-virtuoso";

import { maskSecrets } from "@/lib/mask-secrets";

import { Panel, TerminalChrome } from "@/components/panel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const JsonScroller = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(function JsonScroller({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      data-slot="json-block-scroller"
      className={cn("h-full", className)}
      {...props}
    />
  );
});

export function JsonBlock({
  value,
  mask = true,
  framed = true,
  label = "json",
}: {
  value: unknown;
  mask?: boolean;
  framed?: boolean;
  label?: string;
}) {
  const shown = mask ? maskSecrets(value) : value;
  const text =
    typeof shown === "string" ? shown : JSON.stringify(shown, null, 2);
  const lines = useMemo(() => text.split("\n"), [text]);
  const body = (
    <div
      data-slot="json-block"
      className={cn(
        "bg-black/50",
        framed ? "min-h-[240px] h-[40vh]" : "h-[240px]",
      )}
    >
      <Virtuoso
        data={lines}
        className="h-full"
        defaultItemHeight={20}
        increaseViewportBy={200}
        components={{
          Scroller: JsonScroller,
          Header: () => <div className="h-3" />,
          Footer: () => <div className="h-3" />,
        }}
        itemContent={(_index, line) => (
          <div className="px-4 font-mono text-xs leading-5 whitespace-pre-wrap break-all">
            {line || "\u00a0"}
          </div>
        )}
      />
    </div>
  );
  if (!framed) {
    return body;
  }
  return (
    <Panel>
      <TerminalChrome
        label={label}
        actions={
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => navigator.clipboard.writeText(text)}
          >
            Copy
          </Button>
        }
      />
      {body}
    </Panel>
  );
}
