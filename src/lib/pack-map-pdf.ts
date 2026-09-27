import { getViewportForBounds, type Rect } from "@xyflow/react";
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";

const PAGE_MAX_W = 2400;
const PAGE_MAX_H = 1600;

export function packMapPdfFileName(name: string): string {
  const safe = name
    .trim()
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const base = safe || "pack-map";
  return base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;
}

export function packMapPdfPage(
  contentWidth: number,
  contentHeight: number,
): { width: number; height: number } {
  const width = Math.max(contentWidth, 1);
  const height = Math.max(contentHeight, 1);
  const fit = Math.min(PAGE_MAX_W / width, PAGE_MAX_H / height);
  const scale = Math.min(Math.max(fit, 0.35), 2);
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

export async function downloadPackMapPdf(input: {
  viewport: HTMLElement;
  bounds: Rect;
  fileName: string;
}): Promise<void> {
  const page = packMapPdfPage(input.bounds.width, input.bounds.height);
  const viewport = getViewportForBounds(
    input.bounds,
    page.width,
    page.height,
    0.2,
    2,
    0.08,
  );
  const pixelRatio = page.width * page.height > 1_600_000 ? 1 : 2;
  const dataUrl = await toPng(input.viewport, {
    backgroundColor: "#111113",
    width: page.width,
    height: page.height,
    pixelRatio,
    skipFonts: true,
    style: {
      width: `${page.width}px`,
      height: `${page.height}px`,
      transformOrigin: "0 0",
      transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
    },
  });
  const pdf = new jsPDF({
    orientation: page.width >= page.height ? "l" : "p",
    unit: "px",
    format: [page.width, page.height],
    hotfixes: ["px_scaling"],
  });
  pdf.addImage(dataUrl, "PNG", 0, 0, page.width, page.height);
  pdf.save(packMapPdfFileName(input.fileName));
}
