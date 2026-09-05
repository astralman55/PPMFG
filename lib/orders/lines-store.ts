import { randomUUID } from "crypto";
import { getSupabaseAdmin, supabaseConfigured } from "../supabase/admin";
import type { QuoteResult } from "../pricing/engine";

/**
 * Persistence for the `order_lines` table - see CLAUDE_CODE_BRIEF.md §6.
 * Nothing wrote to this table before Phase 6: an order's line items lived
 * only inside quotes.result_json, which is fine for the invoice (Phase 5)
 * but useless for fulfilment, which needs to assign a real lot, measured
 * thickness, cutter and inspector to each individual line. createOrderLines
 * materialises the quote's lines into real rows the moment an order is
 * created (called from the webhook right after lib/orders/store.ts's
 * createOrder).
 */

export interface NewOrderLineRow {
  order_id: string;
  line_no: number;
  part_ref: string | null;
  material_code: string;
  brand: string;
  certification_tier: string;
  tolerance_tier: string;
  edge_finish: string;
  face_finish: string;
  annealed: boolean;
  add_ons: string[] | null;
  length_in: number;
  width_in: number;
  thickness_nominal: number;
  qty: number;
}

export interface OrderLineRow extends NewOrderLineRow {
  id: string;
  thickness_actual: number | null;
  lot_id: string | null;
  cut_by: string | null;
  cut_at: string | null;
  inspected_by: string | null;
  nest_run_id: string | null;
}

const memoryLinesByOrder = new Map<string, OrderLineRow[]>();
let warnedAboutMemoryStore = false;
function warnOnce(): void {
  if (warnedAboutMemoryStore) return;
  warnedAboutMemoryStore = true;
  console.warn(
    "[orders/lines-store] Supabase is not configured - order lines are being kept in memory for local " +
      "development only. They will not survive a server restart. Add Supabase credentials to .env.local " +
      "before taking a real order (see CLAUDE_CODE_BRIEF.md §13)."
  );
}

/** Builds the order_lines rows for a freshly created order from the quote it was priced from. */
export function linesFromQuoteResult(orderId: string, quote: QuoteResult): NewOrderLineRow[] {
  return quote.lines.map((ln, i) => ({
    order_id: orderId,
    line_no: i + 1,
    part_ref: ln.part_ref || null,
    material_code: ln.material_code,
    brand: ln.brand,
    certification_tier: ln.certification_tier,
    tolerance_tier: ln.tolerance_tier,
    edge_finish: ln.edge_finish,
    face_finish: ln.face_finish,
    annealed: ln.annealed,
    add_ons: null,
    length_in: ln.length_in,
    width_in: ln.width_in,
    thickness_nominal: ln.thickness_nominal_in,
    qty: ln.qty,
  }));
}

export async function createOrderLines(rows: NewOrderLineRow[]): Promise<OrderLineRow[]> {
  if (rows.length === 0) return [];

  if (supabaseConfigured()) {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb.from("order_lines").insert(rows).select();
    if (error) throw new Error(`Failed to create order lines: ${error.message}`);
    return data as OrderLineRow[];
  }

  warnOnce();
  const full: OrderLineRow[] = rows.map((r) => ({
    ...r,
    id: randomUUID(),
    thickness_actual: null,
    lot_id: null,
    cut_by: null,
    cut_at: null,
    inspected_by: null,
    nest_run_id: null,
  }));
  const existing = memoryLinesByOrder.get(rows[0].order_id) ?? [];
  memoryLinesByOrder.set(rows[0].order_id, [...existing, ...full]);
  return full;
}

/**
 * Every not-yet-nested line across all orders - the nest board's queue
 * (CLAUDE_CODE_BRIEF.md §10). Excludes lines already claimed by a committed
 * nest run (nest_run_id set) AND lines already lot-assigned outside the
 * nest board (lot_id set, e.g. a one-off order fulfilled directly) - either
 * one means it's no longer "pending cut." A line can have nest_run_id set
 * with lot_id still null: the nest run fixed which physical lot is being
 * cut, but the per-piece measured thickness/cutter/inspector are still
 * recorded afterward through the ordinary fulfilment flow.
 */
