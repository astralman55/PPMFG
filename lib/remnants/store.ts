import { randomUUID } from "crypto";
import { getSupabaseAdmin, supabaseConfigured } from "../supabase/admin";

/**
 * Persistence for the `remnants` table - see CLAUDE_CODE_BRIEF.md §6 and §10
 * "Fulfilment... log remnants (dimensions plus rack location, one tap)."
 * The full searchable register screen is Phase 7 scope; this is just the
 * write side logged during fulfilment.
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

export async function listRemnantsForOrder(orderId: string): Promise<RemnantRow[]> {
  if (supabaseConfigured()) {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb.from("remnants").select("*").eq("parent_order_id", orderId);
    if (error) throw new Error(`Failed to list remnants: ${error.message}`);
    return (data as RemnantRow[]) ?? [];
  }
  return Array.from(memoryRemnants.values()).filter((r) => r.parent_order_id === orderId);
}
