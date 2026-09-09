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
}: {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  className?: string;
}) {
  const extensions = useMemo(() => ansibleYamlExtensions(), []);

  return (
    <div
      className={cn("min-h-[28rem] flex-1 overflow-hidden", className)}
      style={{ backgroundColor: SETI.bg }}
    >
      <CodeMirror
        value={value}
        minHeight="28rem"
        height="100%"
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
