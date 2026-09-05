import { randomUUID } from "crypto";
import { getSupabaseAdmin, supabaseConfigured } from "../supabase/admin";
import { getLot, type LotRow } from "../lots/store";

/**
 * Persistence for the `remnants` table - see CLAUDE_CODE_BRIEF.md §6, §10
 * "Fulfilment... log remnants" (the one-tap write path) and §10 "Remnant
 * register... searchable by material, brand, tier and size, with a 'does a
 * remnant satisfy this order?' filter" (Phase 7's read/search path).
 */

export interface NewRemnantRow {
  lot_id: string;
  parent_order_id?: string | null;
  nest_run_id?: string | null;
  length_in: number;
  width_in: number;
  thickness_nominal: number;
  location_tag?: string | null;
}

export interface RemnantRow extends NewRemnantRow {
  id: string;
  created_at: string;
  consumed_at: string | null;
  consumed_order_id: string | null;
}

const memoryRemnants = new Map<string, RemnantRow>();
let warnedAboutMemoryStore = false;
function warnOnce(): void {
  if (warnedAboutMemoryStore) return;
  warnedAboutMemoryStore = true;
  console.warn(
    "[remnants/store] Supabase is not configured - remnants are being kept in memory for local development " +
      "only. They will not survive a server restart. Add Supabase credentials to .env.local (see " +
      "CLAUDE_CODE_BRIEF.md §13)."
  );
}

export async function createRemnant(row: NewRemnantRow): Promise<RemnantRow> {
  if (supabaseConfigured()) {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb.from("remnants").insert(row).select().single();
    if (error) throw new Error(`Failed to log remnant: ${error.message}`);
    return data as RemnantRow;
  }

  warnOnce();
  const full: RemnantRow = {
    ...row,
    parent_order_id: row.parent_order_id ?? null,
    nest_run_id: row.nest_run_id ?? null,
    location_tag: row.location_tag ?? null,
    id: randomUUID(),
    created_at: new Date().toISOString(),
    consumed_at: null,
    consumed_order_id: null,
  };
  memoryRemnants.set(full.id, full);
  return full;
}

/** Logs several remnants at once - a nest run commit can drop many keepable offcuts in one go. */
export async function createRemnants(rows: NewRemnantRow[]): Promise<RemnantRow[]> {
  if (rows.length === 0) return [];
  if (supabaseConfigured()) {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb.from("remnants").insert(rows).select();
    if (error) throw new Error(`Failed to log remnants: ${error.message}`);
    return data as RemnantRow[];
  }
  return Promise.all(rows.map((r) => createRemnant(r)));
}

export async function listRemnantsForOrder(orderId: string): Promise<RemnantRow[]> {
  if (supabaseConfigured()) {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb.from("remnants").select("*").eq("parent_order_id", orderId);
    if (error) throw new Error(`Failed to list remnants: ${error.message}`);
    return (data as RemnantRow[]) ?? [];
  }
  return Array.from(memoryRemnants.values()).filter((r) => r.parent_order_id === orderId);
}

export interface RemnantWithLot extends RemnantRow {
  lot: {
    material_code: string;
    brand: string;
    certification_tier: string;
    lot_number: string;
    manufacturer: string;
  } | null;
}

export interface RemnantSearchFilter {
  material_code?: string;
  brand?: string;
  certification_tier?: string;
  min_length_in?: number;
  min_width_in?: number;
  include_consumed?: boolean;
}

function lotSummary(lot: LotRow | null): RemnantWithLot["lot"] {
  if (!lot) return null;
  return { material_code: lot.material_code, brand: lot.brand, certification_tier: lot.certification_tier, lot_number: lot.lot_number, manufacturer: lot.manufacturer };
}

/**
 * The remnant register's search - CLAUDE_CODE_BRIEF.md §10: "Searchable by
 * material, brand, tier and size, with a 'does a remnant satisfy this
 * order?' filter." Passing the order's own material/brand/tier plus the
 * minimum blank size it needs answers exactly that question; passing
 * nothing lists the whole register (unconsumed remnants only, by default).
 */
export async function listRemnants(filter: RemnantSearchFilter = {}): Promise<RemnantWithLot[]> {
  let withLots: RemnantWithLot[];

  if (supabaseConfigured()) {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from("remnants")
      .select("*, lots(material_code, brand, certification_tier, lot_number, manufacturer)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(`Failed to search remnants: ${error.message}`);
    withLots = (data as (RemnantRow & { lots: RemnantWithLot["lot"] })[]).map(({ lots, ...r }) => ({ ...r, lot: lots }));
  } else {
    const all = Array.from(memoryRemnants.values());
    withLots = await Promise.all(
      all.map(async (r) => ({ ...r, lot: lotSummary(await getLot(r.lot_id)) }))
    );
  }

  return withLots.filter((r) => {
    if (!filter.include_consumed && r.consumed_at !== null) return false;
    if (filter.material_code && r.lot?.material_code !== filter.material_code) return false;
    if (filter.certification_tier && r.lot?.certification_tier !== filter.certification_tier) return false;
    // A remnant from a named brand can satisfy a GENERIC-brand need, but a
    // named-brand need can only be satisfied by that exact brand - the same
    // brand-lock rule as findCandidateLots in lib/lots/store.ts.
    if (filter.brand && filter.brand !== "GENERIC" && r.lot?.brand !== filter.brand) return false;
    if (filter.min_length_in !== undefined && r.length_in < filter.min_length_in) return false;
    if (filter.min_width_in !== undefined && r.width_in < filter.min_width_in) return false;
    return true;
  });
}
