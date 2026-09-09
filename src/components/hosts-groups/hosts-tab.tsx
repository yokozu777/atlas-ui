"use client";

import { Check, Info, KeyRound, Layers, Plus, Search } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { LogViewer } from "@/components/log-viewer";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  groupBadgeVariant,
  hostStatusKind,
  parseYamlScalars,
} from "@/components/hosts-groups/helpers";

export type HostTableRow = {
  name: string;
  groups: string[];
  inventoryFile: string;
  varsFile: string;
  status: string;
  connectionSecret?: string;
  ansibleUser?: string;
  ansiblePort?: string;
};

export function buildHostRows(
  names: string[],
  hostGroups: Record<string, string[]>,
  inventoryFile: string,
  hostVars: Record<string, string>,
  statuses: Record<string, { status?: string }>,
): HostTableRow[] {
  return names.map((name) => {
    const parsed = parseYamlScalars(hostVars[name] || "");
    return {
      name,
      groups: hostGroups[name] ?? [],
      inventoryFile,
      varsFile: parsed.vars_file || `host_vars/${name}.yml`,
      status: statuses[name]?.status || "unknown",
      connectionSecret: parsed.connectionSecret,
      ansibleUser: parsed.ansible_user,
      ansiblePort: parsed.ansible_port,
    };
  });
}

export function HostsTab({
  rows,
  selected,
  onSelectedChange,
  search,
  onSearchChange,
  onAddHost,
  onCheckAll,
  onCheck,
  onFacts,
  onAssign,
  onConnection,
  busy,
  running,
  checkingHost,
  executionId,
  logText,
  logRunning,
  logHost,
}: {
  rows: HostTableRow[];
  selected: string[];
  onSelectedChange: (next: string[]) => void;
  search: string;
  onSearchChange: (value: string) => void;
  onAddHost: () => void;
  onCheckAll: () => void;
  onCheck: (host: string) => void;
  onFacts: (host: string) => void;
  onAssign: (host: string) => void;
  onConnection: (host: HostTableRow) => void;
  busy: boolean;
  running: boolean;
  checkingHost: string | null;
  executionId: string | null;
  logText: string;
  logRunning: boolean;
  logHost: string | null;
}) {
  const filtered = rows.filter((row) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      row.name.toLowerCase().includes(q) ||
      row.groups.some((group) => group.toLowerCase().includes(q))
    );
  });
  const allChecked =
    filtered.length > 0 && filtered.every((row) => selected.includes(row.name));

  function toggleAll(checked: boolean) {
    if (checked) {
      onSelectedChange([...new Set([...selected, ...filtered.map((row) => row.name)])]);
      return;
    }
    const drop = new Set(filtered.map((row) => row.name));
    onSelectedChange(selected.filter((name) => !drop.has(name)));
  }

  function toggleOne(name: string, checked: boolean) {
    onSelectedChange(
      checked ? [...selected, name] : selected.filter((item) => item !== name),
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Hosts</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={onAddHost}>
            <Plus />
            Add Host
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || running}
            onClick={onCheckAll}
          >
            <Check />
            Check all
          </Button>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-8 w-52 pl-8"
              placeholder="Search hosts..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
        </div>
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          title="No hosts"
          description="Add a host or pull Git inventory."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allChecked}
                  onCheckedChange={(value) => toggleAll(value === true)}
                />
              </TableHead>
              <TableHead>Host / IP</TableHead>
              <TableHead>Groups</TableHead>
              <TableHead>Connection</TableHead>
              <TableHead>Inventory File</TableHead>
              <TableHead>Vars File</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((row) => {
              const kind = hostStatusKind(row.status);
              const conn = row.connectionSecret
                ? `${row.connectionSecret}${
                    row.ansibleUser
                      ? ` (${row.ansibleUser}@${row.ansiblePort || "22"})`
                      : ""
                  }`
                : "—";
              const checking = checkingHost === row.name || (logHost === row.name && logRunning);
              return (
                <TableRow key={row.name}>
                  <TableCell>
                    <Checkbox
                      checked={selected.includes(row.name)}
                      onCheckedChange={(value) => toggleOne(row.name, value === true)}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-sm">{row.name}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {row.groups.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        row.groups.map((group) => (
                          <Badge key={group} variant={groupBadgeVariant(group)}>
                            {group}
                          </Badge>
                        ))
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">
                        {conn}
                      </span>
                      <Button
                        size="xs"
                        variant="link"
                        className="h-auto px-0 text-info"
                        onClick={() => onConnection(row)}
                      >
                        Override
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {row.inventoryFile || "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {row.varsFile}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={kind}>
                      {(row.status || "unknown").toUpperCase()}
                    </StatusBadge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Button
                        size="xs"
                        variant="ghost"
                        disabled={busy || running}
                        onClick={() => onCheck(row.name)}
                      >
                        <Check />
                        {checking ? "Checking…" : "Check"}
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        disabled={busy || running}
                        onClick={() => onFacts(row.name)}
                      >
                        <Info />
                        Get facts
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => onAssign(row.name)}
                      >
                        <Layers />
                        Assign Group
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => onConnection(row)}
                      >
                        <KeyRound />
                        Connection
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      {executionId ? (
        <div className="mt-6">
          <LogViewer
            jobId={null}
            text={logText}
            running={logRunning}
            compact
            label={`${logHost || "host"} ${executionId}`}
          />
        </div>
      ) : null}
    </div>
  );
}
