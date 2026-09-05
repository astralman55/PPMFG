import { describe, test, expect } from "vitest";
import { quote, type PricingConfig, type QuoteRequestInput } from "../engine";
import { buildSoloNest } from "../solo-nest";
import rawConfig from "../config.json";

const CFG = rawConfig as unknown as PricingConfig;
const ORDER_DATE = "2026-01-05"; // a Monday

function priceLines(lines: QuoteRequestInput["lines"]) {
  return quote({ lines, order_date: ORDER_DATE }, CFG);
}

describe("buildSoloNest - Phase 11 solo cut-layout preview", () => {
  test("three 12x12 PEEK blanks nest onto one sheet, matching the reference nester fixture", () => {
    // Same geometry as lib/pricing/__tests__/nesting.test.ts's "flagship 12x12
    // blank" fixture: exactly three fit one 48x24 sheet at 30-45% utilisation.
    const result = priceLines([
      { material_code: "PEEK_NAT", length_in: 12, width_in: 12, thickness_in: 0.5, qty: 3 },
    ]);
    const solo = buildSoloNest(result.lines, CFG);

    expect(solo.groups).toHaveLength(1);
    const g = solo.groups[0];
    expect(g.material_code).toBe("PEEK_NAT");
    expect(g.sheet_count).toBe(1);
    expect(g.utilisation).toBeGreaterThan(0.3);
    expect(g.utilisation).toBeLessThan(0.45);
    expect(g.sheets).toHaveLength(1);
    expect(g.sheets[0].placements).toHaveLength(3);
  });

  test("labels placements with the line's part reference when one was given", () => {
    const result = priceLines([
      { material_code: "PEEK_NAT", length_in: 12, width_in: 12, thickness_in: 0.5, qty: 1, part_ref: "BRACKET-A" },
    ]);
    const solo = buildSoloNest(result.lines, CFG);
    expect(solo.groups[0].sheets[0].placements[0].label).toBe("BRACKET-A");
  });

  test("falls back to a plain line number label when no part reference was given", () => {
    const result = priceLines([
      { material_code: "PEEK_NAT", length_in: 12, width_in: 12, thickness_in: 0.5, qty: 1 },
    ]);
    const solo = buildSoloNest(result.lines, CFG);
    expect(solo.groups[0].sheets[0].placements[0].label).toBe("Line 1");
  });

  test("lines in different materials split into separate groups, each on its own material's sheet size", () => {
    const result = priceLines([
      { material_code: "PEEK_NAT", length_in: 10, width_in: 10, thickness_in: 0.5, qty: 1 },
      { material_code: "TORLON_4203", length_in: 10, width_in: 10, thickness_in: 0.25, qty: 1 },
    ]);
    const solo = buildSoloNest(result.lines, CFG);
    expect(solo.groups).toHaveLength(2);
    const peek = solo.groups.find((g) => g.material_code === "PEEK_NAT")!;
    const torlon = solo.groups.find((g) => g.material_code === "TORLON_4203")!;
    expect(peek.sheets[0].length_in).toBe(CFG.materials.PEEK_NAT.sheet_length_in);
    expect(torlon.sheets[0].length_in).toBe(CFG.materials.TORLON_4203.sheet_length_in);
  });

  test("a big batched order reaches materially higher utilisation than a lone small one", () => {
    const lonely = priceLines([
      { material_code: "PEEK_NAT", length_in: 11, width_in: 7, thickness_in: 0.5, qty: 2 },
    ]);
    const busy = priceLines([
      { material_code: "PEEK_NAT", length_in: 11, width_in: 7, thickness_in: 0.5, qty: 9 },
    ]);
    const soloLonely = buildSoloNest(lonely.lines, CFG).groups[0];
    const soloBusy = buildSoloNest(busy.lines, CFG).groups[0];
    expect(soloBusy.utilisation).toBeGreaterThan(soloLonely.utilisation);
  });

  test("is stateless - nothing about calling it twice changes its own output", () => {
    const result = priceLines([
      { material_code: "PEEK_NAT", length_in: 12, width_in: 12, thickness_in: 0.5, qty: 3 },
    ]);
    const a = buildSoloNest(result.lines, CFG);
    const b = buildSoloNest(result.lines, CFG);
    expect(a).toEqual(b);
  });
});
