import { NextResponse } from "next/server";
import { getQuote, markQuoteEmailed } from "@/lib/quotes/store";
import { QuoteEmailRequestSchema } from "@/lib/validation/quote-email";
import { renderQuoteSummaryPdf } from "@/lib/docs/quote-summary";
import { quoteSummaryEmail } from "@/lib/email/quote-summary";
import { getResend, getFromAddress, resendConfigured } from "@/lib/email/client";
import type { QuoteResult } from "@/lib/pricing/engine";
import type { SoloNestResult } from "@/lib/pricing/solo-nest";

const RATE_LIMIT_MS = 5 * 60 * 1000;

/**
 * CLAUDE_CODE_BRIEF.md §20.5 - "Email me this quote." Accepts only
 * { quote_id, email } and, critically, never lets the request pick an
 * arbitrary destination once a quote already has an email of record: the
 * FIRST call sets that address (from the customer's own input), every call
 * after that sends only to the address already stored, no matter what the
 * request body says. That closes the "type someone else's address to spam
 * them" abuse path without requiring a login system this shop doesn't have.
 */
export async function POST(req: Request): Promise<Response> {
  if (!resendConfigured()) {
    return NextResponse.json(
      { error: "Emailing quotes isn't configured yet. Add RESEND_API_KEY to .env.local (see CLAUDE_CODE_BRIEF.md §13)." },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const parsed = QuoteEmailRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "That request doesn't look right.", issues: parsed.error.issues }, { status: 400 });
  }
  const { quote_id, email: requestedEmail } = parsed.data;

  const quoteRow = await getQuote(quote_id);
  if (!quoteRow) {
    return NextResponse.json({ error: "That quote no longer exists. Get a fresh price and try again." }, { status: 404 });
  }
  if (new Date(quoteRow.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "That quote has expired. Get a fresh price and try again." }, { status: 410 });
  }

  if (quoteRow.emailed_at) {
    const elapsed = Date.now() - new Date(quoteRow.emailed_at).getTime();
    if (elapsed < RATE_LIMIT_MS) {
      const retryAfterSeconds = Math.ceil((RATE_LIMIT_MS - elapsed) / 1000);
      return NextResponse.json(
        { error: "Already emailed this quote a moment ago - check your inbox, or try again in a few minutes." },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
      );
    }
  }

  // The address of record wins once one exists; the request body's email
  // only matters the first time.
  const sendToEmail = quoteRow.email ?? requestedEmail;

  const quote = quoteRow.result_json as QuoteResult & { solo_nest?: SoloNestResult | null };
  const pdf = await renderQuoteSummaryPdf({
    quoteId: quoteRow.id,
    createdAt: quoteRow.created_at,
    expiresAt: quoteRow.expires_at,
    customerEmail: sendToEmail,
    quote,
    soloNest: quote.solo_nest ?? null,
  });

  const { subject, html, text } = quoteSummaryEmail({
    quoteId: quoteRow.id,
    totalDue: quote.totals.total_due,
    promisedShipDate: quote.lead_time.promised_ship_date,
    expiresAt: quoteRow.expires_at,
  });

  const resend = getResend();
  const { error } = await resend.emails.send({
    from: getFromAddress(),
    to: sendToEmail,
    subject,
    html,
    text,
    attachments: [{ filename: `quote-${quoteRow.id}.pdf`, content: pdf }],
  });
  if (error) {
    return NextResponse.json({ error: `Could not send that email: ${error.message}` }, { status: 502 });
  }

  await markQuoteEmailed(quote_id, sendToEmail);

  return NextResponse.json({ ok: true, sent_to: sendToEmail });
}
