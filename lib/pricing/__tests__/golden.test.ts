import { describe, test, expect } from "vitest";
import {
  quote,
  margin_for,
  add_business_days,
  QuoteError,
  type PricingConfig,
  type QuoteRequestInput,
} from "../engine";
import rawConfig from "../config.json";
import goldenData from "../../../reference/golden_cases.json";

// The TypeScript engine must reproduce the Python reference implementation's
// output to within the tolerance below. If a test here fails, the fix is in
// engine.ts - never in reference/golden_cases.json. The Python is the oracle.

const BASE_CFG = rawConfig as unknown as PricingConfig;

/** Mirrors reference/test_pricing.py's mature_cfg(): the "launch" config with
 * remnant_recovery_rate raised from the 0.15 UNCALIBRATED default to 0.50,
 * per golden_cases.json's config_override. */
function matureCfg(): PricingConfig {
  const c = JSON.parse(JSON.stringify(BASE_CFG)) as PricingConfig;
  c.shop.remnant_recovery_rate = 0.5;
  return c;
}

const MAT = matureCfg();

function closeTo(actual: number, expected: number, tol = 0.01) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tol + 1e-9);
}

/** Mirrors reference/test_pricing.py's q(**kw) helper: a single PEEK_NAT
 * 12x12x0.5 line with any overrides split between line-level and
 * request-level fields. */
const LINE_KEYS = new Set([
  "material_code",
  "length_in",
  "width_in",
  "thickness_in",
  "qty",
  "brand",
  "certification_tier",
  "tolerance_tier",
  "edge_finish",
  "face_finish",
  "anneal",
  "add_ons",
  "part_ref",
]);

function q(kw: Record<string, unknown> = {}) {
  const line: Record<string, unknown> = {
    material_code: "PEEK_NAT",
    length_in: 12,
    width_in: 12,
    thickness_in: 0.5,
    qty: 1,
  };
  const reqKw: Record<string, unknown> = { sourcing_mode: "MASTER_SHEET" };
  for (const [k, v] of Object.entries(kw)) {
    if (LINE_KEYS.has(k)) line[k] = v;
    else reqKw[k] = v;
  }
  const payload = { lines: [line], ...reqKw } as unknown as QuoteRequestInput;
  return quote(payload, MAT);
}

