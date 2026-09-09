"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAtlasClusterSelection } from "@/components/atlas-cluster-selection";
import type { ClusterRow } from "@/lib/api";

export function ClusterHeaderSwitcher() {
  const { clusterId, clusters, setClusterId } = useAtlasClusterSelection();

  if (!clusterId && clusters.length === 0) {
    return null;
  }

  const options: ClusterRow[] =
    clusterId && !clusters.some((row) => row.id === clusterId)
      ? [
          {
            id: clusterId,
            display_name: null,
            active: false,
            kind: "broken",
          },
          ...clusters,
        ]
      : clusters;

  if (options.length === 0) {
    return null;
  }

  return (
    <Select
      value={clusterId ?? undefined}
      onValueChange={(value) => {
        if (value) {
          setClusterId(value);
        }
      }}
    >
      <SelectTrigger
        size="sm"
        className="max-w-56 font-mono"
        aria-label="Cluster"
      >
        <SelectValue placeholder="Cluster" />
      </SelectTrigger>
      <SelectContent align="end">
        {options.map((row) => (
          <SelectItem key={row.id} value={row.id} className="font-mono">
            {row.id}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
