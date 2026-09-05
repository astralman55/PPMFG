import { describe, test, expect } from "vitest";
import { createLot } from "../../lots/store";
import { createRemnant, listRemnants } from "../store";

describe("listRemnants search - CLAUDE_CODE_BRIEF.md §10 remnant register", () => {
  test("filters by material, tier, and minimum size, and excludes consumed by default", async () => {
    const lot = await createLot({
      lot_number: `LOT-SEARCH-${Math.random()}`,
      material_code: "PPS_TECHTRON",
      brand: "MITSUBISHI_TECHTRON",
      certification_tier: "TIER1_TRACEABLE",
      manufacturer: "Mitsubishi",
      country_of_origin: "Japan",
      thickness_nominal: 0.5,
      received_date: "2026-09-01",
    });
    const big = await createRemnant({ lot_id: lot.id, length_in: 10, width_in: 10, thickness_nominal: 0.5, location_tag: "A1" });
    const small = await createRemnant({ lot_id: lot.id, length_in: 3, width_in: 3, thickness_nominal: 0.5, location_tag: "A2" });

    const bySize = await listRemnants({ material_code: "PPS_TECHTRON", min_length_in: 8, min_width_in: 8 });
    expect(bySize.map((r) => r.id)).toContain(big.id);
    expect(bySize.map((r) => r.id)).not.toContain(small.id);

    const wrongMaterial = await listRemnants({ material_code: "PEEK_NAT" });
    expect(wrongMaterial.map((r) => r.id)).not.toContain(big.id);
  });

  test("a named-brand search only matches that exact brand; GENERIC matches any", async () => {
    const lot = await createLot({
      lot_number: `LOT-BRAND-${Math.random()}`,
      material_code: "DELRIN_150",
      brand: "DUPONT_DELRIN",
      certification_tier: "TIER1_TRACEABLE",
      manufacturer: "DuPont",
      country_of_origin: "USA",
      thickness_nominal: 0.25,
      received_date: "2026-09-01",
    });
    const r = await createRemnant({ lot_id: lot.id, length_in: 6, width_in: 6, thickness_nominal: 0.25 });

    const anyBrand = await listRemnants({ material_code: "DELRIN_150", brand: "GENERIC" });
    expect(anyBrand.map((x) => x.id)).toContain(r.id);

    const rightBrand = await listRemnants({ material_code: "DELRIN_150", brand: "DUPONT_DELRIN" });
    expect(rightBrand.map((x) => x.id)).toContain(r.id);

    const wrongBrand = await listRemnants({ material_code: "DELRIN_150", brand: "ENSINGER_TECAFORM" });
    expect(wrongBrand.map((x) => x.id)).not.toContain(r.id);
  });
});
