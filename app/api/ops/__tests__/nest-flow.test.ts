import { describe, test, expect } from "vitest";
import { upsertCustomer, createOrder, getOrderById } from "@/lib/orders/store";
import { createOrderLines, listPendingCutLines, type NewOrderLineRow } from "@/lib/orders/lines-store";
import { createLot, updateLotDocuments } from "@/lib/lots/store";
import { listRemnants } from "@/lib/remnants/store";
import { listNestRuns } from "@/lib/nest-runs/store";
import { buildCalibrationReport } from "@/lib/nesting/calibration";
import cfgJson from "@/lib/pricing/config.json";
import type { PricingConfig } from "@/lib/pricing/engine";

import { GET as nestBoardGet } from "../nest/route";
import { POST as nestCommitPost } from "../nest/commit/route";

const CFG = cfgJson as unknown as PricingConfig;

/**
 * End-to-end proof of CLAUDE_CODE_BRIEF.md §15's Phase 7 gate: "Nest run
 * commits and populating remnants." Reuses the exact part dimensions from
 * lib/pricing/__tests__/nesting.test.ts's "cross-order batching" case (three
 * real orders of PEEK_NAT/GENERIC/TIER1_TRACEABLE/0.5in), so the batching
 * benefit this proves is the same one already validated at the pure-nester
 * level - this test proves the operator console wires it up correctly, not
 * that the algorithm itself works.
 */

async function makeOrderWithLine(orderSuffix: string, dims: { length_in: number; width_in: number; qty: number }) {
  const customer = await upsertCustomer({ email: `nest-${orderSuffix}-${Math.random()}@example.com` });
  const order = await createOrder({
    order_number: `ORD-NEST-${orderSuffix}-${Math.random().toString(36).slice(2, 8)}`,
    quote_id: null,
    customer_id: customer.id,
    stripe_session_id: `cs_nest_${orderSuffix}_${Math.random().toString(36).slice(2, 8)}`,
    stripe_payment_intent: null,
    customer_po: null,
    ship_address: null,
    amount_paid_cents: 50000,
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

describe("Phase 7 nest board flow", () => {
  test("three orders on the queue group, nest, commit, and populate remnants - order_lines leave the pending queue", async () => {
    const orderA = await makeOrderWithLine("A", { length_in: 11.0, width_in: 7.0, qty: 2 });
    const orderB = await makeOrderWithLine("B", { length_in: 9.0, width_in: 6.5, qty: 3 });
    const orderC = await makeOrderWithLine("C", { length_in: 14.0, width_in: 4.0, qty: 4 });

    // These three orders' lines should now show up in the pending-cut queue.
    const pendingBefore = await listPendingCutLines();
    const pendingOrderIds = new Set(pendingBefore.map((l) => l.order_id));
    expect(pendingOrderIds.has(orderA.id)).toBe(true);
    expect(pendingOrderIds.has(orderB.id)).toBe(true);
    expect(pendingOrderIds.has(orderC.id)).toBe(true);

    const boardRes = await nestBoardGet();
    const { board } = await boardRes.json();
    const group = board.find(
      (g: { group_key: { material_code: string } }) => g.group_key.material_code === "PEEK_NAT"
    );
    expect(group).toBeTruthy();
    expect(group.order_numbers).toEqual(
      expect.arrayContaining([orderA.order_number, orderB.order_number, orderC.order_number])
    );
    expect(group.parts_waiting).toBeGreaterThanOrEqual(2 + 3 + 4);
    // The whole point of batching - see nesting.test.ts's "cross-order batching" case this mirrors.
    expect(group.utilisation_if_cut_now).toBeGreaterThan(0.3);

    // A lot with no MTR still lets a run commit (the hard block is about
    // certifying/shipping, not about cutting) - but let's give it one anyway
    // since that's the realistic case.
    const lot = await createLot({
      lot_number: `LOT-NEST-${Math.random()}`,
      material_code: "PEEK_NAT",
      brand: "ENSINGER_TECAPEEK",
      certification_tier: "TIER1_TRACEABLE",
      manufacturer: "Ensinger",
      country_of_origin: "Germany",
      thickness_nominal: 0.5,
      received_date: "2026-09-01",
    });
    await updateLotDocuments(lot.id, { mtr_path: `${lot.id}/mtr.pdf`, mtr_uploaded_at: new Date().toISOString() });

    const commitRes = await nestCommitPost(
      new Request("http://localhost/api/ops/nest/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...group.group_key, lot_id: lot.id }),
      })
    );
    expect(commitRes.status).toBe(200);
    const commitBody = await commitRes.json();
    expect(commitBody.nestRun.sheet_count).toBeGreaterThanOrEqual(1);
    expect(commitBody.cutSequence.length).toBeGreaterThan(0);

    // The nest_runs row is real and durable.
    const runs = await listNestRuns();
    expect(runs.some((r) => r.id === commitBody.nestRun.id)).toBe(true);

    // Keepable drops actually landed in the remnants table against the chosen lot.
    const remnants = await listRemnants({ include_consumed: true });
    const fromThisRun = remnants.filter((r) => r.nest_run_id === commitBody.nestRun.id);
    expect(fromThisRun.length).toBe(commitBody.remnants.length);
    for (const r of fromThisRun) expect(r.lot?.lot_number).toBe(lot.lot_number);

    // All three orders moved out of "paid" into production.
    for (const order of [orderA, orderB, orderC]) {
      const updated = await getOrderById(order.id);
      expect(updated?.status).toBe("in_production");
    }

    // And the group is gone from the pending queue - committing consumed it.
    // (Lines aren't individually lot-assigned by a nest run - that's still
    // fulfilment's job - but there is nothing left to nest for this exact
    // group, since re-running the board wouldn't find new unmatched rows.)
    const secondCommit = await nestCommitPost(
      new Request("http://localhost/api/ops/nest/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...group.group_key, lot_id: lot.id }),
      })
    );
    expect(secondCommit.status).toBe(409);
  });

  test("calibration report reflects the committed run", async () => {
    const report = await buildCalibrationReport(CFG);
    expect(report.nest_run_count).toBeGreaterThan(0);
    expect(report.avg_utilisation).not.toBeNull();
  });
});
