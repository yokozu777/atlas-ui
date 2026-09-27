"use client";

import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";

import {
  ansibleYamlExtensions,
  SETI,
  setiEditorTheme,
} from "@/lib/codemirror-seti-ansible";
import { cn } from "@/lib/utils";

export function YamlEditor({
  value,
  onChange,
  readOnly,
  className,
  bounded = true,
}: {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  className?: string;
  bounded?: boolean;
}) {
  const extensions = useMemo(() => ansibleYamlExtensions(), []);

  return (
    <div
      data-slot="yaml-editor"
      className={cn(
        bounded
          ? "flex min-h-[28rem] min-w-0 flex-1 flex-col overflow-hidden"
          : "min-h-[12rem] overflow-y-auto",
        className,
      )}
      style={{ backgroundColor: SETI.bg }}
    >
      <CodeMirror
        value={value}
        className="h-full min-h-0 flex-1"
        minHeight={bounded ? "100%" : "12rem"}
        maxHeight={bounded ? "100%" : undefined}
        height={bounded ? "100%" : undefined}
        theme={setiEditorTheme}
        editable={!readOnly}
        readOnly={readOnly}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          autocompletion: false,
          searchKeymap: true,
          highlightActiveLineGutter: true,
          highlightActiveLine: true,
          syntaxHighlighting: false,
        }}
        extensions={extensions}
        onChange={onChange}
      />
    </div>
  );
}
