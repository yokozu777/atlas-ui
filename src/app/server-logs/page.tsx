"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { CodeBlock } from "@/components/code-block";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import {
  ServerLogsList,
  type ServerLogEntry,
} from "@/components/server-logs-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { stargateJson } from "@/lib/stargate";

type LogEntry = ServerLogEntry;

type LogsResponse = {
  logs?: LogEntry[];
  stats?: { error?: number; warning?: number; info?: number; debug?: number };
  total?: number;
};

function downloadText(filename: string, body: string, mime: string) {
  const blob = new Blob([body], { type: mime });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export default function ServerLogsPage() {
  const [service, setService] = useState("all");
  const [level, setLevel] = useState("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [lines, setLines] = useState("1000");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState<LogsResponse["stats"]>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState(false);
  const [selected, setSelected] = useState<LogEntry | null>(null);
  const [detailTab, setDetailTab] = useState<"raw" | "json">("raw");

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("service", service);
    params.set("level", level);
    params.set("lines", lines || "1000");
    if (search.trim()) params.set("search", search.trim());
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    return params.toString();
  }, [service, level, search, dateFrom, dateTo, lines]);

  const load = useCallback(async () => {
    const data = await stargateJson<LogsResponse>(`/server_logs?${query}`);
    setLogs(data.logs ?? []);
    setStats(data.stats ?? {});
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    void load()
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => {
      void load().catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(id);
  }, [load, paused]);

  function exportLogs(kind: "json" | "csv" | "txt") {
    const stamp = new Date().toISOString().slice(0, 10);
    if (kind === "json") {
      downloadText(
        `server-logs-${stamp}.json`,
        JSON.stringify(logs, null, 2),
        "application/json",
      );
      return;
    }
    if (kind === "csv") {
      const header = "timestamp,service,level,message";
      const rows = logs.map((row) =>
        [row.timestamp ?? "", row.service, row.level, row.message]
          .map((cell) => csvEscape(String(cell)))
          .join(","),
      );
      downloadText(
        `server-logs-${stamp}.csv`,
        [header, ...rows].join("\n"),
        "text/csv",
      );
      return;
    }
    downloadText(
      `server-logs-${stamp}.txt`,
      logs.map((row) => row.raw).join("\n"),
      "text/plain",
    );
  }

  if (error) {
    return <EmptyState title="Server logs unavailable" description={error} />;
  }

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <PageHeader
        kicker="System"
        title="Server logs"
        description="Hub and worker rotating files. Auto-refresh every 5s."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setPaused((value) => !value)}>
              {paused ? "Resume" : "Pause"}
            </Button>
            <Button variant="outline" onClick={() => exportLogs("json")}>
              JSON
            </Button>
            <Button variant="outline" onClick={() => exportLogs("csv")}>
              CSV
            </Button>
            <Button variant="outline" onClick={() => exportLogs("txt")}>
              TXT
            </Button>
          </div>
        }
      />
      <Panel className="grid gap-3 p-4 md:grid-cols-6">
        <div className="space-y-1">
          <Label>Service</Label>
          <Select
            value={service}
            onValueChange={(value) => {
              if (value) setService(value);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">all</SelectItem>
              <SelectItem value="hub">hub</SelectItem>
              <SelectItem value="worker">worker</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Level</Label>
          <Select
            value={level}
            onValueChange={(value) => {
              if (value) setLevel(value);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">all</SelectItem>
              <SelectItem value="error">error</SelectItem>
              <SelectItem value="warning">warning</SelectItem>
              <SelectItem value="info">info</SelectItem>
              <SelectItem value="debug">debug</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 md:col-span-2">
          <Label>Search</Label>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>From</Label>
          <Input
            type="datetime-local"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>To</Label>
          <Input
            type="datetime-local"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>Lines</Label>
          <Input value={lines} onChange={(e) => setLines(e.target.value)} />
        </div>
        <div className="flex items-end gap-2 md:col-span-5">
          <Badge variant="outline">error {stats?.error ?? 0}</Badge>
          <Badge variant="outline">warning {stats?.warning ?? 0}</Badge>
          <Badge variant="outline">info {stats?.info ?? 0}</Badge>
          <Badge variant="outline">debug {stats?.debug ?? 0}</Badge>
          <span className="text-xs text-muted-foreground">
            {busy ? "loading…" : `${logs.length} lines`}
          </span>
        </div>
      </Panel>
      <div className="grid min-h-0 gap-4 lg:grid-cols-3">
        <ServerLogsList
          logs={logs}
          selected={selected}
          follow={!paused}
          busy={busy}
          onSelect={setSelected}
        />
        <Panel className="p-4">
          <div className="mb-3 flex gap-2">
            <Button
              size="sm"
              variant={detailTab === "raw" ? "default" : "outline"}
              onClick={() => setDetailTab("raw")}
            >
              Raw
            </Button>
            <Button
              size="sm"
              variant={detailTab === "json" ? "default" : "outline"}
              onClick={() => setDetailTab("json")}
            >
              JSON
            </Button>
          </div>
          {selected ? (
            <CodeBlock
              label={detailTab}
              value={
                detailTab === "json"
                  ? JSON.stringify(selected, null, 2)
                  : selected.raw
              }
            />
          ) : (
            <p className="text-sm text-muted-foreground">Select a line.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
