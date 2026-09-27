"use client";

import { useMemo } from "react";
import {
  Background,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Boxes,
  Clock,
  Container,
  Copy,
  Database,
  Globe,
  HardDrive,
  Network,
  Play,
  Server,
  Share2,
  Shield,
  Users,
  Workflow,
} from "lucide-react";

import type { FlowNode, FlowStage } from "@/lib/template-profiles";

type CardData = { label: string; hint?: string };
type LaneData = { title: string; tone: Tone };
type CardFlowNode = Node<CardData, "card">;
type LaneFlowNode = Node<LaneData, "lane">;

type Tone = {
  background: string;
  border: string;
  title: string;
  icon: string;
};

const TONES: Tone[] = [
  {
    background: "oklch(0.28 0.045 25 / 0.92)",
    border: "oklch(0.58 0.12 25 / 0.55)",
    title: "oklch(0.86 0.06 25)",
    icon: "oklch(0.78 0.12 25)",
  },
  {
    background: "oklch(0.27 0.04 145 / 0.92)",
    border: "oklch(0.62 0.12 145 / 0.5)",
    title: "oklch(0.86 0.06 145)",
    icon: "oklch(0.78 0.12 145)",
  },
  {
    background: "oklch(0.28 0.04 95 / 0.92)",
    border: "oklch(0.62 0.1 95 / 0.5)",
    title: "oklch(0.88 0.06 95)",
    icon: "oklch(0.8 0.1 95)",
  },
  {
    background: "oklch(0.27 0.04 280 / 0.92)",
    border: "oklch(0.6 0.1 280 / 0.5)",
    title: "oklch(0.86 0.05 280)",
    icon: "oklch(0.78 0.1 280)",
  },
  {
    background: "oklch(0.27 0.035 250 / 0.92)",
    border: "oklch(0.62 0.08 250 / 0.5)",
    title: "oklch(0.86 0.04 250)",
    icon: "oklch(0.78 0.08 250)",
  },
];

const NODE_W = 156;
const NODE_H = 46;
const GAP = 10;
const PAD_X = 14;
const PAD_TOP = 34;
const PAD_BOTTOM = 14;
const LANE_GAP = 64;

export function TemplateNodeIcon({
  label,
  hint,
  className = "size-3.5",
}: {
  label: string;
  hint?: string;
  className?: string;
}) {
  const text = `${label} ${hint ?? ""}`.toLowerCase();
  if (text.includes("client")) return <Users className={className} />;
  if (text.includes("balancer") || text.includes("haproxy") || text.includes("vip") || text.includes("keepalived")) {
    return <Network className={className} />;
  }
  if (text.includes("proxy") || text.includes("predixy")) return <Share2 className={className} />;
  if (text.includes("worker")) return <Boxes className={className} />;
  if (text.includes("replica")) return <Copy className={className} />;
  if (text.includes("agent")) return <Workflow className={className} />;
  if (text.includes("runner")) return <Play className={className} />;
  if (text.includes("controller")) return <Workflow className={className} />;
  if (text.includes("broker") || text.includes("etcd") || text.includes("postgres") || text.includes("patroni") || text.includes("redis") || text.includes("kafka")) {
    return <Database className={className} />;
  }
  if (text.includes("master")) return <Server className={className} />;
  if (text.includes("proxmox") || text.includes("image") || text.includes("base")) {
    return <HardDrive className={className} />;
  }
  if (text.includes("bind") || text.includes("gitlab") || text.includes("dns")) {
    return <Globe className={className} />;
  }
  if (text.includes("step") || text.includes("ca")) return <Shield className={className} />;
  if (text.includes("ntp")) return <Clock className={className} />;
  if (text.includes("registry") || text.includes("nginx") || text.includes("infra")) {
    return <Container className={className} />;
  }
  return <Server className={className} />;
}

function cardsFor(node: FlowNode): { label: string; hint?: string }[] {
  const count = node.count ?? 1;
  if (count <= 1) return [{ label: node.label, hint: node.hint }];
  return Array.from({ length: count }, (_, index) => ({
    label: count > 1 ? `${node.label} ${index + 1}` : node.label,
    hint: node.hint,
  }));
}

