import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, stripeConfigured } from "@/lib/stripe/client";
import { recordWebhookEventIfNew, upsertCustomer, createOrder } from "@/lib/orders/store";
import { getQuote } from "@/lib/quotes/store";

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
    await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
  }

  return NextResponse.json({ received: true });
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
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

  await createOrder({
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
}
