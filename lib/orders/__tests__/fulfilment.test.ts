import { describe, test, expect } from "vitest";
import { upsertCustomer, createOrder } from "../store";
import { createOrderLines, type NewOrderLineRow } from "../lines-store";
import { createLot, updateLotDocuments } from "../../lots/store";
import { assertOrderReadyToCertify, FulfilmentError } from "../fulfilment";

async function makeOrderWithOneLine() {
  const customer = await upsertCustomer({ email: `buyer-${Math.random()}@example.com` });
  const order = await createOrder({
    order_number: `ORD-TEST-${Math.random().toString(36).slice(2, 8)}`,
    quote_id: null,
    customer_id: customer.id,
    stripe_session_id: `cs_test_${Math.random().toString(36).slice(2, 8)}`,
    stripe_payment_intent: null,
    customer_po: null,
    ship_address: null,
    amount_paid_cents: 100000,
    tax_cents: 0,
    promised_ship_date: "2026-09-10",
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
    length_in: 12,
    width_in: 12,
    thickness_nominal: 0.5,
    qty: 1,
  };
  await createOrderLines([line]);
  return order;
}

describe("assertOrderReadyToCertify - CLAUDE_CODE_BRIEF.md §9 hard block", () => {
  test("throws when the line has no lot assigned", async () => {
    const order = await makeOrderWithOneLine();
    await expect(assertOrderReadyToCertify(order.id)).rejects.toThrow(FulfilmentError);
    await expect(assertOrderReadyToCertify(order.id)).rejects.toThrow(/no lot assigned/);
  });

  test("throws when the assigned lot has no MTR, even though a lot IS assigned", async () => {
    const order = await makeOrderWithOneLine();
    const lot = await createLot({
      lot_number: `LOT-NOMTR-${Math.random()}`,
      material_code: "PEEK_NAT",
      brand: "ENSINGER_TECAPEEK",
      certification_tier: "TIER1_TRACEABLE",
      manufacturer: "Ensinger",
      country_of_origin: "Germany",
      thickness_nominal: 0.5,
      received_date: "2026-09-01",
    });

    const { assignLotToLine, getOrderLines } = await import("../lines-store");
    const [line] = await getOrderLines(order.id);
    await assignLotToLine(line.id, { lot_id: lot.id, thickness_actual: 0.52, cut_by: "A", inspected_by: "B" });

    await expect(assertOrderReadyToCertify(order.id)).rejects.toThrow(/no Material Test Report/);
  });

  test("passes once the lot is assigned and has an MTR on file", async () => {
    const order = await makeOrderWithOneLine();
    const lot = await createLot({
      lot_number: `LOT-OK-${Math.random()}`,
      material_code: "PEEK_NAT",
      brand: "ENSINGER_TECAPEEK",
      certification_tier: "TIER1_TRACEABLE",
      manufacturer: "Ensinger",
      country_of_origin: "Germany",
      thickness_nominal: 0.5,
      received_date: "2026-09-01",
    });
    await updateLotDocuments(lot.id, { mtr_path: `${lot.id}/mtr.pdf`, mtr_uploaded_at: new Date().toISOString() });

    const { assignLotToLine, getOrderLines } = await import("../lines-store");
    const [line] = await getOrderLines(order.id);
    await assignLotToLine(line.id, { lot_id: lot.id, thickness_actual: 0.52, cut_by: "A", inspected_by: "B" });

    const result = await assertOrderReadyToCertify(order.id);
    expect(result.lines).toHaveLength(1);
    expect(result.lots.get(lot.id)?.lot_number).toBe(lot.lot_number);
  });

  test("throws on an order with no lines at all", async () => {
    const customer = await upsertCustomer({ email: `buyer-${Math.random()}@example.com` });
    const order = await createOrder({
      order_number: `ORD-EMPTY-${Math.random().toString(36).slice(2, 8)}`,
      quote_id: null,
      customer_id: customer.id,
      stripe_session_id: `cs_test_empty_${Math.random().toString(36).slice(2, 8)}`,
      stripe_payment_intent: null,
      customer_po: null,
      ship_address: null,
      amount_paid_cents: 0,
      tax_cents: 0,
      promised_ship_date: null,
    });
    await expect(assertOrderReadyToCertify(order.id)).rejects.toThrow(/no lines/);
  });
});
