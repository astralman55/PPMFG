import { NextResponse } from "next/server";
import { getStripe, stripeConfigured } from "@/lib/stripe/client";
import { CheckoutRequestSchema } from "@/lib/validation/checkout";
import { getQuote, markQuoteConsumed } from "@/lib/quotes/store";
import { generateOrderNumber } from "@/lib/orders/order-number";

// Automatic tax needs a business address on file in Stripe's tax settings
// (dashboard.stripe.com/test/settings/tax) - the owner added that, verified
// live below, so this is back on.
const AUTOMATIC_TAX_ENABLED = true;

/**
 * Starts a Stripe Checkout session. Accepts ONLY quote_id, email, company
 * and customer_po - see CLAUDE_CODE_BRIEF.md §7.3. There is no price field
 * in the request schema; the session is built entirely from total_cents
 * already stored on the quote row, never from anything the client sends.
 */
export async function POST(req: Request): Promise<Response> {
  if (!stripeConfigured()) {
    return NextResponse.json(
      { error: "Payments are not configured yet. Add Stripe credentials to .env.local (see CLAUDE_CODE_BRIEF.md §13)." },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const parsed = CheckoutRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "That checkout request doesn't look right.", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const { quote_id, email, company, customer_po } = parsed.data;

  const quoteRow = await getQuote(quote_id);
  if (!quoteRow) {
    return NextResponse.json({ error: "That quote no longer exists. Get a fresh price and try again." }, { status: 404 });
  }
  if (new Date(quoteRow.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "That quote has expired. Get a fresh price and try again." }, { status: 410 });
  }
  if (quoteRow.consumed_at !== null) {
    return NextResponse.json({ error: "That quote has already been used to start an order." }, { status: 409 });
  }

  const order_number = generateOrderNumber();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;

  const stripe = getStripe();
  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: "Engineering plastics order" },
            unit_amount: quoteRow.subtotal_cents,
          },
          quantity: 1,
        },
        {
          price_data: {
            currency: "usd",
            product_data: { name: "Shipping" },
            unit_amount: quoteRow.shipping_cents,
          },
          quantity: 1,
        },
      ],
      automatic_tax: { enabled: AUTOMATIC_TAX_ENABLED },
      customer_creation: "always",
      customer_email: email,
      shipping_address_collection: { allowed_countries: ["US"] },
      custom_fields: [
        {
          key: "purchase_order_number",
          label: { type: "custom", custom: "Purchase order number" },
          type: "text",
          optional: true,
          text: { default_value: customer_po || undefined },
        },
      ],
      metadata: {
        quote_id,
        order_number,
        company: company ?? "",
      },
      success_url: `${siteUrl}/order/confirmed?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/quote`,
    });
  } catch (err) {
    // Stripe rejects the request itself (e.g. account setup incomplete,
    // like automatic tax needing a business address on file) - surface
    // that plainly instead of a raw framework crash.
    const message = err instanceof Error ? err.message : "Stripe rejected this checkout request.";
    console.error(`[checkout] Stripe session creation failed for quote ${quote_id}: ${message}`);
    return NextResponse.json({ error: `Could not start checkout: ${message}` }, { status: 502 });
  }

  const wasConsumed = await markQuoteConsumed(quote_id);
  if (!wasConsumed) {
    // Lost a race with a concurrent checkout attempt on the same quote. The
    // Stripe session above already exists and is valid, so let this one
    // through rather than discarding a session mid-flight.
    console.warn(`[checkout] quote ${quote_id} was already consumed when marking it after session creation.`);
  }

  return NextResponse.json({ url: session.url, session_id: session.id, order_number });
}
