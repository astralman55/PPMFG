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
  }));
  const existing = memoryLinesByOrder.get(rows[0].order_id) ?? [];
  memoryLinesByOrder.set(rows[0].order_id, [...existing, ...full]);
  return full;
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
