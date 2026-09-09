"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ChartPeriod } from "@/lib/project-dashboard";

export function ChartPeriodToggle({
  value,
  onChange,
}: {
  value: ChartPeriod;
  onChange: (value: ChartPeriod) => void;
}) {
  return (
    <Tabs
      value={value}
      onValueChange={(next) => {
        if (next === "24h" || next === "7d") {
          onChange(next);
        }
      }}
    >
      <TabsList className="h-7">
        <TabsTrigger value="24h" className="px-2 text-xs">
          24h
        </TabsTrigger>
        <TabsTrigger value="7d" className="px-2 text-xs">
          7d
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
