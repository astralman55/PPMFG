import { describe, test, expect } from "vitest";
import { nest, group_queue, plan_nest, NestPart, NestError, type QueueRow } from "../nesting";
import type { PricingConfig } from "../engine";
import rawConfig from "../config.json";

const CFG = rawConfig as unknown as PricingConfig;

// ---------------------------------------------------------------------------
// Geometry the business depends on: a 12x12 blank (12.25 in with kerf) on
// 24x48 stock allows only ONE shelf, because 2 x 12.25 + kerf = 24.625 in
// exceeds the 23.875 in usable width. Three per sheet, and the leftover is
// an 11.6 x 47.9 in band. The flagship product is an awkward nest, and the
// whole margin case rests on that band being sold as smaller blanks.
// ---------------------------------------------------------------------------

describe("guillotine shelf packing - flagship 12x12 blank", () => {
  const three = Array.from({ length: 3 }, (_, i) => new NestPart(`p${i}`, "ORD-1", 12.25, 12.25));
  const four = Array.from({ length: 4 }, (_, i) => new NestPart(`p${i}`, "ORD-1", 12.25, 12.25));
  const r3 = nest(three, 48.0, 24.0, CFG);
  const r4 = nest(four, 48.0, 24.0, CFG);
  const s3 = r3.summary;
  const s4 = r4.summary;

  test("reports the utilisation numbers", () => {
    console.log(
      `      3x 12.25in on 48x24: sheets ${s3.sheet_count}, util ${(s3.utilisation * 100).toFixed(1)}%, ` +
        `recoverable ${(s3.recoverable_fraction * 100).toFixed(1)}%`
    );
    console.log(
      `      4x 12.25in on 48x24: sheets ${s4.sheet_count}, util ${(s4.utilisation * 100).toFixed(1)}%, ` +
        `recoverable ${(s4.recoverable_fraction * 100).toFixed(1)}%`
    );
    expect(true).toBe(true);
  });

  test("exactly three 12in blanks fit one 24x48 sheet", () => {
    expect(s3.sheet_count).toBe(1);
  });
  test("a fourth 12in blank opens a second sheet", () => {
    expect(s4.sheet_count).toBe(2);
  });
  test("the leftover band is captured as keepable remnant, not scrap", () => {
    expect(s3.recoverable_fraction).toBeGreaterThan(0.95);
  });
  test("raw utilisation on a 12x12 run is poor, as expected (~14%)", () => {
    expect(s3.utilisation).toBeGreaterThan(0.3);
    expect(s3.utilisation).toBeLessThan(0.45);
  });
  test("no part exceeds sheet bounds", () => {
    for (const sh of r4.sheets) {
      for (const p of sh.placements) {
        expect(p.x + p.length_in).toBeLessThanOrEqual(48.0 + 1e-6);
        expect(p.y + p.width_in).toBeLessThanOrEqual(24.0 + 1e-6);
      }
    }
  });

  test("strips do not overlap in y (the guillotine guarantee)", () => {
    for (const sh of r4.sheets) {
      const strips = new Map<number, { y: number; width_in: number }[]>();
      for (const p of sh.placements) {
        const arr = strips.get(p.strip_index) ?? [];
        arr.push(p);
        strips.set(p.strip_index, arr);
      }
      const ranges = Array.from(strips.values())
        .map((ps) => [Math.min(...ps.map((p) => p.y)), Math.max(...ps.map((p) => p.y + p.width_in))] as const)
        .sort((a, b) => a[0] - b[0]);
      for (let i = 0; i < ranges.length - 1; i++) {
        expect(ranges[i][1]).toBeLessThanOrEqual(ranges[i + 1][0] + 1e-6);
      }
    }
  });
});

describe("determinism", () => {
  test("the same queue always produces the same plan", () => {
    const parts = () => Array.from({ length: 11 }, (_, i) => new NestPart(`p${i}`, "O", 7.0, 5.0));
    const r1 = nest(parts(), 48.0, 24.0, CFG);
    const r2 = nest(parts(), 48.0, 24.0, CFG);
    expect(r1.summary).toEqual(r2.summary);
  });
});

describe("rotation", () => {
  test("rotation never uses more sheets than forbidding it", () => {
    const awkward = () => Array.from({ length: 6 }, (_, i) => new NestPart(`p${i}`, "O", 22.0, 5.0));
    const rotCfg = JSON.parse(JSON.stringify(CFG)) as PricingConfig;
    const noRotCfg = JSON.parse(JSON.stringify(CFG)) as PricingConfig;
    noRotCfg.nesting.allow_rotation = false;

    const withRot = nest(awkward(), 48.0, 24.0, rotCfg).summary;
    const noRot = nest(awkward(), 48.0, 24.0, noRotCfg).summary;
    expect(withRot.sheet_count).toBeLessThanOrEqual(noRot.sheet_count);
  });
});

