import { randomUUID } from "crypto";
import { getSupabaseAdmin, supabaseConfigured } from "../supabase/admin";

/**
 * Persistence for the `lots` table - see CLAUDE_CODE_BRIEF.md §6 and §10
 * "Lot library." A lot is a real, physical batch of material the shop bought:
 * it's what a Material Test Report and a Certificate of Conformance actually
 * name. Order lines get satisfied by assigning a lot to them during
 * fulfilment (lib/orders/lines-store.ts), never invented.
 */

export interface NewLotRow {
  lot_number: string;
  material_code: string;
  brand: string;
  certification_tier: string;
  manufacturer: string;
  distributor?: string | null;
  distributor_po?: string | null;
  country_of_origin?: string | null;
  thickness_nominal: number;
  received_date: string; // ISO date, "YYYY-MM-DD"
  mtr_path?: string | null;
  mtr_uploaded_at?: string | null;
  resin_cert_path?: string | null;
  qty_received_in2?: number | null;
  qty_remaining_in2?: number | null;
  notes?: string | null;
}

export interface LotRow extends NewLotRow {
  id: string;
}

const memoryLots = new Map<string, LotRow>();
let warnedAboutMemoryStore = false;
function warnOnce(): void {
  if (warnedAboutMemoryStore) return;
  warnedAboutMemoryStore = true;
  console.warn(
    "[lots/store] Supabase is not configured - lots are being kept in memory for local development only. " +
      "They will not survive a server restart. Add Supabase credentials to .env.local before receiving real " +
      "material (see CLAUDE_CODE_BRIEF.md §13)."
  );
}

/** Raised when a lot_number/material_code/thickness_nominal combination already exists. */
export class DuplicateLotError extends Error {}

export async function createLot(row: NewLotRow): Promise<LotRow> {
  if (supabaseConfigured()) {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb.from("lots").insert(row).select().single();
    if (error) {
      if (error.code === "23505") {
        throw new DuplicateLotError(
          `A lot already exists with lot number "${row.lot_number}" for ${row.material_code} at ` +
            `${row.thickness_nominal} in. Use that existing lot instead of creating a duplicate.`
        );
      }
      throw new Error(`Failed to create lot: ${error.message}`);
    }
    return data as LotRow;
  }

  warnOnce();
  const dup = Array.from(memoryLots.values()).find(
    (l) => l.lot_number === row.lot_number && l.material_code === row.material_code && l.thickness_nominal === row.thickness_nominal
  );
  if (dup) {
    throw new DuplicateLotError(
      `A lot already exists with lot number "${row.lot_number}" for ${row.material_code} at ` +
        `${row.thickness_nominal} in. Use that existing lot instead of creating a duplicate.`
    );
  }
  const full: LotRow = { ...row, id: randomUUID() };
  memoryLots.set(full.id, full);
  return full;
}

/** Attaches uploaded document paths to a lot after createLot - see app/api/ops/lots/route.ts. */
export async function updateLotDocuments(
  id: string,
  patch: { mtr_path?: string | null; mtr_uploaded_at?: string | null; resin_cert_path?: string | null }
): Promise<LotRow> {
  if (supabaseConfigured()) {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb.from("lots").update(patch).eq("id", id).select().single();
    if (error) throw new Error(`Failed to update lot documents: ${error.message}`);
    return data as LotRow;
  }

  const existing = memoryLots.get(id);
  if (!existing) throw new Error(`Lot ${id} does not exist.`);
  Object.assign(existing, patch);
  return existing;
}

export async function getLot(id: string): Promise<LotRow | null> {
  if (supabaseConfigured()) {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb.from("lots").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(`Failed to load lot: ${error.message}`);
    return (data as LotRow) ?? null;
  }
  return memoryLots.get(id) ?? null;
}

export async function listLots(): Promise<LotRow[]> {
  if (supabaseConfigured()) {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb.from("lots").select("*").order("received_date", { ascending: false });
    if (error) throw new Error(`Failed to list lots: ${error.message}`);
    return (data as LotRow[]) ?? [];
  }
  return Array.from(memoryLots.values()).sort((a, b) => b.received_date.localeCompare(a.received_date));
}

/**
 * Lots that could satisfy an order line: same material and nominal
 * thickness, and - per CLAUDE_CODE_BRIEF.md §10 ("the lot dropdown must
 * filter by brand and tier and refuse a mismatch") - matching certification
 * tier, and matching brand UNLESS the line was quoted GENERIC ("any approved
 * source"), in which case any real named brand can satisfy it.
 */
export async function findCandidateLots(filter: {
  material_code: string;
  brand: string;
  certification_tier: string;
  thickness_nominal: number;
}): Promise<LotRow[]> {
  const all = await listLots();
  return all.filter((lot) => {
    if (lot.material_code !== filter.material_code) return false;
    if (lot.certification_tier !== filter.certification_tier) return false;
    if (lot.thickness_nominal !== filter.thickness_nominal) return false;
    if (filter.brand !== "GENERIC" && lot.brand !== filter.brand) return false;
    return true;
  });
}
