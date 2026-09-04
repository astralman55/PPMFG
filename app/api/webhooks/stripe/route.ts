import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, stripeConfigured } from "@/lib/stripe/client";
import { recordWebhookEventIfNew, upsertCustomer, createOrder, type OrderRow } from "@/lib/orders/store";
import { getQuote, type QuoteRow } from "@/lib/quotes/store";
import { renderInvoicePdf, type InvoiceShipAddress } from "@/lib/docs/invoice";
import { orderConfirmationEmail } from "@/lib/email/order-confirmation";
import { getResend, resendConfigured, getFromAddress } from "@/lib/email/client";
import type { QuoteResult } from "@/lib/pricing/engine";

/**
 * Stripe webhook receiver. Reads the raw body BEFORE parsing (required for
 * signature verification), verifies the signature, then records the event
 * id before doing anything else and bails on conflict - Stripe retries
 * webhooks on any non-2xx response, and a duplicate order or duplicate
 * invoice email is a support nightmare. See CLAUDE_CODE_BRIEF.md §13.
 */
export async function POST(req: Request): Promise<Response> {
  if (!stripeConfigured()) {
    return NextResponse.json({ error: "Stripe is not configured yet." }, { status: 503 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET is not configured yet." }, { status: 503 });
  }

  // Raw body first - constructEvent needs the exact bytes Stripe signed.
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature.";
    return NextResponse.json({ error: `Webhook signature verification failed: ${message}` }, { status: 400 });
  }

  const isNewEvent = await recordWebhookEventIfNew(event.id, event.type);
  if (!isNewEvent) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  if (event.type === "checkout.session.completed") {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
    await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session, siteUrl);
  }

  return NextResponse.json({ received: true });
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session, siteUrl: string): Promise<void> {
  const quoteId = session.metadata?.quote_id ?? null;
  const orderNumber = session.metadata?.order_number;
  if (!orderNumber) {
    console.error(
      `[webhook] checkout.session.completed for ${session.id} has no order_number in metadata; skipping order creation.`
    );
    return;
  }

  const quote = quoteId ? await getQuote(quoteId) : null;

  const email = session.customer_details?.email ?? session.customer_email ?? "";
  const stripeCustomerId = typeof session.customer === "string" ? session.customer : (session.customer?.id ?? null);
  const customer = await upsertCustomer({
    email,
    company: session.metadata?.company || null,
    stripe_customer_id: stripeCustomerId,
  });

  const poField = session.custom_fields?.find((f) => f.key === "purchase_order_number");
  const customerPo = poField?.type === "text" ? (poField.text?.value ?? null) : null;

  const address = session.customer_details?.address ?? session.collected_information?.shipping_details?.address ?? null;
  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null);

  const order = await createOrder({
    order_number: orderNumber,
    quote_id: quoteId,
    customer_id: customer.id,
    stripe_session_id: session.id,
    stripe_payment_intent: paymentIntentId,
    customer_po: customerPo,
    ship_address: address,
    amount_paid_cents: session.amount_total ?? 0,
    tax_cents: session.total_details?.amount_tax ?? 0,
    promised_ship_date: quote?.promised_ship_date ?? null,
  });

  // The order is already paid and saved at this point - a failure sending the
  // confirmation email must never look like a failure to Stripe (which would
  // trigger a retry that skips re-creating the order, since the event id is
  // already recorded above, but would also never retry the email). Log
  // loudly instead so it's visible in server logs for a manual resend.
  try {
    await sendStage1Confirmation({ order, quote, email, company: customer.company, address, siteUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[webhook] order ${orderNumber} was created but the Stage-1 confirmation email failed: ${message}`);
  }
}

async function sendStage1Confirmation(args: {
  order: OrderRow;
  quote: QuoteRow | null;
  email: string;
  company: string | null;
  address: InvoiceShipAddress | null;
  siteUrl: string;
}): Promise<void> {
  const { order, quote, email, company, address, siteUrl } = args;

  if (!quote) {
    console.warn(
      `[webhook] order ${order.order_number} has no matching quote record; skipping the Stage-1 email ` +
        "(the priced quote it was built from is no longer available, so a correct invoice can't be built)."
    );
    return;
  }
  if (!email) {
    console.warn(`[webhook] order ${order.order_number} has no customer email; skipping the Stage-1 email.`);
    return;
  }
  if (!resendConfigured()) {
    console.warn(
      `[webhook] order ${order.order_number} was created but RESEND_API_KEY is not configured yet, so no ` +
        "confirmation email was sent (see CLAUDE_CODE_BRIEF.md §13)."
    );
    return;
  }

  const quoteResult = quote.result_json as QuoteResult;
  const orderStatusUrl = `${siteUrl}/order/confirmed?session_id=${order.stripe_session_id}`;

  const pdf = await renderInvoicePdf({
    orderNumber: order.order_number,
    createdAt: order.created_at,
    customerPo: order.customer_po,
    promisedShipDate: order.promised_ship_date,
    customerEmail: email,
    customerCompany: company,
    shipAddress: address,
    quote: quoteResult,
    amountPaidCents: order.amount_paid_cents,
    taxCents: order.tax_cents,
  });

  const { subject, html, text } = orderConfirmationEmail({
    orderNumber: order.order_number,
    promisedShipDate: order.promised_ship_date,
    customerEmail: email,
    orderStatusUrl,
    amountPaidCents: order.amount_paid_cents,
  });

  const resend = getResend();
  const { error } = await resend.emails.send({
    from: getFromAddress(),
    to: email,
    subject,
    html,
    text,
    attachments: [
      {
        filename: `invoice-${order.order_number}.pdf`,
        content: pdf,
      },
    ],
  });
  if (error) {
    throw new Error(`Resend rejected the confirmation email: ${error.message}`);
  }
}
