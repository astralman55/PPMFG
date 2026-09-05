import { NextResponse } from "next/server";
import cfgJson from "@/lib/pricing/config.json";
import type { PricingConfig } from "@/lib/pricing/engine";
import { listOrders, getCustomer } from "@/lib/orders/store";
import { listOrderLinesForOrders } from "@/lib/orders/lines-store";
import { buildCapacityQueue, type CapacityLineInput } from "@/lib/capacity/model";

const CFG = cfgJson as unknown as PricingConfig;

/** Orders in these statuses need no more staffing time - see CLAUDE_CODE_BRIEF.md §21.1. */
const CLOSED_STATUSES = new Set(["shipped", "cancelled"]);

function todayIso(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * CLAUDE_CODE_BRIEF.md §21 (Phase 13) - read-only. Assembles the real
 * unfulfilled queue and recomputes each line's labor minutes fresh against
 * current config.json (never a frozen quote snapshot). The actual day-by-day
 * walk (runCapacityWalk) happens client-side against this raw data, so the
 * "available minutes per day" control and the hypothetical-order test both
 * recalculate instantly with no further server round-trip.
 */
export async function GET(): Promise<Response> {
  const allOrders = await listOrders();
  const openOrders = allOrders.filter((o) => !CLOSED_STATUSES.has(o.status) && o.promised_ship_date);

  const orderIds = openOrders.map((o) => o.id);
  const allLines = await listOrderLinesForOrders(orderIds);

  const customerLabels = await Promise.all(
    openOrders.map(async (o) => {
      const customer = await getCustomer(o.customer_id);
      const label = customer ? customer.company || customer.email : "Unknown customer";
      return [o.id, label] as const;
    })
  );
  const customerLabelByOrderId = new Map(customerLabels);
  const ordersById = new Map(openOrders.map((o) => [o.id, o]));

  const rows: CapacityLineInput[] = [];
  for (const line of allLines) {
    const order = ordersById.get(line.order_id);
    if (!order || !order.promised_ship_date) continue;
    // Already cut - no more saw time remains for this line, even though its
    // order hasn't shipped yet (paperwork/shipping doesn't consume the
    // labor-minutes budget this dashboard is planning).
    if (line.cut_at) continue;

    rows.push({
      order_id: line.order_id,
      order_number: order.order_number,
      customer_label: customerLabelByOrderId.get(line.order_id) ?? "Unknown customer",
      line_no: line.line_no,
      promised_ship_date: order.promised_ship_date,
      material_code: line.material_code,
      brand: line.brand,
      thickness_nominal: line.thickness_nominal,
      certification_tier: line.certification_tier,
      length_in: line.length_in,
      width_in: line.width_in,
      qty: line.qty,
      tolerance_tier: line.tolerance_tier,
      edge_finish: line.edge_finish,
      face_finish: line.face_finish,
      annealed: line.annealed,
      add_ons: line.add_ons,
    });
  }

  const { lines, failures } = buildCapacityQueue(rows, CFG);

  return NextResponse.json({
    today: todayIso(),
    open_order_count: openOrders.length,
    default_available_minutes_per_day: 450,
    lines,
    failures,
  });
}
