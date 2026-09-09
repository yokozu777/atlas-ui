"use client";

import { use } from "react";

import { ClusterHostsView } from "@/app/clusters/[clusterId]/hosts/page";

export default function ClusterLimitsPage({
  params,
}: {
  params: Promise<{ clusterId: string }>;
}) {
  const clusterId = decodeURIComponent(use(params).clusterId);
  return <ClusterHostsView key={clusterId} clusterId={clusterId} />;
}
