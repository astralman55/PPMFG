import type { SoloPlacementView, SoloSheetView } from "@/lib/pricing/solo-nest";

/**
 * Pure SVG-geometry helpers for SheetDiagram.tsx, kept separate from the
 * component so the cut-line logic can be unit tested without rendering.
 *
 * The nester (lib/pricing/nesting.ts) hands back placements and remnants,
 * but not each strip's own height directly - a strip's height is fixed when
 * it opens and can exceed the width_in of every part later packed into it,
 * so it has to be reconstructed here: a strip's bottom edge is either the
 * next strip's top edge, or (for the last strip) the sheet_tail remnant's
 * top edge, or the sheet's own bottom edge if the sheet is full.
 */

export interface StripBand {
  strip_index: number;
  top: number;
  bottom: number;
}

export interface CutLine {
  kind: "rip" | "crosscut";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface ScrapGapRect {
  x: number;
  y: number;
  length_in: number;
  width_in: number;
}

export function deriveStripBands(sheet: SoloSheetView): StripBand[] {
  const tops = new Map<number, number>();
  for (const p of sheet.placements) {
    if (!tops.has(p.strip_index)) tops.set(p.strip_index, p.y);
  }
  const indices = Array.from(tops.keys()).sort((a, b) => a - b);

  return indices.map((strip_index, i) => {
    const top = tops.get(strip_index)!;
    let bottom: number;
    if (i + 1 < indices.length) {
      bottom = tops.get(indices[i + 1])!;
    } else {
      const tail = sheet.remnants.find((r) => r.source === "sheet_tail");
      bottom = tail ? tail.y : sheet.width_in;
    }
    return { strip_index, top, bottom };
  });
}

/**
 * Rip cuts (full-length, between strips) and crosscuts (full strip height,
 * between adjacent parts in the same strip) - matching the guillotine
 * sequence build_cut_sequence() produces for the real fulfilment plan.
 */
export function deriveCutLines(sheet: SoloSheetView): CutLine[] {
  const bands = deriveStripBands(sheet);
  const lines: CutLine[] = [];

  for (let i = 1; i < bands.length; i++) {
    lines.push({ kind: "rip", x1: 0, y1: bands[i].top, x2: sheet.length_in, y2: bands[i].top });
  }

  const bandByIndex = new Map(bands.map((b) => [b.strip_index, b] as const));
  const byStrip = new Map<number, SoloPlacementView[]>();
  for (const p of sheet.placements) {
    const arr = byStrip.get(p.strip_index) ?? [];
    arr.push(p);
    byStrip.set(p.strip_index, arr);
  }
  for (const [strip_index, parts] of byStrip) {
    const band = bandByIndex.get(strip_index);
    if (!band) continue;
    const ordered = [...parts].sort((a, b) => a.x - b.x);
    for (let i = 1; i < ordered.length; i++) {
      const x = ordered[i].x;
      lines.push({ kind: "crosscut", x1: x, y1: band.top, x2: x, y2: band.bottom });
    }
  }
  return lines;
}

/**
 * Area below a part but still inside its strip's band - real scrap the
 * packer doesn't log as a Remnant (only strip-tail/sheet-tail bands are
 * logged). Only appears when a strip holds parts of mixed height.
 */
export function deriveScrapGaps(sheet: SoloSheetView): ScrapGapRect[] {
  const bandByIndex = new Map(deriveStripBands(sheet).map((b) => [b.strip_index, b] as const));
  const gaps: ScrapGapRect[] = [];
  for (const p of sheet.placements) {
    const band = bandByIndex.get(p.strip_index);
    if (!band) continue;
    const gapHeight = band.bottom - (p.y + p.width_in);
    if (gapHeight > 1e-6) {
      gaps.push({ x: p.x, y: p.y + p.width_in, length_in: p.length_in, width_in: gapHeight });
    }
  }
  return gaps;
}
