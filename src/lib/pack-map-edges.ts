import { PACK_MAP_COL_X, PACK_MAP_NODE_W } from "./atlas-pack-map.ts";

export type PackMapRect = {
  id?: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type PackMapPoint = { x: number; y: number };

const PAD = 8;
const MIN_LANE = 16;
const LOOP_OFFSET = 22;

export function inflateRect(rect: PackMapRect, pad = PAD): PackMapRect {
  return {
    id: rect.id,
    x: rect.x - pad,
    y: rect.y - pad,
    w: rect.w + pad * 2,
    h: rect.h + pad * 2,
  };
}

function overlap1d(a0: number, a1: number, b0: number, b1: number): boolean {
  return Math.min(a0, a1) < Math.max(b0, b1) && Math.max(a0, a1) > Math.min(b0, b1);
}

export function segmentHitsRect(
  a: PackMapPoint,
  b: PackMapPoint,
  rect: PackMapRect,
): boolean {
  const x0 = rect.x;
  const y0 = rect.y;
  const x1 = rect.x + rect.w;
  const y1 = rect.y + rect.h;
  if (Math.abs(a.y - b.y) < 0.5) {
    const y = a.y;
    return y > y0 && y < y1 && overlap1d(a.x, b.x, x0, x1);
  }
  if (Math.abs(a.x - b.x) < 0.5) {
    const x = a.x;
    return x > x0 && x < x1 && overlap1d(a.y, b.y, y0, y1);
  }
  return false;
}

export function polylineHitsRects(
  points: PackMapPoint[],
  rects: PackMapRect[],
): string[] {
  const hits: string[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    for (const rect of rects) {
      if (segmentHitsRect(a, b, rect)) {
        hits.push(rect.id || `${rect.x},${rect.y}`);
      }
    }
  }
  return [...new Set(hits)];
}

function mergeIntervals(items: [number, number][]): [number, number][] {
  if (!items.length) return [];
  const sorted = [...items].sort((left, right) => left[0] - right[0]);
  const out: [number, number][] = [[sorted[0][0], sorted[0][1]]];
  for (const [start, end] of sorted.slice(1)) {
    const last = out[out.length - 1];
    if (start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      out.push([start, end]);
    }
  }
  return out;
}

function hBlocked(y: number, x0: number, x1: number, rects: PackMapRect[]): boolean {
  return rects.some(
    (rect) =>
      y > rect.y &&
      y < rect.y + rect.h &&
      overlap1d(x0, x1, rect.x, rect.x + rect.w),
  );
}

export function packMapGutterAfter(x: number): number {
  for (let index = 0; index < PACK_MAP_COL_X.length; index += 1) {
    const right = PACK_MAP_COL_X[index] + PACK_MAP_NODE_W;
    const next = PACK_MAP_COL_X[index + 1];
    const gutter = next == null ? right + 24 : (right + next) / 2;
    if (gutter > x + 1) return gutter;
  }
  return x + LOOP_OFFSET;
}

export function packMapGutterBefore(x: number): number {
  for (let index = PACK_MAP_COL_X.length - 1; index >= 0; index -= 1) {
    const left = PACK_MAP_COL_X[index];
    const prevRight =
      index === 0 ? left - 48 : PACK_MAP_COL_X[index - 1] + PACK_MAP_NODE_W;
    const gutter = (prevRight + left) / 2;
    if (gutter < x - 1) return gutter;
  }
  return x - LOOP_OFFSET;
}

function findLaneY(
  x0: number,
  x1: number,
  preferred: number[],
  rects: PackMapRect[],
): number {
  for (const y of preferred) {
    if (!hBlocked(y, x0, x1, rects)) return y;
  }
  const spanning = rects.filter((rect) =>
    overlap1d(x0, x1, rect.x, rect.x + rect.w),
  );
  const blocked = mergeIntervals(
    spanning.map((rect) => [rect.y, rect.y + rect.h]),
  );
  const minY = Math.min(preferred[0] ?? 0, ...spanning.map((rect) => rect.y)) - 80;
  const maxY =
    Math.max(preferred[0] ?? 0, ...spanning.map((rect) => rect.y + rect.h)) + 80;
  const gaps: [number, number][] = [];
  let cursor = minY;
  for (const [start, end] of blocked) {
    if (start - cursor >= MIN_LANE) gaps.push([cursor, start]);
    cursor = Math.max(cursor, end);
  }
  if (maxY - cursor >= MIN_LANE) gaps.push([cursor, maxY]);
  const target = preferred[0] ?? 0;
  let best: [number, number] | null = null;
  let bestDist = Infinity;
  for (const gap of gaps) {
    const mid = (gap[0] + gap[1]) / 2;
    const dist = Math.abs(mid - target);
    if (dist < bestDist) {
      best = gap;
      bestDist = dist;
    }
  }
  if (!best) return (preferred[0] ?? 0) - 48;
  return (best[0] + best[1]) / 2;
}

function collapse(points: PackMapPoint[]): PackMapPoint[] {
  const out: PackMapPoint[] = [];
  for (const point of points) {
    const prev = out[out.length - 1];
    if (prev && Math.abs(prev.x - point.x) < 0.5 && Math.abs(prev.y - point.y) < 0.5) {
      continue;
    }
    const older = out[out.length - 2];
    if (
      prev &&
      older &&
      ((Math.abs(older.x - prev.x) < 0.5 && Math.abs(prev.x - point.x) < 0.5) ||
        (Math.abs(older.y - prev.y) < 0.5 && Math.abs(prev.y - point.y) < 0.5))
    ) {
      out[out.length - 1] = point;
      continue;
    }
    out.push(point);
  }
  return out;
}

export function roundedPolyline(points: PackMapPoint[], radius = 10): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const prev = points[index - 1];
    const curr = points[index];
    const next = points[index + 1];
    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;
    const len1 = Math.hypot(dx1, dy1) || 1;
    const len2 = Math.hypot(dx2, dy2) || 1;
    const corner = Math.min(radius, len1 / 2, len2 / 2);
    const p1 = {
      x: curr.x - (dx1 / len1) * corner,
      y: curr.y - (dy1 / len1) * corner,
    };
    const p2 = {
      x: curr.x + (dx2 / len2) * corner,
      y: curr.y + (dy2 / len2) * corner,
    };
    d += ` L ${p1.x} ${p1.y} Q ${curr.x} ${curr.y} ${p2.x} ${p2.y}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

function longestMidpoint(points: PackMapPoint[]): PackMapPoint {
  let best = points[0] ?? { x: 0, y: 0 };
  let bestLen = -1;
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > bestLen) {
      bestLen = len;
      best = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
  }
  return best;
}

export function packMapEdgeRoute(input: {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  obstacles: PackMapRect[];
}): {
  points: PackMapPoint[];
  path: string;
  labelX: number;
  labelY: number;
} {
  const { sourceX, sourceY, targetX, targetY } = input;
  const obstacles = input.obstacles.map((rect) => inflateRect(rect));
  const loop = targetX <= sourceX + 12;
  let points: PackMapPoint[];
  if (loop) {
    const gutter = sourceX + LOOP_OFFSET;
    points = [
      { x: sourceX, y: sourceY },
      { x: gutter, y: sourceY },
      { x: gutter, y: targetY },
      { x: targetX, y: targetY },
    ];
  } else {
    const gStart = packMapGutterAfter(sourceX);
    let gEnd = packMapGutterBefore(targetX);
    if (gEnd < gStart) gEnd = gStart;
    if (Math.abs(gEnd - gStart) < 1) {
      points = [
        { x: sourceX, y: sourceY },
        { x: gStart, y: sourceY },
        { x: gStart, y: targetY },
        { x: targetX, y: targetY },
      ];
    } else {
      const laneY = findLaneY(
        gStart,
        gEnd,
        [targetY, sourceY, (sourceY + targetY) / 2],
        obstacles,
      );
      points = [
        { x: sourceX, y: sourceY },
        { x: gStart, y: sourceY },
        { x: gStart, y: laneY },
        { x: gEnd, y: laneY },
        { x: gEnd, y: targetY },
        { x: targetX, y: targetY },
      ];
    }
  }
  points = collapse(points);
  const label = longestMidpoint(points);
  return {
    points,
    path: roundedPolyline(points),
    labelX: label.x,
    labelY: label.y,
  };
}
