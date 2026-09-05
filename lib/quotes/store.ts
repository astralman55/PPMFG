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
  emailed_at: string | null;
  po_upload_path: string | null;
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
  const full: QuoteRow = {
    ...row,
    id,
    created_at: now.toISOString(),
    expires_at,
    consumed_at: null,
    emailed_at: null,
    po_upload_path: null,
  };
  memoryStore.set(id, full);
  return full;
}

/** Reads a quote by id, or null if it doesn't exist. */
export async function getQuote(id: string): Promise<QuoteRow | null> {
  if (supabaseConfigured()) {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb.from("quotes").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(`Failed to load quote: ${error.message}`);
    return (data as QuoteRow) ?? null;
  }
  return memoryStore.get(id) ?? null;
}

/**
 * Marks a quote consumed, but only if it hasn't been already - guards
 * against two concurrent checkout attempts on the same quote. Returns false
 * if the quote was already consumed (or doesn't exist).
 */
export async function markQuoteConsumed(id: string): Promise<boolean> {
  const consumed_at = new Date().toISOString();

  if (supabaseConfigured()) {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from("quotes")
      .update({ consumed_at })
      .eq("id", id)
      .is("consumed_at", null)
      .select("id");
    if (error) throw new Error(`Failed to mark quote consumed: ${error.message}`);
    return (data?.length ?? 0) > 0;
  }

  const row = memoryStore.get(id);
  if (!row || row.consumed_at !== null) return false;
  row.consumed_at = consumed_at;
  return true;
}

/**
 * Records that a quote was just emailed - CLAUDE_CODE_BRIEF.md §20.5. The
 * caller (POST /api/quote/email) decides which email address to persist
 * BEFORE calling this: the quote's existing email if it already has one, or
 * the freshly supplied one on first use. This function just writes whatever
 * it's given, so the "don't let a client redirect an already-emailed quote
 * elsewhere" rule lives in the route, not here.
 */
export async function markQuoteEmailed(id: string, email: string): Promise<QuoteRow | null> {
  const emailed_at = new Date().toISOString();

  if (supabaseConfigured()) {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb.from("quotes").update({ email, emailed_at }).eq("id", id).select().maybeSingle();
    if (error) throw new Error(`Failed to record quote email send: ${error.message}`);
    return (data as QuoteRow) ?? null;
  }

  const row = memoryStore.get(id);
  if (!row) return null;
  row.email = email;
  row.emailed_at = emailed_at;
  return row;
}

/** Attaches an uploaded purchase-order document's storage path to a quote. */
export async function attachPoUpload(id: string, path: string): Promise<QuoteRow | null> {
  if (supabaseConfigured()) {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb.from("quotes").update({ po_upload_path: path }).eq("id", id).select().maybeSingle();
    if (error) throw new Error(`Failed to attach purchase order upload: ${error.message}`);
    return (data as QuoteRow) ?? null;
  }

  const row = memoryStore.get(id);
  if (!row) return null;
  row.po_upload_path = path;
  return row;
}
