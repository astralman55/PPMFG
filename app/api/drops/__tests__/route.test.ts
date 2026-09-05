import { describe, test, expect } from "vitest";
import { createLot } from "@/lib/lots/store";
import { createRemnant } from "@/lib/remnants/store";
import { GET as dropsGet } from "../route";

async function get(query: string): Promise<{ drops: unknown[] }> {
  const res = await dropsGet(new Request(`http://localhost/api/drops${query}`));
  expect(res.status).toBe(200);
  return res.json();
}

describe("GET /api/drops - public listing", () => {
  test("lists a logged remnant in a public-safe shape (no internal location_tag)", async () => {
    const lot = await createLot({
      lot_number: `LOT-DROP-${Math.random()}`,
      material_code: "PEEK_NAT",
      brand: "ENSINGER_TECAPEEK",
      certification_tier: "TIER1_TRACEABLE",
      manufacturer: "Ensinger",
      country_of_origin: "Germany",
      thickness_nominal: 0.5,
      received_date: "2026-09-01",
    });
    const remnant = await createRemnant({ lot_id: lot.id, length_in: 8, width_in: 8, thickness_nominal: 0.5, location_tag: "RACK-A1-SECRET" });

    const { drops } = await get("");
    const found = drops.find((d) => (d as { id: string }).id === remnant.id) as Record<string, unknown>;
    expect(found).toBeTruthy();
    expect(found.material_code).toBe("PEEK_NAT");
    expect(found.brand).toBe("ENSINGER_TECAPEEK");
    expect(found.lot_number).toBe(lot.lot_number);
    expect(found).not.toHaveProperty("location_tag");
    expect(JSON.stringify(found)).not.toContain("RACK-A1-SECRET");
  });

  test("filters by material, tier and minimum size the same way the ops register does", async () => {
    const lot = await createLot({
      lot_number: `LOT-DROP2-${Math.random()}`,
      material_code: "DELRIN_150",
      brand: "DUPONT_DELRIN",
      certification_tier: "TIER1_TRACEABLE",
      manufacturer: "DuPont",
      country_of_origin: "USA",
      thickness_nominal: 0.25,
      received_date: "2026-09-01",
    });
    const big = await createRemnant({ lot_id: lot.id, length_in: 20, width_in: 20, thickness_nominal: 0.25 });
    const small = await createRemnant({ lot_id: lot.id, length_in: 4, width_in: 4, thickness_nominal: 0.25 });

    const { drops } = await get("?material_code=DELRIN_150&min_length_in=12&min_width_in=12");
    const ids = drops.map((d) => (d as { id: string }).id);
    expect(ids).toContain(big.id);
    expect(ids).not.toContain(small.id);

    const wrongMaterial = await get("?material_code=PPS_TECHTRON");
    expect(wrongMaterial.drops.map((d) => (d as { id: string }).id)).not.toContain(big.id);
  });

  test("returns an empty list rather than an error when nothing matches", async () => {
    const { drops } = await get("?material_code=TORLON_4203&min_length_in=999");
    expect(drops).toEqual([]);
  });
});
