"use client";

import { Panel, TerminalChrome } from "@/components/panel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const codeBlockBodyClass =
  "overflow-auto bg-black/50 p-4 font-mono text-xs leading-5 whitespace-pre-wrap break-all";

export function CodeBlock({
  value,
  label,
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const body = (
    <pre
      data-slot="code-block"
      className={cn(codeBlockBodyClass, "max-h-[60vh]", !label && className)}
    >
      {value}
    </pre>
  );
  if (!label) {
    return body;
  }
  return (
    <Panel className={className}>
      <TerminalChrome
        label={label}
        actions={
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => navigator.clipboard.writeText(value)}
          >
            Copy
          </Button>
        }
      />
      {body}
    </Panel>
  );
}