function layoutFlow(stages: FlowStage[]): { nodes: Array<LaneFlowNode | CardFlowNode>; edges: Edge[] } {
  const nodes: Array<LaneFlowNode | CardFlowNode> = [];
  const edges: Edge[] = [];
  const stageCards: string[][] = [];
  let x = 0;

  stages.forEach((stage, stageIndex) => {
    const cards = stage.nodes.flatMap((node) => cardsFor(node));
    const cols = cards.length > 3 ? 2 : 1;
    const rows = Math.ceil(cards.length / cols);
    const width = PAD_X * 2 + cols * NODE_W + (cols - 1) * GAP;
    const height = PAD_TOP + PAD_BOTTOM + rows * NODE_H + Math.max(0, rows - 1) * GAP;
    const laneId = `lane-${stageIndex}`;
    const tone = TONES[stageIndex % TONES.length];
    nodes.push({
      id: laneId,
      type: "lane",
      position: { x, y: 0 },
      data: { title: stage.title, tone },
      style: { width, height },
      selectable: false,
      draggable: false,
      zIndex: 0,
    });
    const ids: string[] = [];
    cards.forEach((card, cardIndex) => {
      const col = cardIndex % cols;
      const row = Math.floor(cardIndex / cols);
      const id = `${laneId}-n${cardIndex}`;
      ids.push(id);
      nodes.push({
        id,
        type: "card",
        parentId: laneId,
        position: {
          x: PAD_X + col * (NODE_W + GAP),
          y: PAD_TOP + row * (NODE_H + GAP),
        },
        data: card,
        draggable: false,
        selectable: false,
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        zIndex: 1,
        style: { width: NODE_W, height: NODE_H },
      });
    });
    stageCards.push(ids);

    if (stage.chain && stage.nodes.length > 1) {
      let cursor = 0;
      for (let nodeIndex = 0; nodeIndex < stage.nodes.length - 1; nodeIndex += 1) {
        const from = cardsFor(stage.nodes[nodeIndex]);
        const to = cardsFor(stage.nodes[nodeIndex + 1]);
        const fromIds = ids.slice(cursor, cursor + from.length);
        cursor += from.length;
        const toIds = ids.slice(cursor, cursor + to.length);
        pushEdges(edges, fromIds, toIds, false, tone);
      }
    }

    x += width + LANE_GAP;
  });

  stages.forEach((stage, stageIndex) => {
    if (stageIndex === 0) return;
    const previous = stages[stageIndex - 1];
    const sources = outgoingIds(previous, stageCards[stageIndex - 1]);
    const targets = incomingIds(stage, stageCards[stageIndex]);
    pushEdges(edges, sources, targets, stage.link === "both", TONES[stageIndex % TONES.length]);
  });

  return { nodes, edges };
}

function outgoingIds(stage: FlowStage, ids: string[]): string[] {
  if (!stage.chain || stage.nodes.length < 2) return ids;
  const last = cardsFor(stage.nodes[stage.nodes.length - 1]).length;
  return ids.slice(ids.length - last);
}

function incomingIds(stage: FlowStage, ids: string[]): string[] {
  if (!stage.chain || stage.nodes.length < 2) return ids;
  const first = cardsFor(stage.nodes[0]).length;
  return ids.slice(0, first);
}

function pushEdges(edges: Edge[], sources: string[], targets: string[], both: boolean, tone: Tone) {
  for (const source of sources) {
    for (const target of targets) {
      edges.push({
        id: `${source}>${target}`,
        source,
        target,
        type: "default",
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 14,
          height: 14,
          color: tone.title,
        },
        markerStart: both
          ? { type: MarkerType.ArrowClosed, width: 14, height: 14, color: tone.title }
          : undefined,
        style: { stroke: tone.title, strokeWidth: 1.25, opacity: 0.55 },
      });
    }
  }
}

function LaneNode({ data }: NodeProps<LaneFlowNode>) {
  return (
    <div
      className="h-full w-full rounded-xl border px-3 pt-2"
      style={{ background: data.tone.background, borderColor: data.tone.border }}
    >
      <p className="text-[11px] font-medium tracking-wide" style={{ color: data.tone.title }}>
        {data.title}
      </p>
    </div>
  );
}

function CardNode({ data }: NodeProps<CardFlowNode>) {
  return (
    <div className="flex h-full items-center gap-2 rounded-lg bg-[#1c1c21] px-2 py-1.5 shadow-sm ring-1 ring-white/10">
      <Handle type="target" position={Position.Left} className="!size-1.5 !border-0 !bg-white/50" />
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/80">
        <TemplateNodeIcon label={data.label} hint={data.hint} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[12px] leading-4 font-medium">{data.label}</span>
        {data.hint ? (
          <span className="block truncate text-[10px] leading-3 text-white/45">{data.hint}</span>
        ) : null}
      </span>
      <Handle type="source" position={Position.Right} className="!size-1.5 !border-0 !bg-white/50" />
    </div>
  );
}

const nodeTypes = { lane: LaneNode, card: CardNode };

export function TemplateFlowCanvas({ stages }: { stages: FlowStage[] }) {
  const flow = useMemo(() => layoutFlow(stages), [stages]);
  const flowKey = stages.map((stage) => stage.title).join("|");

  return (
    <ReactFlow
      key={flowKey}
      nodes={flow.nodes}
      edges={flow.edges}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.12 }}
      minZoom={0.35}
      maxZoom={1.4}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      panOnScroll={false}
      zoomOnScroll={false}
      zoomOnPinch
      colorMode="dark"
      proOptions={{ hideAttribution: true }}
      className="bg-[#121214]"
    >
      <Background gap={18} size={1.2} color="oklch(1 0 0 / 14%)" />
    </ReactFlow>
  );
}
