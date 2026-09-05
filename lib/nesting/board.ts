import { group_queue, expand_to_parts, nest, type QueueRow } from "../pricing/nesting";
import { count_business_days, type PricingConfig } from "../pricing/engine";
import { listPendingCutLines } from "../orders/lines-store";
import { listOrders } from "../orders/store";

/**
 * The nest board's data - CLAUDE_CODE_BRIEF.md §10: "Shows pending-cut lines
 * grouped by (material, brand, thickness, tier) with, per group: parts
 * waiting, oldest order age against queue_max_age_business_days, projected
 * utilisation if cut now, and projected utilisation if you wait."
 *
 * "If you wait" can't know the future, so it's answered honestly: run the
 * real nester again on the queue duplicated (a stand-in for "another
 * similar batch arrives"), not a guessed number. Phase 2's own finding -
 * three orders beat one order's utilisation - is exactly the effect this
 * makes visible.
 */

type QueueRowWithOrder = QueueRow & { order_created_at: string; order_number: string };

export interface NestBoardGroup {
  group_key: Record<string, string | number>;
  order_numbers: string[];
  parts_waiting: number;
  oldest_order_age_business_days: number;
  queue_max_age_business_days: number;
  overdue: boolean;
  sheet_count_if_cut_now: number;
  utilisation_if_cut_now: number;
  recoverable_fraction_if_cut_now: number;
  utilisation_if_queue_doubles: number;
}

export async function buildNestBoard(cfg: PricingConfig, today: string): Promise<NestBoardGroup[]> {
  const [pendingLines, orders] = await Promise.all([listPendingCutLines(), listOrders()]);
  const ordersById = new Map(orders.map((o) => [o.id, o]));

  const queueRows: QueueRowWithOrder[] = [];
  for (const line of pendingLines) {
    const order = ordersById.get(line.order_id);
    if (!order || order.status === "cancelled") continue;
    queueRows.push({
      order_id: line.order_id,
      line_no: line.line_no,
      material_code: line.material_code,
      brand: line.brand,
      thickness_nominal: line.thickness_nominal,
      certification_tier: line.certification_tier,
      length_in: line.length_in,
      width_in: line.width_in,
      qty: line.qty,
      order_created_at: order.created_at,
      order_number: order.order_number,
    });
  }
  if (queueRows.length === 0) return [];

  const groups = group_queue(queueRows, cfg);
  const board: NestBoardGroup[] = [];

  for (const { key, rows: untypedRows } of groups) {
    const rows = untypedRows as QueueRowWithOrder[];
    const group_key: Record<string, string | number> = {};
    cfg.nesting.queue_group_key.forEach((field, i) => {
      group_key[field] = key[i];
    });

    const mat = cfg.materials[group_key.material_code as string];
    const parts = expand_to_parts(rows, cfg);
    const now = nest(parts, mat.sheet_length_in, mat.sheet_width_in, cfg);

    const doubledParts = expand_to_parts([...rows, ...rows], cfg);
    const doubled = nest(doubledParts, mat.sheet_length_in, mat.sheet_width_in, cfg);

    const oldestCreatedAt = rows.reduce((min, r) => (r.order_created_at < min ? r.order_created_at : min), rows[0].order_created_at);
    const ageBusinessDays = count_business_days(oldestCreatedAt.slice(0, 10), today, cfg);

    board.push({
      group_key,
      order_numbers: Array.from(new Set(rows.map((r) => r.order_number))).sort(),
      parts_waiting: parts.length,
      oldest_order_age_business_days: ageBusinessDays,
      queue_max_age_business_days: cfg.nesting.queue_max_age_business_days,
      overdue: ageBusinessDays >= cfg.nesting.queue_max_age_business_days,
      sheet_count_if_cut_now: now.summary.sheet_count,
      utilisation_if_cut_now: now.summary.utilisation,
      recoverable_fraction_if_cut_now: now.summary.recoverable_fraction,
      utilisation_if_queue_doubles: doubled.summary.utilisation,
    });
  }

  board.sort((a, b) => Number(b.overdue) - Number(a.overdue) || b.oldest_order_age_business_days - a.oldest_order_age_business_days);
  return board;
}
