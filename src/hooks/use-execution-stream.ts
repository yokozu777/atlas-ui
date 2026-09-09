"use client";

import { useEffect, useState } from "react";

export function useExecutionStream(projectId: string, executionId: string | null) {
  const [text, setText] = useState("");
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!executionId) {
      return;
    }
    setText("");
    setRunning(true);
    const params = new URLSearchParams({ project_id: projectId });
    const source = new EventSource(
      `/api/hub/executions/${encodeURIComponent(executionId)}/log/stream?${params}`,
    );
    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as {
          type?: string;
          text?: string;
          isComplete?: boolean;
          status?: string;
        };
        if (payload.text) {
          setText((prev) => prev + payload.text);
        }
        if (payload.isComplete) {
          setRunning(false);
          source.close();
        }
      } catch {
        setText((prev) => prev + event.data);
      }
    };
    source.onerror = () => {
      setRunning(false);
      source.close();
    };
    return () => source.close();
  }, [projectId, executionId]);

  return { text, running };
}
