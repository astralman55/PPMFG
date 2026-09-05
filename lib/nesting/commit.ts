import { expand_to_parts, nest, build_cut_sequence, type QueueRow, type CutStep, type Sheet } from "../pricing/nesting";
import type { PricingConfig } from "../pricing/engine";
import { listPendingCutLines, markLinesNested } from "../orders/lines-store";
import { listOrders, setOrderInProduction } from "../orders/store";
import { getLot } from "../lots/store";
import { createNestRun, type NestRunRow } from "../nest-runs/store";
import { createRemnants, type NewRemnantRow, type RemnantRow } from "../remnants/store";

/**
 * Commits a nest run for one group - CLAUDE_CODE_BRIEF.md §10: "One button
 * runs the nester and prints the rip-then-crosscut sequence. Committing a
 * run writes a nest_runs row and pre-populates the remnant register from the
 * plan's keepable drops." The group's queue rows are re-derived here from
 * the database rather than trusted from the client, the same "never trust a
 * client-supplied computed value" rule the pricing engine follows -
 * otherwise a stale or tampered request could commit a plan that no longer
 * matches what's actually pending.
 */
export class NestCommitError extends Error {}

export interface CommitNestRunInput {
  material_code: string;
  brand: string;
  certification_tier: string;
  thickness_nominal: number;
  lot_id: string;
}

export interface CommitNestRunResult {
  nestRun: NestRunRow;
  remnants: RemnantRow[];
  cutSequence: CutStep[];
  sheets: Sheet[];
}

export async function commitNestRun(input: CommitNestRunInput, cfg: PricingConfig): Promise<CommitNestRunResult> {
  const lot = await getLot(input.lot_id);
  if (!lot) throw new NestCommitError("That lot does not exist.");
  if (
    lot.material_code !== input.material_code ||
    lot.certification_tier !== input.certification_tier ||
    lot.thickness_nominal !== input.thickness_nominal
  ) {
    throw new NestCommitError("That lot's material, tier or thickness doesn't match this nest group.");
  }
  if (input.brand !== "GENERIC" && lot.brand !== input.brand) {
    throw new NestCommitError(`This group is brand-locked to ${input.brand}; that lot is ${lot.brand}.`);
  }

  const [pendingLines, orders] = await Promise.all([listPendingCutLines(), listOrders()]);
  const ordersById = new Map(orders.map((o) => [o.id, o]));

  const matchingLineIds: string[] = [];
  const matchingRows: QueueRow[] = [];
  for (const line of pendingLines) {
    if (line.material_code !== input.material_code) continue;
    if (line.brand !== input.brand) continue;
    if (line.certification_tier !== input.certification_tier) continue;
    if (line.thickness_nominal !== input.thickness_nominal) continue;
    const order = ordersById.get(line.order_id);
    if (!order || order.status === "cancelled") continue;
    matchingLineIds.push(line.id);
    matchingRows.push({
      order_id: line.order_id,
      line_no: line.line_no,
      material_code: line.material_code,
      brand: line.brand,
      thickness_nominal: line.thickness_nominal,
      certification_tier: line.certification_tier,
      length_in: line.length_in,
      width_in: line.width_in,
      qty: line.qty,
    });
  }
  if (matchingRows.length === 0) {
    throw new NestCommitError("Nothing is currently pending for that group - it may have already been committed by someone else.");
  }

  const mat = cfg.materials[input.material_code];
  const parts = expand_to_parts(matchingRows, cfg);
  const result = nest(parts, mat.sheet_length_in, mat.sheet_width_in, cfg);
  const cutSequence = build_cut_sequence(result.sheets);

  const nestRun = await createNestRun({
    group_key: {
      material_code: input.material_code,
      brand: input.brand,
      thickness_nominal: input.thickness_nominal,
      certification_tier: input.certification_tier,
    },
    plan_json: { sheets: result.sheets, cut_sequence: cutSequence, summary: result.summary },
    sheet_count: result.summary.sheet_count,
    utilisation: result.summary.utilisation,
    recoverable_fraction: result.summary.recoverable_fraction,
    executed_at: new Date().toISOString(),
  });

  const remnantRows: NewRemnantRow[] = [];
  for (const sheet of result.sheets) {
    const ordersOnSheet = new Set(sheet.placements.map((p) => p.order_id));
    const singleOrderId = ordersOnSheet.size === 1 ? [...ordersOnSheet][0] : null;
    for (const rem of sheet.remnants) {
      if (!rem.keepable) continue;
      remnantRows.push({
        lot_id: lot.id,
        parent_order_id: singleOrderId,
        nest_run_id: nestRun.id,
        length_in: rem.length_in,
        width_in: rem.width_in,
        thickness_nominal: input.thickness_nominal,
        location_tag: null,
      });
    }
  }
  const remnants = await createRemnants(remnantRows);

  // Claims these exact lines so they drop off the nest board's pending
  // queue - without this, the same material could be nested and its
  // remnants logged twice. Per-line measured thickness/cutter/inspector are
  // still recorded afterward through the ordinary fulfilment flow.
  await markLinesNested(matchingLineIds, nestRun.id);

  const involvedOrderIds = new Set(matchingRows.map((r) => r.order_id));
  for (const orderId of involvedOrderIds) {
    const order = ordersById.get(orderId);
    if (order?.status === "paid") {
      await setOrderInProduction(orderId);
    }
  }

  return { nestRun, remnants, cutSequence, sheets: result.sheets };
}
