"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BaseEdge,
  EdgeLabelRenderer,
  getNodesBounds,
  MiniMap,
  ReactFlow,
  Handle,
  Panel,
  Position,
  useEdgesState,
  useNodes,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type EdgeTypes,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { FileDown, Loader2, LocateFixed, Scan, ZoomIn, ZoomOut } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  layoutPackMapCopy,
  PACK_MAP_NODE_W,
  packMapActiveEntryId,
  packMapHref,
  packMapStatusLabel,
  type PackMapEdge,
  type PackMapGraph,
  type PackMapNode,
  type PackMapNodeKind,
  type PackMapStatus,
} from "@/lib/atlas-pack-map";
import { packMapEdgeRoute } from "@/lib/pack-map-edges";
import {
  packMapRoleMarks,
  type PackMapRoleMark,
  type PackMapRoleProgress,
} from "@/lib/atlas-run-progress";

export type PackMapLiveState = "running" | "fail" | "done";

type FlowData = PackMapNode & {
  href: string | null;
  live: PackMapLiveState | null;
  roleMarks: PackMapRoleMark[] | null;
  onPhaseClick?: (alias: string) => void;
};
type FlowNode = Node<FlowData, "packMap">;

function phaseKey(value: string): string {
  const trimmed = value.trim().replace(/\\/g, "/");
  const base = trimmed.split("/").filter(Boolean).pop() || trimmed;
  return base.toLowerCase();
}

export function packMapLiveIds(
  graph: PackMapGraph,
  alias: string | null,
): string[] {
  if (!alias) return [];
  const key = phaseKey(alias);
  const phase = graph.nodes.find(
    (node) =>
      node.kind === "phase" &&
      (phaseKey(node.title) === key || phaseKey(node.id.split(":").pop() || "") === key),
  );
  if (!phase) return [];
  const ids = [phase.id];
  for (const edge of graph.edges) {
    if (edge.kind === "calls" && edge.target === phase.id) {
      ids.push(edge.source);
    }
  }
  return ids;
}

const KIND_LABEL: Record<PackMapNodeKind, string> = {
  cluster: "Cluster",
  workspace: "Runtime",
  lock: "Lock",
  executor: "Executor",
  ssh: "SSH",
  pack: "Pack",
  overlay: "Overlay",
  cfg: "Ansible",
  entry: "Entry",
  phase: "Phase",
  group: "Group",
};

function statusVariant(
  status: PackMapStatus,
): "success" | "destructive" | "warning" | "info" | "outline" {
  if (status === "ready") return "success";
  if (status === "missing" || status === "error" || status === "broken") {
    return "destructive";
  }
  if (status === "drift") return "warning";
  if (status === "unused") return "info";
  return "outline";
}

function statusRing(status: PackMapStatus): string {
  if (status === "ready") return "border-success/45";
  if (status === "missing" || status === "error" || status === "broken") {
    return "border-destructive/55";
  }
  if (status === "drift") return "border-warning/50";
  if (status === "unused") return "border-info/45";
  return "border-border";
}

function edgeStroke(kind: PackMapEdge["kind"]): string {
  if (kind === "calls") return "oklch(0.76 0.14 290)";
  if (kind === "next") return "oklch(0.93 0 0 / 70%)";
  if (kind === "mounts") return "oklch(0.78 0.16 155 / 70%)";
  if (kind === "auth") return "oklch(0.82 0.16 75)";
  if (kind === "limit") return "oklch(0.72 0.14 250)";
  if (kind === "cfg") return "oklch(0.78 0.12 195)";
  return "oklch(1 0 0 / 28%)";
}

