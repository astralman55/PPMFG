import { NextResponse } from "next/server";
import { quote, QuoteError, type PricingConfig } from "@/lib/pricing/engine";
import cfgJson from "@/lib/pricing/config.json";
import { QuoteRequestSchema } from "@/lib/validation/quote";
import { saveQuote } from "@/lib/quotes/store";
import { buildSoloNest, type SoloNestResult } from "@/lib/pricing/solo-nest";

const CFG = cfgJson as unknown as PricingConfig;

function todayIso(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Prices a quote server-side and persists it. This is the only place a
 * price is computed. The request carries dimensions and options; it never
 * carries a price, and any extra field a client injects (a total, a
 * discount, anything) is stripped by zod before it ever reaches the engine.
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const parsed = QuoteRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "That quote request doesn't look right.", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const input = parsed.data;
  // The engine never reads the wall clock (no Date.now() inside it) - the
  // caller supplies "today" here, server-side, so the browser can never
  // influence the promised ship date either.
  const order_date = input.order_date ?? todayIso();

  let result;
  try {
    result = quote({ ...input, order_date }, CFG);
  } catch (e) {
    if (e instanceof QuoteError) {
      return NextResponse.json({ error: e.message }, { status: 422 });
    }
    throw e;
  }

  // CLAUDE_CODE_BRIEF.md §19 (Phase 11): a read-only preview of how this
  // request's own lines alone would sit on a fresh sheet. It never touches
  // nest_runs or the remnant register, and a failure here must never break
  // pricing - if it throws for any reason, the quote still returns, just
  // without a diagram.
  let solo_nest: SoloNestResult | null = null;
  try {
    solo_nest = buildSoloNest(result.lines, CFG);
  } catch (e) {
    console.error("[api/quote] solo nest preview failed:", e);
  }

  const resultWithPreview = { ...result, solo_nest };

  const saved = await saveQuote(
    {
      request_json: { ...input, order_date },
      result_json: resultWithPreview,
      subtotal_cents: Math.round(result.totals.subtotal_goods * 100),
      shipping_cents: Math.round(result.totals.shipping * 100),
      total_cents: result.totals.total_cents,
      promised_ship_date: result.lead_time.promised_ship_date,
      config_version: result.schema_version,
    },
    CFG.quote.validity_hours
  );

  return NextResponse.json({ ...resultWithPreview, quote_id: saved.id, expires_at: saved.expires_at });
}
