import { randomUUID } from "crypto";
import { getSupabaseAdmin, supabaseConfigured } from "../supabase/admin";

/**
 * Persistence for priced quotes (the `quotes` table from
 * supabase/migrations/0001_init.sql). This is what makes server-side
 * pricing enforceable: checkout reads total_cents back from here rather
 * than trusting anything the browser sends.
 *
 * Until Supabase credentials are added to .env.local, this falls back to an
 * in-memory store so the quote builder can be developed and demoed locally.
 * That fallback is for local development ONLY - it does not survive a
 * server restart and offers no protection once more than one server process
 * is involved. It disappears automatically the moment Supabase is configured.
 */

export interface NewQuoteRow {
  request_json: unknown;
  result_json: unknown;
  subtotal_cents: number;
  shipping_cents: number;
  total_cents: number;
  promised_ship_date: string;
  config_version: string;
  email?: string | null;
  company?: string | null;
}

export interface QuoteRow extends NewQuoteRow {
  id: string;
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
}

const memoryStore = new Map<string, QuoteRow>();
let warnedAboutMemoryStore = false;

function warnOnce(): void {
  if (warnedAboutMemoryStore) return;
  warnedAboutMemoryStore = true;
  console.warn(
    "[quotes/store] Supabase is not configured - quotes are being kept in an " +
      "in-memory store for local development only. They will not survive a " +
      "server restart. Add Supabase credentials to .env.local before taking " +
      "a real order (see CLAUDE_CODE_BRIEF.md §13)."
  );
}

/** Writes a priced quote and returns the persisted row, including its id. */
export async function saveQuote(row: NewQuoteRow, validityHours: number): Promise<QuoteRow> {
  const now = new Date();
  const expires_at = new Date(now.getTime() + validityHours * 3_600_000).toISOString();

  if (supabaseConfigured()) {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from("quotes")
      .insert({ ...row, expires_at })
      .select()
      .single();
    if (error) throw new Error(`Failed to save quote: ${error.message}`);
    return data as QuoteRow;
  }

  warnOnce();
  const id = randomUUID();
  const full: QuoteRow = { ...row, id, created_at: now.toISOString(), expires_at, consumed_at: null };
  memoryStore.set(id, full);
  return full;
}
