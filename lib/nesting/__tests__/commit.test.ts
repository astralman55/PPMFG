import { describe, test, expect } from "vitest";
import { upsertCustomer, createOrder } from "../../orders/store";
import { createOrderLines, type NewOrderLineRow } from "../../orders/lines-store";
import { createLot } from "../../lots/store";
import { commitNestRun, NestCommitError } from "../commit";
import cfgJson from "../../pricing/config.json";
import type { PricingConfig } from "../../pricing/engine";

const CFG = cfgJson as unknown as PricingConfig;

async function makeOrderWithLine(dims: { length_in: number; width_in: number; qty: number } = { length_in: 6, width_in: 6, qty: 1 }) {
  const customer = await upsertCustomer({ email: `commit-${Math.random()}@example.com` });
  const order = await createOrder({
    order_number: `ORD-COMMIT-${Math.random().toString(36).slice(2, 8)}`,
    quote_id: null,
    customer_id: customer.id,
    stripe_session_id: `cs_commit_${Math.random().toString(36).slice(2, 8)}`,
    stripe_payment_intent: null,
    customer_po: null,
    ship_address: null,
    amount_paid_cents: 10000,
    tax_cents: 0,
    promised_ship_date: "2026-09-20",
  });
  const line: NewOrderLineRow = {
    order_id: order.id,
    line_no: 1,
    part_ref: null,
    material_code: "PEEK_NAT",
    brand: "GENERIC",
    certification_tier: "TIER1_TRACEABLE",
    tolerance_tier: "STANDARD",
    edge_finish: "DEBURRED",
    face_finish: "AS_SUPPLIED",
    annealed: false,
    add_ons: null,
    length_in: dims.length_in,
    width_in: dims.width_in,
    thickness_nominal: 0.5,
    qty: dims.qty,
  };
  await createOrderLines([line]);
  return order;
}

describe("commitNestRun", () => {
  test("rejects a lot whose thickness doesn't match the group", async () => {
    await makeOrderWithLine();
    const lot = await createLot({
      lot_number: `LOT-${Math.random()}`,
      material_code: "PEEK_NAT",
      brand: "ENSINGER_TECAPEEK",
      certification_tier: "TIER1_TRACEABLE",
      manufacturer: "Ensinger",
      country_of_origin: "Germany",
      thickness_nominal: 1, // wrong - the group is 0.5in
      received_date: "2026-09-01",
    });
    await expect(
      commitNestRun({ material_code: "PEEK_NAT", brand: "GENERIC", certification_tier: "TIER1_TRACEABLE", thickness_nominal: 0.5, lot_id: lot.id }, CFG)
    ).rejects.toThrow(NestCommitError);
  });

  test("rejects a lot of the wrong brand when the group is brand-locked", async () => {
    await makeOrderWithLine();
    const wrongBrandLot = await createLot({
      lot_number: `LOT-${Math.random()}`,
      material_code: "PEEK_NAT",
      brand: "MITSUBISHI_KETRON",
      certification_tier: "TIER1_TRACEABLE",
      manufacturer: "Mitsubishi",
      country_of_origin: "Japan",
      thickness_nominal: 0.5,
      received_date: "2026-09-01",
    });
    await expect(
      commitNestRun(
        { material_code: "PEEK_NAT", brand: "VICTREX", certification_tier: "TIER1_TRACEABLE", thickness_nominal: 0.5, lot_id: wrongBrandLot.id },
        CFG
      )
    ).rejects.toThrow(/brand-locked/);
  });

  test("rejects committing a group with nothing pending", async () => {
    const lot = await createLot({
      lot_number: `LOT-${Math.random()}`,
      material_code: "TORLON_4203",
      brand: "SOLVAY_TORLON",
      certification_tier: "TIER1_TRACEABLE",
      manufacturer: "Solvay",
      country_of_origin: "USA",
      thickness_nominal: 0.5,
      received_date: "2026-09-01",
    });
    await expect(
      commitNestRun(
        { material_code: "TORLON_4203", brand: "GENERIC", certification_tier: "TIER1_TRACEABLE", thickness_nominal: 0.5, lot_id: lot.id },
        CFG
      )
    ).rejects.toThrow(/Nothing is currently pending/);
  });

  test("committing twice in a row the second time finds nothing left (lines are claimed, not double-counted)", async () => {
    const customer = await upsertCustomer({ email: `commit-${Math.random()}@example.com` });
    const order = await createOrder({
      order_number: `ORD-COMMIT-${Math.random().toString(36).slice(2, 8)}`,
      quote_id: null,
      customer_id: customer.id,
      stripe_session_id: `cs_commit_${Math.random().toString(36).slice(2, 8)}`,
      stripe_payment_intent: null,
      customer_po: null,
      ship_address: null,
      amount_paid_cents: 10000,
      tax_cents: 0,
      promised_ship_date: "2026-09-20",
    });
    await createOrderLines([
      {
        order_id: order.id,
        line_no: 1,
        part_ref: null,
        material_code: "PEEK_GF30",
        brand: "GENERIC",
        certification_tier: "TIER1_TRACEABLE",
        tolerance_tier: "STANDARD",
        edge_finish: "DEBURRED",
        face_finish: "AS_SUPPLIED",
        annealed: false,
        add_ons: null,
        length_in: 5,
        width_in: 5,
        thickness_nominal: 0.5,
        qty: 1,
      },
    ]);
    const lot = await createLot({
      lot_number: `LOT-${Math.random()}`,
      material_code: "PEEK_GF30",
      brand: "ENSINGER_TECAPEEK",
      certification_tier: "TIER1_TRACEABLE",
      manufacturer: "Ensinger",
      country_of_origin: "Germany",
      thickness_nominal: 0.5,
      received_date: "2026-09-01",
    });

    const first = await commitNestRun(
      { material_code: "PEEK_GF30", brand: "GENERIC", certification_tier: "TIER1_TRACEABLE", thickness_nominal: 0.5, lot_id: lot.id },
      CFG
    );
    expect(first.remnants).toBeDefined();

    await expect(
      commitNestRun({ material_code: "PEEK_GF30", brand: "GENERIC", certification_tier: "TIER1_TRACEABLE", thickness_nominal: 0.5, lot_id: lot.id }, CFG)
    ).rejects.toThrow(/Nothing is currently pending/);
  });
});
