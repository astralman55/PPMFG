import { describe, test, expect } from "vitest";
import type { SoloSheetView } from "@/lib/pricing/solo-nest";
import { deriveStripBands, deriveCutLines, deriveScrapGaps } from "../nest-diagram-geometry";

function placement(overrides: Partial<SoloSheetView["placements"][number]>): SoloSheetView["placements"][number] {
  return {
    x: 0,
    y: 0,
    length_in: 10,
    width_in: 5,
    rotated: false,
    strip_index: 0,
    line_no: 1,
    label: "Line 1",
    ...overrides,
  };
}

describe("deriveStripBands", () => {
  test("a single strip's band runs from its top to the sheet's own bottom edge when there's no tail remnant", () => {
    const sheet: SoloSheetView = {
      index: 0,
      length_in: 48,
      width_in: 24,
      placements: [placement({ strip_index: 0, y: 0.25 })],
      remnants: [],
    };
    const bands = deriveStripBands(sheet);
    expect(bands).toEqual([{ strip_index: 0, top: 0.25, bottom: 24 }]);
  });

  test("a strip's band bottom is the sheet_tail remnant's top edge when one is logged", () => {
    const sheet: SoloSheetView = {
      index: 0,
      length_in: 48,
      width_in: 24,
      placements: [placement({ strip_index: 0, y: 0.25, width_in: 5 })],
      remnants: [{ x: 0.25, y: 5.25, length_in: 47.5, width_in: 18.5, source: "sheet_tail", keepable: true }],
    };
    const bands = deriveStripBands(sheet);
    expect(bands).toEqual([{ strip_index: 0, top: 0.25, bottom: 5.25 }]);
  });

  test("two strips: the first strip's bottom is exactly the second strip's top", () => {
    const sheet: SoloSheetView = {
      index: 0,
      length_in: 48,
      width_in: 24,
      placements: [
        placement({ strip_index: 0, y: 0.25, width_in: 8 }),
        placement({ strip_index: 1, y: 8.25, width_in: 6 }),
      ],
      remnants: [],
    };
    const bands = deriveStripBands(sheet);
    expect(bands).toEqual([
      { strip_index: 0, top: 0.25, bottom: 8.25 },
      { strip_index: 1, top: 8.25, bottom: 24 },
    ]);
  });
});

describe("deriveCutLines", () => {
  test("a lone strip with one part produces no cut lines at all - nothing to separate", () => {
    const sheet: SoloSheetView = {
      index: 0,
      length_in: 48,
      width_in: 24,
      placements: [placement({ strip_index: 0 })],
      remnants: [],
    };
    expect(deriveCutLines(sheet)).toEqual([]);
  });

  test("two strips produce exactly one full-length rip line at the boundary between them", () => {
    const sheet: SoloSheetView = {
      index: 0,
      length_in: 48,
      width_in: 24,
      placements: [
        placement({ strip_index: 0, y: 0.25, width_in: 8 }),
        placement({ strip_index: 1, y: 8.25, width_in: 6 }),
      ],
      remnants: [],
    };
    const lines = deriveCutLines(sheet);
    const rips = lines.filter((l) => l.kind === "rip");
    expect(rips).toEqual([{ kind: "rip", x1: 0, y1: 8.25, x2: 48, y2: 8.25 }]);
  });

  test("two parts sharing one strip produce one crosscut spanning the full strip band, not just the shorter part", () => {
    const sheet: SoloSheetView = {
      index: 0,
      length_in: 48,
      width_in: 24,
      placements: [
        placement({ strip_index: 0, x: 0.25, y: 0.25, length_in: 10, width_in: 8 }),
        placement({ strip_index: 0, x: 10.5, y: 0.25, length_in: 10, width_in: 5 }),
      ],
      remnants: [{ x: 0.25, y: 8.25, length_in: 47.5, width_in: 15.75, source: "sheet_tail", keepable: true }],
    };
    const lines = deriveCutLines(sheet);
    const crosscuts = lines.filter((l) => l.kind === "crosscut");
    expect(crosscuts).toEqual([{ kind: "crosscut", x1: 10.5, y1: 0.25, x2: 10.5, y2: 8.25 }]);
  });
});

describe("deriveScrapGaps", () => {
  test("a part shorter than its strip's band leaves a real, unlogged scrap gap below it", () => {
    const sheet: SoloSheetView = {
      index: 0,
      length_in: 48,
      width_in: 24,
      placements: [placement({ strip_index: 0, x: 0.25, y: 0.25, length_in: 10, width_in: 5 })],
      remnants: [{ x: 0.25, y: 8.25, length_in: 47.5, width_in: 15.75, source: "sheet_tail", keepable: true }],
    };
    // Band is 0.25 -> 8.25 (8in tall), part is only 5in tall -> 3in gap below it.
    expect(deriveScrapGaps(sheet)).toEqual([{ x: 0.25, y: 5.25, length_in: 10, width_in: 3 }]);
  });

  test("a part that exactly fills its strip's band leaves no gap", () => {
    const sheet: SoloSheetView = {
      index: 0,
      length_in: 48,
      width_in: 24,
      placements: [placement({ strip_index: 0, x: 0.25, y: 0.25, length_in: 10, width_in: 23.75 })],
      remnants: [],
    };
    expect(deriveScrapGaps(sheet)).toEqual([]);
  });
});
