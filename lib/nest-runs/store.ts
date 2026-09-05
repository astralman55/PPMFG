import { randomUUID } from "crypto";
import { getSupabaseAdmin, supabaseConfigured } from "../supabase/admin";

/**
 * Persistence for the `nest_runs` table - see CLAUDE_CODE_BRIEF.md §6 and
 * §10 "Nest board." A row is written only when a run is committed (not on
 * every preview) - see lib/nesting/plan.ts's commitNestRun.
 */

export interface NewNestRunRow {
  group_key: Record<string, string | number>;
  plan_json: unknown;
  sheet_count: number;
  utilisation: number;
  recoverable_fraction: number;
  executed_at: string;
}

export interface NestRunRow extends NewNestRunRow {
  id: string;
  created_at: string;
}

const memoryNestRuns = new Map<string, NestRunRow>();
let warnedAboutMemoryStore = false;
function warnOnce(): void {
  if (warnedAboutMemoryStore) return;
  warnedAboutMemoryStore = true;
  console.warn(
    "[nest-runs/store] Supabase is not configured - nest runs are being kept in memory for local development " +
      "only. They will not survive a server restart. Add Supabase credentials to .env.local (see " +
      "CLAUDE_CODE_BRIEF.md §13)."
  );
}

export async function createNestRun(row: NewNestRunRow): Promise<NestRunRow> {
  if (supabaseConfigured()) {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb.from("nest_runs").insert(row).select().single();
    if (error) throw new Error(`Failed to create nest run: ${error.message}`);
    return data as NestRunRow;
  }

  warnOnce();
  const full: NestRunRow = { ...row, id: randomUUID(), created_at: new Date().toISOString() };
  memoryNestRuns.set(full.id, full);
  return full;
}

/** Every committed nest run, newest first - the calibration panel's data source. */
export async function listNestRuns(): Promise<NestRunRow[]> {
  if (supabaseConfigured()) {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb.from("nest_runs").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(`Failed to list nest runs: ${error.message}`);
    return (data as NestRunRow[]) ?? [];
  }
  return Array.from(memoryNestRuns.values()).sort((a, b) => b.created_at.localeCompare(a.created_at));
}
