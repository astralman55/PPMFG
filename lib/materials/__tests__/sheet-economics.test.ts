import { describe, test, expect } from "vitest";
import cfgJson from "@/lib/pricing/config.json";
import type { PricingConfig } from "@/lib/pricing/engine";
import { sheetVsBlankComparison } from "../sheet-economics";

const CFG = cfgJson as unknown as PricingConfig;

describe("sheetVsBlankComparison", () => {
  test("computes real raw-material cost from config, not a hardcoded figure", () => {
    const mat = CFG.materials.PEEK_NAT;
    const c = sheetVsBlankComparison(CFG, "PEEK_NAT", 0.5, 12, 12);

    const expectedSheetWeight = mat.sheet_length_in * mat.sheet_width_in * 0.5 * mat.density_lb_in3;
    expect(c.sheetWeightLb).toBeCloseTo(expectedSheetWeight, 6);
    expect(c.sheetRawCost).toBeCloseTo(expectedSheetWeight * mat.price_per_lb, 6);

    const expectedBlankCost = 12 * 12 * 0.5 * mat.density_lb_in3 * mat.price_per_lb;
    expect(c.blankRawCost).toBeCloseTo(expectedBlankCost, 6);
  });

  test("the shelf remainder is exactly sheet minus blank - a smaller blank leaves more on the shelf", () => {
    const c = sheetVsBlankComparison(CFG, "PEEK_NAT", 0.5, 12, 12);
    expect(c.shelfRemainderCost).toBeCloseTo(c.sheetRawCost - c.blankRawCost, 6);

    const smaller = sheetVsBlankComparison(CFG, "PEEK_NAT", 0.5, 6, 6);
    expect(smaller.shelfRemainderCost).toBeGreaterThan(c.shelfRemainderCost);
  });

  test("a full-sheet-sized blank leaves nothing on the shelf", () => {
    const mat = CFG.materials.PEEK_NAT;
    const c = sheetVsBlankComparison(CFG, "PEEK_NAT", 0.5, mat.sheet_length_in, mat.sheet_width_in);
    expect(c.shelfRemainderCost).toBeCloseTo(0, 6);
  });
});