export async function listPendingCutLines(): Promise<OrderLineRow[]> {
  if (supabaseConfigured()) {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb.from("order_lines").select("*").is("lot_id", null).is("nest_run_id", null);
    if (error) throw new Error(`Failed to list pending-cut lines: ${error.message}`);
    return (data as OrderLineRow[]) ?? [];
  }
  const all: OrderLineRow[] = [];
  for (const lines of memoryLinesByOrder.values()) {
    all.push(...lines.filter((l) => l.lot_id === null && l.nest_run_id === null));
  }
  return all;
}

/**
 * Every line belonging to the given orders, regardless of cut status - the
 * capacity dashboard's raw material (CLAUDE_CODE_BRIEF.md §21.1). Unlike
 * listPendingCutLines(), this does NOT filter by lot_id/nest_run_id; the
 * caller decides what "still needs saw time" means for its own purpose.
 */
export async function listOrderLinesForOrders(orderIds: string[]): Promise<OrderLineRow[]> {
  if (orderIds.length === 0) return [];

  if (supabaseConfigured()) {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb.from("order_lines").select("*").in("order_id", orderIds);
    if (error) throw new Error(`Failed to list order lines: ${error.message}`);
    return (data as OrderLineRow[]) ?? [];
  }

  const ids = new Set(orderIds);
  const all: OrderLineRow[] = [];
  for (const [orderId, lines] of memoryLinesByOrder.entries()) {
    if (ids.has(orderId)) all.push(...lines);
  }
  return all;
}

/** Marks lines as claimed by a committed nest run - see lib/nesting/commit.ts. */
export async function markLinesNested(lineIds: string[], nestRunId: string): Promise<void> {
  if (lineIds.length === 0) return;

  if (supabaseConfigured()) {
    const sb = getSupabaseAdmin();
    const { error } = await sb.from("order_lines").update({ nest_run_id: nestRunId }).in("id", lineIds);
    if (error) throw new Error(`Failed to mark lines nested: ${error.message}`);
    return;
  }

  for (const lines of memoryLinesByOrder.values()) {
    for (const line of lines) {
      if (lineIds.includes(line.id)) line.nest_run_id = nestRunId;
    }
  }
}

export async function getOrderLines(orderId: string): Promise<OrderLineRow[]> {
  if (supabaseConfigured()) {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb.from("order_lines").select("*").eq("order_id", orderId).order("line_no");
    if (error) throw new Error(`Failed to load order lines: ${error.message}`);
    return (data as OrderLineRow[]) ?? [];
  }
  return (memoryLinesByOrder.get(orderId) ?? []).slice().sort((a, b) => a.line_no - b.line_no);
}

export async function getOrderLine(lineId: string): Promise<OrderLineRow | null> {
  if (supabaseConfigured()) {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb.from("order_lines").select("*").eq("id", lineId).maybeSingle();
    if (error) throw new Error(`Failed to load order line: ${error.message}`);
    return (data as OrderLineRow) ?? null;
  }
  for (const lines of memoryLinesByOrder.values()) {
    const found = lines.find((l) => l.id === lineId);
    if (found) return found;
  }
  return null;
}

/** Assigns a lot to a line during fulfilment - see CLAUDE_CODE_BRIEF.md §10 "Fulfilment." */
export async function assignLotToLine(
  lineId: string,
  assignment: { lot_id: string; thickness_actual: number; cut_by: string; inspected_by: string }
): Promise<OrderLineRow> {
  const patch = {
    lot_id: assignment.lot_id,
    thickness_actual: assignment.thickness_actual,
    cut_by: assignment.cut_by,
    inspected_by: assignment.inspected_by,
    cut_at: new Date().toISOString(),
  };

  if (supabaseConfigured()) {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb.from("order_lines").update(patch).eq("id", lineId).select().single();
    if (error) throw new Error(`Failed to assign lot to line: ${error.message}`);
    return data as OrderLineRow;
  }

  const line = await getOrderLine(lineId);
  if (!line) throw new Error(`Order line ${lineId} does not exist.`);
  Object.assign(line, patch);
  return line;
}