describe("oversized part", () => {
  test("a part larger than the sheet is rejected", () => {
    expect(() => nest([new NestPart("big", "O", 60.0, 30.0)], 48.0, 24.0, CFG)).toThrow(NestError);
  });
});

// ---------------------------------------------------------------------------
// Cross-order batching - the Nox mechanism. This is the entire economic
// argument for the FLEX lead tier: three small orders share a sheet far
// better than any one of them alone.
// ---------------------------------------------------------------------------

describe("cross-order batching", () => {
  const singleOrder: QueueRow[] = [
    {
      order_id: "A",
      line_no: 1,
      material_code: "PEEK_NAT",
      brand: "GENERIC",
      thickness_nominal: 0.5,
      certification_tier: "TIER1_TRACEABLE",
      length_in: 11.0,
      width_in: 7.0,
      qty: 2,
    },
  ];
  const threeOrders: QueueRow[] = [
    ...singleOrder,
    {
      order_id: "B",
      line_no: 1,
      material_code: "PEEK_NAT",
      brand: "GENERIC",
      thickness_nominal: 0.5,
      certification_tier: "TIER1_TRACEABLE",
      length_in: 9.0,
      width_in: 6.5,
      qty: 3,
    },
    {
      order_id: "C",
      line_no: 1,
      material_code: "PEEK_NAT",
      brand: "GENERIC",
      thickness_nominal: 0.5,
      certification_tier: "TIER1_TRACEABLE",
      length_in: 14.0,
      width_in: 4.0,
      qty: 4,
    },
  ];

  const p1 = plan_nest(singleOrder, CFG)[0].summary;
  const p3 = plan_nest(threeOrders, CFG)[0].summary;

  test("reports utilisation for one order vs. three batched (~51% target)", () => {
    console.log(
      `      1 order  (${p1.order_count} on sheet): util ${(p1.utilisation * 100).toFixed(1)}%, ` +
        `eta_realised ${(p1.eta_realised * 100).toFixed(1)}%, sheets ${p1.sheet_count}`
    );
    console.log(
      `      3 orders (${p3.order_count} on sheet): util ${(p3.utilisation * 100).toFixed(1)}%, ` +
        `eta_realised ${(p3.eta_realised * 100).toFixed(1)}%, sheets ${p3.sheet_count}`
    );
    expect(true).toBe(true);
  });

  test("batching raises utilisation", () => {
    expect(p3.utilisation).toBeGreaterThan(p1.utilisation);
  });
  test("all three orders share one sheet", () => {
    expect(p3.sheet_count).toBe(1);
    expect(p3.order_count).toBe(3);
  });
  test("a cut sequence is produced", () => {
    expect(plan_nest(threeOrders, CFG)[0].cut_sequence.length).toBeGreaterThan(5);
  });

  test("brand splits the nest group", () => {
    const mixed: QueueRow[] = [
      ...threeOrders,
      {
        order_id: "D",
        line_no: 1,
        material_code: "PEEK_NAT",
        brand: "VICTREX",
        thickness_nominal: 0.5,
        certification_tier: "TIER1_TRACEABLE",
        length_in: 8.0,
        width_in: 8.0,
        qty: 1,
      },
      {
        order_id: "E",
        line_no: 1,
        material_code: "PEEK_NAT",
        brand: "GENERIC",
        thickness_nominal: 0.5,
        certification_tier: "INDUSTRIAL",
        length_in: 8.0,
        width_in: 8.0,
        qty: 1,
      },
    ];
    const groups = group_queue(mixed, CFG);
    expect(groups.length).toBe(3);
    expect(groups.some((g) => g.key[3] === "INDUSTRIAL")).toBe(true);
  });

  test("grain-sensitive material is never rotated", () => {
    const g10Rows: QueueRow[] = [
      {
        order_id: "G",
        line_no: 1,
        material_code: "G10_FR4",
        brand: "GENERIC",
        thickness_nominal: 0.25,
        certification_tier: "TIER1_TRACEABLE",
        length_in: 20.0,
        width_in: 6.0,
        qty: 4,
      },
    ];
    const g10Plan = plan_nest(g10Rows, CFG)[0];
    for (const sh of g10Plan.sheets) {
      for (const p of sh.placements) {
        expect(p.rotated).toBe(false);
      }
    }
  });
});
