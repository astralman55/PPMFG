import { describe, test, expect } from "vitest";
import { upsertCustomer, createOrder, markOrderShipped } from "@/lib/orders/store";
import { createOrderLines, assignLotToLine, type NewOrderLineRow } from "@/lib/orders/lines-store";
import { GET as capacityGet } from "../capacity/route";

/**
 * Integration proof of CLAUDE_CODE_BRIEF.md §21.1: the capacity queue
 * auto-populates from real orders/order_lines - no manual entry - and
 * correctly excludes what shouldn't count toward remaining staffing time.
 */

async function makeOrder(suffix: string, opts: { status?: "shipped"; promised_ship_date: string }) {
  const customer = await upsertCustomer({ email: `capacity-${suffix}-${Math.random()}@example.com` });
  const order = await createOrder({
    order_number: `ORD-CAP-${suffix}-${Math.random().toString(36).slice(2, 8)}`,
    quote_id: null,
    customer_id: customer.id,
    stripe_session_id: `cs_cap_${suffix}_${Math.random().toString(36).slice(2, 8)}`,
    stripe_payment_intent: null,
    customer_po: null,
    ship_address: null,
    amount_paid_cents: 50000,
    tax_cents: 0,
    promised_ship_date: opts.promised_ship_date,
  });
  if (opts.status === "shipped") {
    await markOrderShipped(order.id, { tracking_number: "1Z999", carrier: "UPS" });
  }
  return order;
}

function baseLine(orderId: string, overrides: Partial<NewOrderLineRow> = {}): NewOrderLineRow {
  return {
    order_id: orderId,
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
    ...overrides,
  };
}

describe("GET /api/ops/capacity", () => {
  test("an open order's uncut line appears in the queue with real, non-zero minutes", async () => {
    const order = await makeOrder("open", { promised_ship_date: "2026-09-20" });
    await createOrderLines([baseLine(order.id)]);

    const res = await capacityGet();
    expect(res.status).toBe(200);
    const body = await res.json();

    const found = body.lines.find((l: { order_number: string }) => l.order_number === order.order_number);
    expect(found).toBeTruthy();
    expect(found.minutes).toBeGreaterThan(0);
    expect(found.promised_ship_date).toBe("2026-09-20");
  });

  test("a shipped order is excluded entirely", async () => {
    const order = await makeOrder("shipped", { status: "shipped", promised_ship_date: "2026-09-05" });
    await createOrderLines([baseLine(order.id)]);

    const res = await capacityGet();
    const body = await res.json();
    expect(body.lines.some((l: { order_number: string }) => l.order_number === order.order_number)).toBe(false);
  });

  test("a line that has already been cut is excluded - it needs no more saw time even though its order hasn't shipped", async () => {
    const order = await makeOrder("cut", { promised_ship_date: "2026-09-20" });
    const [line] = await createOrderLines([baseLine(order.id)]);
    await assignLotToLine(line.id, { lot_id: "fake-lot-id", thickness_actual: 0.5, cut_by: "Andy", inspected_by: "Andy" });

    const res = await capacityGet();
    const body = await res.json();
    expect(body.lines.some((l: { order_number: string }) => l.order_number === order.order_number)).toBe(false);
  });

  test("a line whose material no longer validates against current config is reported as a failure, not a crash", async () => {
    const order = await makeOrder("bad", { promised_ship_date: "2026-09-20" });
    await createOrderLines([baseLine(order.id, { material_code: "DOES_NOT_EXIST" })]);

    const res = await capacityGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.failures.some((f: { order_number: string }) => f.order_number === order.order_number)).toBe(true);
  });

  test("two lines sharing material/brand/thickness/tier get the same group_key", async () => {
    const order = await makeOrder("group", { promised_ship_date: "2026-09-20" });
    await createOrderLines([baseLine(order.id, { line_no: 1 }), baseLine(order.id, { line_no: 2, length_in: 8, width_in: 8 })]);

    const res = await capacityGet();
    const body = await res.json();
    const lines = body.lines.filter((l: { order_number: string }) => l.order_number === order.order_number);
    expect(lines).toHaveLength(2);
    expect(lines[0].group_key).toBe(lines[1].group_key);
  });
});