function ChipRow({
  items,
  tone,
}: {
  items?: string[];
  tone: "tag" | "auth" | "group";
}) {
  if (!items?.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {items.map((item) => (
        <span
          key={`${tone}:${item}`}
          className={cn(
            "rounded-md px-1.5 py-px font-mono text-[10px]",
            tone === "auth" && "bg-warning/15 text-warning",
            tone === "group" && "bg-info/15 text-info",
            tone === "tag" && "bg-muted text-muted-foreground",
          )}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function PackMapFlowNode({ data }: NodeProps<FlowNode>) {
  return (
    <div
      className={cn(
        "relative w-[248px] rounded-xl border bg-card px-3 py-2.5 shadow-sm",
        data.live === "running" && "ring-2 ring-info shadow-[0_0_18px] shadow-info/40",
        data.live === "fail" && "ring-2 ring-destructive shadow-[0_0_18px] shadow-destructive/40",
        data.live === "done" && "ring-2 ring-success shadow-[0_0_18px] shadow-success/30",
        !data.live && statusRing(data.status),
        data.onPhaseClick && data.kind === "phase"
          ? "cursor-pointer"
          : data.href
            ? "cursor-pointer"
            : "cursor-default",
      )}
    >
      {data.onPhaseClick && data.kind === "phase" ? (
        <button
          type="button"
          className="nopan nodrag absolute inset-0 z-10 cursor-pointer rounded-xl"
          aria-label={`Open log for ${data.title}`}
          onClick={() => data.onPhaseClick?.(data.title)}
        />
      ) : data.href ? (
        <a
          href={data.href}
          className="nopan nodrag absolute inset-0 z-10 rounded-xl"
          aria-label={`${data.title} — ${packMapStatusLabel(data.status)}`}
        />
      ) : null}
      <Handle
        type="target"
        id="target-left"
        position={Position.Left}
        className="!size-2 !border-border !bg-muted-foreground"
      />
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
          {KIND_LABEL[data.kind]}
        </p>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          {data.live ? (
            <Badge
              variant={
                data.live === "fail"
                  ? "destructive"
                  : data.live === "done"
                    ? "success"
                    : "info"
              }
            >
              {data.live === "fail" ? "Failed" : data.live === "done" ? "Done" : "Running"}
            </Badge>
          ) : null}
          <Badge variant={statusVariant(data.status)}>
            {packMapStatusLabel(data.status)}
          </Badge>
        </div>
      </div>
      <p className="mt-1 truncate text-sm font-medium" title={data.title}>
        {data.title}
      </p>
      {data.subtitle ? (
        <p
          className="truncate font-mono text-[11px] text-muted-foreground"
          title={data.subtitle}
        >
          {data.subtitle}
        </p>
      ) : null}
      {data.detail && data.detail !== data.subtitle ? (
        <p className="truncate font-mono text-[10px] text-muted-foreground/80">
          {data.detail}
        </p>
      ) : null}
      <ChipRow items={data.auth} tone="auth" />
      <ChipRow items={data.groups} tone="group" />
      <RoleChips
        tags={data.tags ?? []}
        tagsMore={data.tagsMore}
        marks={data.roleMarks}
      />
      <Handle
        type="source"
        id="source-right"
        position={Position.Right}
        className="!size-2 !border-border !bg-muted-foreground"
      />
      <Handle
        type="target"
        id="target-right"
        position={Position.Right}
        className="!size-2 !border-border !bg-muted-foreground"
      />
    </div>
  );
}

function roleChipClass(mark: PackMapRoleMark | undefined): string {
  if (mark === "done") {
    return "bg-success/20 text-success ring-1 ring-success/50";
  }
  if (mark === "running") {
    return "bg-info/25 text-info ring-2 ring-info shadow-[0_0_10px] shadow-info/50";
  }
  if (mark === "fail") {
    return "bg-destructive/25 text-destructive ring-2 ring-destructive";
  }
  return "bg-muted text-muted-foreground";
}

function RoleChips({
  tags,
  tagsMore,
  marks,
}: {
  tags: string[];
  tagsMore?: number;
  marks: PackMapRoleMark[] | null;
}) {
  if (!tags.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {tags.map((tag, index) => (
        <span
          key={tag}
          className={cn(
            "rounded-md px-1.5 py-px font-mono text-[10px]",
            roleChipClass(marks?.[index]),
          )}
        >
          {tag}
        </span>
      ))}
      {tagsMore ? (
        <span
          className={cn(
            "text-[10px]",
            marks?.length && marks.every((mark) => mark === "done")
              ? "text-success"
              : "text-muted-foreground",
          )}
        >
          +{tagsMore}
        </span>
      ) : null}
    </div>
  );
}

function PackMapAvoidEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style,
  label,
  labelStyle,
  labelBgStyle,
}: EdgeProps) {
  const nodes = useNodes();
  const obstacles = useMemo(
    () =>
      nodes
        .filter((node) => node.id !== source && node.id !== target)
        .map((node) => ({
          id: node.id,
          x: node.position.x,
          y: node.position.y,
          w: node.measured?.width ?? node.width ?? PACK_MAP_NODE_W,
          h: node.measured?.height ?? 96,
        })),
    [nodes, source, target],
  );
  const route = packMapEdgeRoute({
    sourceX,
    sourceY,
    targetX,
    targetY,
    obstacles,
  });
  return (
    <>
      <BaseEdge id={id} path={route.path} style={style} />
      {label ? (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-none absolute rounded-sm px-1 py-px font-mono text-[10px] text-muted-foreground"
            style={{
              transform: `translate(-50%, -50%) translate(${route.labelX}px, ${route.labelY}px)`,
              color: typeof labelStyle?.fill === "string" ? labelStyle.fill : undefined,
              background:
                typeof labelBgStyle?.fill === "string" ? labelBgStyle.fill : undefined,
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

const nodeTypes: NodeTypes = { packMap: PackMapFlowNode };
const edgeTypes: EdgeTypes = { packMap: PackMapAvoidEdge };

function toFlow(
  graph: PackMapGraph,
  projectId: string,
  live: { ids: string[]; state: PackMapLiveState | null },
  roles: PackMapRoleProgress | null,
  rolesByPhase: Record<string, PackMapRoleProgress> | null,
  onPhaseClick?: (alias: string) => void,
): { nodes: FlowNode[]; edges: Edge[] } {
  const columnOf = Object.fromEntries(
    graph.nodes.map((node) => [node.id, node.column] as const),
  );
  const liveIds = new Set(live.ids);
  const phaseTitle = new Map(
    graph.nodes
      .filter((node) => node.kind === "phase")
      .map((node) => [node.id, node.title] as const),
  );
  return {
    nodes: graph.nodes.map((node) => {
      const highlighted = liveIds.has(node.id);
      const calls = graph.edges.filter(
        (edge) => edge.kind === "calls" && edge.source === node.id,
      );
      const preferred =
        calls.find((edge) => liveIds.has(edge.target)) ?? calls[0];
      const alias = preferred ? phaseTitle.get(preferred.target) : undefined;
      const phaseRoles =
        alias && rolesByPhase
          ? (rolesByPhase[alias] ??
            rolesByPhase[
              Object.keys(rolesByPhase).find(
                (key) => key.toLowerCase() === alias.toLowerCase(),
              ) ?? ""
            ])
          : null;
      const progress =
        node.kind === "entry" ? (phaseRoles ?? (highlighted ? roles : null)) : null;
      const expand = Boolean(highlighted && progress);
      return {
        id: node.id,
        type: "packMap",
        position: { x: node.x, y: node.y },
        width: 248,
        zIndex: highlighted ? 3 : 2,
        data: {
          ...node,
          href: onPhaseClick && node.kind === "phase" ? null : packMapHref(projectId, node.hrefKind),
          onPhaseClick,
          live: highlighted ? live.state : null,
          roleMarks: progress
            ? packMapRoleMarks(
                expand ? (node.tagsAll ?? node.tags ?? []) : (node.tags ?? []),
                progress,
              )
            : null,
          tagsMore: expand ? 0 : node.tagsMore,
          tags: expand ? (node.tagsAll ?? node.tags) : node.tags,
        },
        draggable: false,
        selectable: Boolean(node.hrefKind),
      };
    }),
    edges: graph.edges.map((row) => {
      const loop = columnOf[row.source] === columnOf[row.target];
      return {
        id: row.id,
        source: row.source,
        target: row.target,
        sourceHandle: "source-right",
        targetHandle: loop ? "target-right" : "target-left",
        type: "packMap",
        zIndex: 0,
        animated: row.kind === "calls" || row.kind === "next" || row.kind === "auth",
        label: row.label,
        labelStyle: {
          fill: "oklch(0.86 0 0)",
          fontSize: 10,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        },
        labelBgStyle: { fill: "oklch(0.2 0 0 / 82%)" },
        style: {
          stroke: edgeStroke(row.kind),
          strokeWidth: row.kind === "next" ? 2 : 1.4,
          strokeDasharray: row.kind === "auth" || row.kind === "limit" ? "5 4" : undefined,
        },
      };
    }),
  };
}

function MapControlButton({
  label,
  className,
  disabled,
  onClick,
  children,
}: {
  label: string;
  className: string;
  disabled?: boolean;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            className={className}
            disabled={disabled}
            onClick={onClick}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="left">{label}</TooltipContent>
    </Tooltip>
  );
}

function PackMapControls({
  downloadName,
  focusEntryId,
}: {
  downloadName: string;
  focusEntryId: string | null;
}) {
  const { zoomIn, zoomOut, fitView, getNodes } = useReactFlow();
  const [saving, setSaving] = useState(false);
  const iconButton =
    "flex size-8 items-center justify-center text-foreground hover:bg-muted disabled:opacity-50";
  const focusLabel = focusEntryId
    ? "Center on active entry"
    : "No active entry";

  async function downloadPdf(target: HTMLButtonElement) {
    const root = target.closest(".react-flow");
    const viewport = root?.querySelector(".react-flow__viewport");
    const nodes = getNodes();
    if (!(viewport instanceof HTMLElement) || nodes.length === 0) {
      toast.error("PDF download failed");
      return;
    }
    setSaving(true);
    try {
      const { downloadPackMapPdf } = await import("@/lib/pack-map-pdf");
      await downloadPackMapPdf({
        viewport,
        bounds: getNodesBounds(nodes),
        fileName: downloadName,
      });
    } catch {
      toast.error("PDF download failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel position="top-right" className="!m-2">
      <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <MapControlButton
          label="Zoom in"
          className={iconButton}
          onClick={() => void zoomIn({ duration: 200 })}
        >
          <ZoomIn className="size-4" />
        </MapControlButton>
        <MapControlButton
          label="Zoom out"
          className={`${iconButton} border-t border-border`}
          onClick={() => void zoomOut({ duration: 200 })}
        >
          <ZoomOut className="size-4" />
        </MapControlButton>
        <MapControlButton
          label="Fit view"
          className={`${iconButton} border-t border-border`}
          onClick={() => void fitView({ padding: 0.18, duration: 200 })}
        >
          <Scan className="size-4" />
        </MapControlButton>
        <MapControlButton
          label={focusLabel}
          className={`${iconButton} border-t border-border`}
          disabled={!focusEntryId}
          onClick={() => {
            if (!focusEntryId) return;
            void fitView({
              nodes: [{ id: focusEntryId }],
              padding: 0.35,
              duration: 380,
              maxZoom: 1.5,
            });
          }}
        >
          <LocateFixed className="size-4" />
        </MapControlButton>
        <MapControlButton
          label="Download PDF"
          className="flex h-8 items-center justify-center gap-1 border-t border-border px-2 text-[11px] font-medium text-foreground hover:bg-muted disabled:opacity-50"
          disabled={saving}
          onClick={(event) => void downloadPdf(event.currentTarget)}
        >
          {saving ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <FileDown className="size-3.5" />
          )}
          PDF
        </MapControlButton>
      </div>
    </Panel>
  );
}

function PackMapMeasuredLayout({
  graph,
  nodes,
  setNodes,
}: {
  graph: PackMapGraph;
  nodes: FlowNode[];
  setNodes: (payload: FlowNode[] | ((current: FlowNode[]) => FlowNode[])) => void;
}) {
  const initialized = useNodesInitialized();

  useEffect(() => {
    if (!initialized) return;
    const heights: Record<string, number> = {};
    for (const node of nodes) {
      const height = node.measured?.height;
      if (height) heights[node.id] = height;
    }
    if (Object.keys(heights).length !== graph.nodes.length) return;
    const laid = layoutPackMapCopy(graph.nodes, heights);
    const byId = Object.fromEntries(laid.map((node) => [node.id, node]));
    const needsMove = nodes.some((node) => {
      const next = byId[node.id];
      if (!next) return false;
      return (
        Math.abs(node.position.y - next.y) > 0.5 ||
        Math.abs(node.position.x - next.x) > 0.5
      );
    });
    if (!needsMove) return;
    setNodes((current) =>
      current.map((node) => {
        const next = byId[node.id];
        if (!next) return node;
        return { ...node, position: { x: next.x, y: next.y } };
      }),
    );
  }, [graph, initialized, nodes, setNodes]);

  return null;
}

function PackMapFocus({ ids }: { ids: string[] }) {
  const { fitView } = useReactFlow();
  const initialized = useNodesInitialized();
  const signature = ids.join("|");
  const idsRef = useRef(ids);
  const fitted = useRef<string | null>(null);
  idsRef.current = ids;

  useEffect(() => {
    if (!initialized) return;
    if (fitted.current === signature) return;
    const target = idsRef.current;
    const handle = window.setTimeout(() => {
      fitted.current = signature;
      void fitView({
        nodes: target.length ? target.map((id) => ({ id })) : undefined,
        padding: target.length ? 0.45 : 0.18,
        duration: 320,
        maxZoom: target.length ? 1.05 : 1.2,
      });
    }, 80);
    return () => window.clearTimeout(handle);
  }, [fitView, initialized, signature]);

  return null;
}

export function AtlasPackMapCanvas({
  graph,
  projectId,
  activeAlias = null,
  activeState = null,
  activeRoles = null,
  rolesByPhase = null,
  downloadName = "pack-map",
  onPhaseClick,
}: {
  graph: PackMapGraph;
  projectId: string;
  activeAlias?: string | null;
  activeState?: PackMapLiveState | null;
  activeRoles?: PackMapRoleProgress | null;
  rolesByPhase?: Record<string, PackMapRoleProgress> | null;
  downloadName?: string;
  onPhaseClick?: (alias: string) => void;
}) {
  const liveIds = useMemo(
    () => packMapLiveIds(graph, activeState ? activeAlias : null),
    [activeAlias, activeState, graph],
  );
  const flow = useMemo(
    () =>
      toFlow(
        graph,
        projectId,
        { ids: liveIds, state: activeState },
        activeRoles,
        rolesByPhase,
        onPhaseClick,
      ),
    [activeRoles, activeState, graph, liveIds, onPhaseClick, projectId, rolesByPhase],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(flow.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flow.edges);

  useEffect(() => {
    setNodes((current) => {
      const sameIds =
        current.length === flow.nodes.length &&
        current.every((node, index) => node.id === flow.nodes[index]?.id);
      if (!sameIds) return flow.nodes;
      return current.map((node, index) => {
        const incoming = flow.nodes[index];
        return {
          ...node,
          data: incoming.data,
          zIndex: incoming.zIndex,
        };
      });
    });
    setEdges(flow.edges);
  }, [flow, setEdges, setNodes]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      edgesFocusable={false}
      minZoom={0.2}
      maxZoom={1.6}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      zoomOnScroll
      panOnScroll={false}
      colorMode="dark"
      className="atlas-pack-map bg-transparent"
    >
      <PackMapMeasuredLayout graph={graph} nodes={nodes} setNodes={setNodes} />
      <PackMapFocus ids={liveIds} />
      <Background gap={22} size={1} color="oklch(1 0 0 / 8%)" />
      <PackMapControls
        downloadName={downloadName}
        focusEntryId={packMapActiveEntryId(graph.nodes, liveIds)}
      />
      <MiniMap
        pannable
        zoomable
        maskColor="oklch(0 0 0 / 55%)"
        nodeColor={() => "oklch(1 0 0 / 22%)"}
      />
    </ReactFlow>
  );
}