function safeTotal(payload: QuoteRequestInput): number | null {
  try {
    return quote(payload, MAT).totals.total_due;
  } catch (e) {
    if (e instanceof QuoteError) return null;
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Golden cases - exact numerical parity with the Python oracle
// ---------------------------------------------------------------------------

describe("golden cases (parity with pricing_engine.py)", () => {
  const tol = goldenData.tolerance_usd;
  for (const c of goldenData.cases) {
    test(c.name, () => {
      const result = quote(c.input as unknown as QuoteRequestInput, MAT);
      const e = c.expect;
      closeTo(result.totals.subtotal_goods, e.subtotal_goods, tol);
      closeTo(result.totals.shipping, e.shipping, tol);
      closeTo(result.totals.total_due, e.total_due, tol);
      expect(result.totals.total_cents).toBe(e.total_cents);
      closeTo(result.cost_breakdown.cogs, e.cogs, tol);
      closeTo(result.cost_breakdown.margin_rate, e.margin_rate, tol);
      closeTo(result.cost_breakdown.c_rework_expected, e.c_rework_expected, tol);
      closeTo(result.cost_breakdown.c_annealing, e.c_annealing, tol);
      expect(result.sanity.gamma).not.toBeNull();
      closeTo(result.sanity.gamma as number, e.gamma, tol);
      expect(result.lead_time.promised_ship_date).toBe(e.promised_ship_date);
    });
  }
});

// ---------------------------------------------------------------------------
// [1] Canonical case
// ---------------------------------------------------------------------------

describe("canonical case - PEEK 12x12x0.500, generic brand, Tier 1, standard", () => {
  test("STD tier applies its nest uplift", () => {
    expect(q().lines[0].geometry.nest_uplift).toBeCloseTo(0.12, 9);
  });
  test("t_actual includes mill oversize", () => {
    expect(q().lines[0].thickness_actual_in).toBeCloseTo(0.535, 9);
  });
  test("gamma inside sanity rails", () => {
    const g = q().sanity.gamma as number;
    expect(g).toBeGreaterThan(MAT.sanity_rails.gamma_min);
    expect(g).toBeLessThan(MAT.sanity_rails.gamma_max);
  });
  test("local delivery applied to 92020", () => {
    expect(q().freight.rate_source).toBe("LOCAL_DELIVERY");
  });
  test("free local delivery over threshold", () => {
    expect(q().totals.shipping).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// [2] Brand as a first-class attribute
// ---------------------------------------------------------------------------

describe("brand as a first-class attribute", () => {
  const gen = q({ brand: "GENERIC" });
  const ens = q({ brand: "ENSINGER_TECAPEEK" });
  const vic = q({ brand: "VICTREX" });

  test("named brand costs more than generic", () => {
    expect(ens.totals.total_due).toBeGreaterThan(gen.totals.total_due);
  });
  test("Victrex premium exceeds Ensinger", () => {
    expect(vic.totals.total_due).toBeGreaterThan(ens.totals.total_due);
  });
  test("brand lock suppresses remnant recovery (lowers eta_eff)", () => {
    expect(ens.lines[0].geometry.eta_eff).toBeLessThan(gen.lines[0].geometry.eta_eff);
  });
  test("brand lock raises a flag", () => {
    expect(ens.sanity.flags.some((f) => f.includes("BRAND_LOCKED"))).toBe(true);
  });
  test("named brand blocked on industrial tier", () => {
    expect(() => q({ brand: "ENSINGER_TECAPEEK", certification_tier: "INDUSTRIAL" })).toThrow(QuoteError);
  });
});

// ---------------------------------------------------------------------------
// [3] Certification tiers
// ---------------------------------------------------------------------------

describe("certification tiers", () => {
  test("industrial tier is cheaper, by a material amount", () => {
    const t1 = q({ certification_tier: "TIER1_TRACEABLE" });
    const ind = q({ certification_tier: "INDUSTRIAL" });
    expect(ind.totals.total_due).toBeLessThan(t1.totals.total_due);
    const saving = 1 - ind.totals.total_due / t1.totals.total_due;
    expect(saving).toBeGreaterThan(0.15);
  });
  test("FAIR blocked on industrial tier", () => {
    expect(() => q({ certification_tier: "INDUSTRIAL", add_ons: ["fair_as9102"] })).toThrow(QuoteError);
  });
});

// ---------------------------------------------------------------------------
// [4] Tolerance tiers, extra passes, inspection
// ---------------------------------------------------------------------------

describe("tolerance tiers", () => {
  const std = q({ tolerance_tier: "STANDARD" });
  const prc = q({ tolerance_tier: "PRECISION" });
  const tgt = q({ tolerance_tier: "TIGHT" });

  test("tighter tolerance costs more", () => {
    expect(tgt.totals.total_due).toBeGreaterThan(prc.totals.total_due);
    expect(prc.totals.total_due).toBeGreaterThan(std.totals.total_due);
  });
  test("extra passes add cut length", () => {
    expect(tgt.lines[0].cut.l_extra_in).toBeGreaterThan(0);
  });
  test("rework probability rises with tolerance", () => {
    expect(tgt.lines[0].rework.p_rework).toBeGreaterThan(prc.lines[0].rework.p_rework);
    expect(prc.lines[0].rework.p_rework).toBeGreaterThan(std.lines[0].rework.p_rework);
  });
  test("high rework risk raises a flag", () => {
    expect(tgt.sanity.flags.some((f) => f.includes("REWORK_RISK"))).toBe(true);
  });
  test("TIGHT gated by span - hard max_dim_in gate", () => {
    expect(() => q({ length_in: 30.0, width_in: 20.0, tolerance_tier: "TIGHT" })).toThrow(/24/);
  });
});

// ---------------------------------------------------------------------------
// [5] Edge and face finish
// ---------------------------------------------------------------------------

describe("edge and face finish", () => {
  const base = q({ edge_finish: "DEBURRED", face_finish: "AS_SUPPLIED" });
  const cham = q({ edge_finish: "CHAMFERED" });
  const scr = q({ edge_finish: "SCRAPED" });
  const film = q({ face_finish: "FILM_APPLIED" });
  const clean = q({ face_finish: "CLEANROOM_PACK" });

  test("chamfer adds cost", () => {
    expect(cham.totals.total_due).toBeGreaterThan(base.totals.total_due);
  });
  test("scraped edge adds cost", () => {
    expect(scr.totals.total_due).toBeGreaterThan(base.totals.total_due);
  });
  test("film adds consumable cost", () => {
    expect(film.lines[0].consumables.c_finish_material).toBeGreaterThan(0);
  });
  test("cleanroom is the most expensive face option", () => {
    expect(clean.totals.total_due).toBeGreaterThan(film.totals.total_due);
    expect(film.totals.total_due).toBeGreaterThan(base.totals.total_due);
  });
  test("PEEK cleanroom uses IPA", () => {
    const peekClean = q({ material_code: "PEEK_NAT", face_finish: "CLEANROOM_PACK" });
    expect(peekClean.lines[0].labor.cleanroom_solvent).toBe("IPA_WIPE");
  });
  test("Ultem cleanroom switches to DI water (stress-crack safety interlock)", () => {
    const ultemClean = q({ material_code: "ULTEM_1000", thickness_in: 0.5, face_finish: "CLEANROOM_PACK" });
    expect(ultemClean.lines[0].labor.cleanroom_solvent).toBe("DI_WATER_LINT_FREE");
    expect(ultemClean.sanity.flags.some((f) => f.includes("SOLVENT_SUBSTITUTION"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// [6] Annealing
// ---------------------------------------------------------------------------

describe("annealing", () => {
  const plain = q({ tolerance_tier: "PRECISION" });
  const ann = q({ tolerance_tier: "PRECISION", anneal: true });

  test("annealing adds cost", () => {
    expect(ann.cost_breakdown.c_annealing).toBeGreaterThan(0);
  });
  test("annealing reduces rework probability", () => {
    expect(ann.lines[0].rework.p_rework).toBeLessThan(plain.lines[0].rework.p_rework);
  });
  test("annealing credit recorded", () => {
    expect(ann.lines[0].rework.anneal_credit_applied).toBe(true);
  });
  test("annealing pushes the ship date by one business day", () => {
    expect(ann.lead_time.promised_ship_date > plain.lead_time.promised_ship_date).toBe(true);
  });
  test("annealing suppresses the residual-stress flag", () => {
    expect(ann.sanity.flags.some((f) => f.includes("RESIDUAL_STRESS"))).toBe(false);
  });
  test("anneal blocked on same-day", () => {
    expect(() => q({ anneal: true, lead_tier: "SAMEDAY" })).toThrow(QuoteError);
  });
  test("anneal blocked on ineligible material", () => {
    expect(() => q({ material_code: "G10_FR4", thickness_in: 0.25, anneal: true })).toThrow(QuoteError);
  });
});

// ---------------------------------------------------------------------------
// [7] Lead tiers - rush costs twice, FLEX pays back
// ---------------------------------------------------------------------------

describe("lead tiers", () => {
  const TIERS = ["SAMEDAY", "RUSH24", "RUSH48", "STD", "FLEX"] as const;
  const rows = Object.fromEntries(TIERS.map((t) => [t, q({ lead_tier: t })]));

  test("price falls monotonically as lead time lengthens", () => {
    expect(rows.SAMEDAY.totals.total_due).toBeGreaterThan(rows.RUSH24.totals.total_due);
    expect(rows.RUSH24.totals.total_due).toBeGreaterThan(rows.RUSH48.totals.total_due);
    expect(rows.RUSH48.totals.total_due).toBeGreaterThan(rows.STD.totals.total_due);
    expect(rows.STD.totals.total_due).toBeGreaterThan(rows.FLEX.totals.total_due);
  });
  test("rush forfeits the nesting uplift", () => {
    expect(rows.RUSH24.nest_uplift).toBe(0.0);
  });
  test("FLEX yields the highest effective yield", () => {
    expect(rows.FLEX.lines[0].geometry.eta_eff).toBeGreaterThan(rows.STD.lines[0].geometry.eta_eff);
    expect(rows.STD.lines[0].geometry.eta_eff).toBeGreaterThan(rows.RUSH24.lines[0].geometry.eta_eff);
  });
  test("FLEX is cheaper than STD on the canonical part", () => {
    expect(rows.STD.totals.total_due).toBeGreaterThan(rows.FLEX.totals.total_due);
  });

  test("lead-tier monotonicity sweep: no price inversion anywhere in the catalogue", () => {
    const ORDER = ["SAMEDAY", "RUSH24", "RUSH48", "STD", "FLEX"] as const;
    const SIZES: [number, number][] = [
      [6, 6],
      [12, 12],
      [18, 10],
    ];
    const ZIPS = ["92020", "10001"];
    const inversions: unknown[] = [];

    for (const [mcode, mspec] of Object.entries(MAT.materials)) {
      for (const dims of SIZES) {
        const t = mspec.stock_thicknesses_in[Math.floor(mspec.stock_thicknesses_in.length / 2)];
        for (const zipc of ZIPS) {
          const totals: number[] = [];
          let skip = false;
          for (const tier of ORDER) {
            const total = safeTotal({
              lines: [{ material_code: mcode, length_in: dims[0], width_in: dims[1], thickness_in: t, qty: 1 }],
              lead_tier: tier,
              dest_zip: zipc,
              sourcing_mode: "MASTER_SHEET",
            });
            if (total === null) {
              skip = true;
              break;
            }
            totals.push(total);
          }
          if (skip) continue;
          for (let i = 0; i < totals.length - 1; i++) {
            if (totals[i + 1] > totals[i] + 1e-9) {
              inversions.push({ mcode, dims, zipc, totals });
              break;
            }
          }
        }
      }
    }
    expect(inversions).toEqual([]);
  });
});

describe("same-day availability", () => {
  // 2026-09-03 is a Thursday (business day); 2026-09-05/06 is a Sat/Sun.
  test("SAMEDAY is available, and ships that day, when ordered on a business day", () => {
    const r = q({ lead_tier: "SAMEDAY", order_date: "2026-09-03" });
    expect(r.lead_time.available).toBe(true);
    expect(r.lead_time.promised_ship_date).toBe("2026-09-03");
  });
  test("SAMEDAY is flagged unavailable when ordered on a day the shop is closed", () => {
    const r = q({ lead_tier: "SAMEDAY", order_date: "2026-09-05" });
    expect(r.lead_time.available).toBe(false);
  });
  test("an unavailable SAMEDAY collapses onto the same date as RUSH24, which is why it must be flagged", () => {
    const sameday = q({ lead_tier: "SAMEDAY", order_date: "2026-09-05" });
    const rush24 = q({ lead_tier: "RUSH24", order_date: "2026-09-05" });
    expect(sameday.lead_time.promised_ship_date).toBe(rush24.lead_time.promised_ship_date);
  });
  test("tiers other than SAMEDAY stay available regardless of what day the order lands on", () => {
    for (const tier of ["RUSH24", "RUSH48", "STD", "FLEX"] as const) {
      expect(q({ lead_tier: tier, order_date: "2026-09-05" }).lead_time.available).toBe(true);
      expect(q({ lead_tier: tier, order_date: "2026-09-06" }).lead_time.available).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// [8] Add-ons
// ---------------------------------------------------------------------------

describe("add-ons", () => {
  test("FAIR adds cost, forces a tolerance upgrade, and discloses it", () => {
    const plain = q();
    const fair = q({ add_ons: ["fair_as9102"], tolerance_tier: "STANDARD" });
    expect(fair.totals.total_due).toBeGreaterThan(plain.totals.total_due);
    expect(fair.lines[0].tolerance_tier).toBe("PRECISION");
    expect(fair.sanity.flags.some((f) => f.includes("AS9102"))).toBe(true);
  });
  test("per-part add-ons scale with qty", () => {
    const mark = q({ add_ons: ["part_marking", "individual_bagging"], qty: 10 });
    expect(mark.lines[0].consumables.c_addon_consumable).toBeGreaterThan(4.0);
  });
  test("order-scope add-ons hit compliance exactly once each", () => {
    const orderLevel = quote(
      {
        lines: [{ material_code: "PEEK_NAT", length_in: 12, width_in: 12, thickness_in: 0.5, qty: 1 }],
        order_add_ons: ["wet_signature_coc", "full_chain_traceability"],
        sourcing_mode: "MASTER_SHEET",
      },
      MAT
    );
    closeTo(orderLevel.cost_breakdown.c_compliance, 4.0 + 8.0 + 25.0 + 45.0, 1e-6);
  });
});

// ---------------------------------------------------------------------------
// [9] Lead time calendar
// ---------------------------------------------------------------------------

describe("lead time calendar", () => {
  test("STD from Friday skips the weekend", () => {
    expect(add_business_days("2026-09-04", 4, MAT)).toBe("2026-09-10");
  });
  test("Thanksgiving holiday is skipped", () => {
    expect(add_business_days("2026-11-25", 1, MAT)).toBe("2026-11-30");
  });

  // Ordered Thu 3 Sep, STD +4 business days lands on Wed 9 Sep, which already
  // IS the composite batch day. No slip should be reported.
  const g10Ok = quote(
    {
      lines: [{ material_code: "G10_FR4", length_in: 12, width_in: 12, thickness_in: 0.25, qty: 1 }],
      lead_tier: "STD",
      order_date: "2026-09-03",
      sourcing_mode: "MASTER_SHEET",
    },
    MAT
  );
  // Ordered Tue 8 Sep, STD +4 lands on Mon 14 Sep, which must slip to Wed 16 Sep.
  const g10Slip = quote(
    {
      lines: [{ material_code: "G10_FR4", length_in: 12, width_in: 12, thickness_in: 0.25, qty: 1 }],
      lead_tier: "STD",
      order_date: "2026-09-08",
      sourcing_mode: "MASTER_SHEET",
    },
    MAT
  );

  test("no slip reported when the date already lands on the batch day", () => {
    expect(g10Ok.lead_time.composite_note).toBeNull();
  });
  test("composite order ordered Tue 8 Sep 2026 slips to Wed 16 Sep 2026", () => {
    expect(g10Slip.lead_time.promised_ship_date).toBe("2026-09-16");
  });
  test("slip is disclosed to the customer", () => {
    expect(g10Slip.lead_time.composite_note).not.toBeNull();
  });
  test("both composite ship dates land on a Wednesday", () => {
    expect(weekdayOf(g10Ok.lead_time.promised_ship_date)).toBe(3); // Wednesday
    expect(weekdayOf(g10Slip.lead_time.promised_ship_date)).toBe(3);
  });
});

function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// ---------------------------------------------------------------------------
// [10] Competitive comparison
// ---------------------------------------------------------------------------

describe("competitive comparison surfaces below the fabricator minimum", () => {
  test("comparison shown below $250, hidden above", () => {
    const small = q({ material_code: "DELRIN_150", length_in: 6, width_in: 6, thickness_in: 0.25 });
    const big = q();
    expect(small.competitive_comparison).not.toBeNull();
    expect(big.competitive_comparison).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// [11] General invariants
// ---------------------------------------------------------------------------

describe("invariants: bigger, thicker, more, tighter, faster is never cheaper", () => {
  const b = q().totals.total_due;

  test("larger area costs more", () => {
    expect(q({ length_in: 18.0 }).totals.total_due).toBeGreaterThan(b);
  });
  test("thicker costs more", () => {
    expect(q({ thickness_in: 0.75 }).totals.total_due).toBeGreaterThan(b);
  });
  test("more qty costs more", () => {
    expect(q({ qty: 5 }).totals.total_due).toBeGreaterThan(b);
  });
  test("unit price falls with qty", () => {
    expect(q({ qty: 10 }).totals.total_due / 10).toBeLessThan(b);
  });
  test("determinism", () => {
    expect(q().totals.total_due).toBe(q().totals.total_due);
  });
});

describe("margin curve", () => {
  test("margin anchor at COGS 150 -> 55%", () => {
    expect(margin_for(150.0, MAT)).toBeCloseTo(0.55, 9);
  });
  test("margin anchor at COGS 1000 -> 35%", () => {
    expect(margin_for(1000.0, MAT)).toBeCloseTo(0.35, 9);
  });
  test("margin interpolates between anchors", () => {
    expect(margin_for(275.0, MAT)).toBeCloseTo(0.5, 9);
  });
  test("margin is continuous at every interior anchor", () => {
    const anchors = MAT.margin_curve.anchors.slice(1, -1);
    for (const a of anchors) {
      const left = margin_for(a.cogs - 0.01, MAT);
      const right = margin_for(a.cogs + 0.01, MAT);
      expect(Math.abs(left - right)).toBeLessThan(1e-3);
    }
  });
  test("margin decreases monotonically with COGS", () => {
    for (let x = 0; x < 8000; x += 25) {
      expect(margin_for(x, MAT)).toBeGreaterThanOrEqual(margin_for(x + 25, MAT) - 1e-12);
    }
  });
  test("price = COGS x (1+margin) rises monotonically with COGS everywhere", () => {
    let prev = 0 * (1 + margin_for(0, MAT));
    for (let i = 1; i < 40000; i++) {
      const c = i / 4;
      const price = c * (1 + margin_for(c, MAT));
      expect(price).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = price;
    }
  });
});

describe("validation rejections", () => {
  const cases: [string, Record<string, unknown>][] = [
    ["unknown material", { material_code: "UNOBTAINIUM" }],
    ["non-stock thickness", { thickness_in: 0.437 }],
    ["blank larger than sheet", { length_in: 46, width_in: 30 }],
    ["dimension below minimum", { length_in: 0.4 }],
    ["qty above cap", { qty: 999 }],
  ];
  for (const [label, kw] of cases) {
    test(`${label} is rejected`, () => {
      expect(() => q(kw)).toThrow(QuoteError);
    });
  }
  test("non-stock thickness message names the stocked sizes", () => {
    expect(() => q({ thickness_in: 0.437 })).toThrow(
      "0.437 in is not a stocked thickness for PEEK, natural (unfilled). Available: 0.125, 0.25, 0.375, 0.5, 0.75, 1, 1.5, 2 in."
    );
  });
});

describe("dimensional weight", () => {
  test("dim weight governs a 24x20x0.0625 PTFE panel to a remote zip", () => {
    const r = q({
      material_code: "PTFE_VIRGIN",
      length_in: 24,
      width_in: 20,
      thickness_in: 0.0625,
      dest_zip: "99999",
    });
    expect(r.freight.dim_weight_lb).toBeGreaterThan(r.freight.actual_weight_lb);
    expect(r.freight.rate_source).toBe("FALLBACK_LADDER");
  });
});
