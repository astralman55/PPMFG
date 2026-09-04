import { randomUUID } from "crypto";
import { getSupabaseAdmin, supabaseConfigured } from "../supabase/admin";

/**
 * Persistence for webhook idempotency, customers and orders (the
 * `webhook_events`, `customers` and `orders` tables from
 * supabase/migrations/0001_init.sql).
 *
 * Same local-dev fallback pattern as lib/quotes/store.ts: without Supabase
 * credentials, everything here lives in memory only, is lost on restart,
 * and prints a one-time warning. It switches over automatically the moment
 * Supabase is configured.
 */

let warnedAboutMemoryStore = false;
function warnOnce(): void {
  if (warnedAboutMemoryStore) return;
  warnedAboutMemoryStore = true;
  console.warn(
    "[orders/store] Supabase is not configured - webhook events, customers and " +
      "orders are being kept in memory for local development only. They will " +
      "not survive a server restart. Add Supabase credentials to .env.local " +
      "before taking a real order (see CLAUDE_CODE_BRIEF.md §13)."
  );
}

// ---------------------------------------------------------------------------
// Webhook idempotency
// ---------------------------------------------------------------------------

const memoryWebhookEventIds = new Set<string>();

/**
 * Records a Stripe webhook event id, returning true if this is the first
 * time it's been seen. Stripe retries webhooks on any non-2xx response, so
 * this is what stops a retried `checkout.session.completed` from creating a
 * second order.
 */
export async function recordWebhookEventIfNew(id: string, type: string): Promise<boolean> {
  if (supabaseConfigured()) {
    const sb = getSupabaseAdmin();
    const { error } = await sb.from("webhook_events").insert({ id, type });
    if (error) {
      if (error.code === "23505") return false; // unique violation - already processed
      throw new Error(`Failed to record webhook event: ${error.message}`);
    }
    return true;
  }

  warnOnce();
  if (memoryWebhookEventIds.has(id)) return false;
  memoryWebhookEventIds.add(id);
  return true;
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export interface CustomerInput {
  email: string;
  company?: string | null;
  stripe_customer_id?: string | null;
}

export interface CustomerRow {
  id: string;
  email: string;
  company: string | null;
  stripe_customer_id: string | null;
  phone: string | null;
  resale_cert_status: string;
  created_at: string;
}

const memoryCustomersByEmail = new Map<string, CustomerRow>();

/** Finds a customer by email (matching by Stripe customer id first, if given) or creates one. */
export async function upsertCustomer(input: CustomerInput): Promise<CustomerRow> {
  if (supabaseConfigured()) {
    const sb = getSupabaseAdmin();

    if (input.stripe_customer_id) {
      const { data: byStripeId } = await sb
        .from("customers")
        .select("*")
        .eq("stripe_customer_id", input.stripe_customer_id)
        .maybeSingle();
      if (byStripeId) return byStripeId as CustomerRow;
    }

    const { data: byEmail } = await sb.from("customers").select("*").eq("email", input.email).maybeSingle();
    if (byEmail) {
      if (input.stripe_customer_id && !byEmail.stripe_customer_id) {
        const { data: updated, error } = await sb
          .from("customers")
          .update({ stripe_customer_id: input.stripe_customer_id })
          .eq("id", byEmail.id)
          .select()
          .single();
        if (error) throw new Error(`Failed to update customer: ${error.message}`);
        return updated as CustomerRow;
      }
      return byEmail as CustomerRow;
    }

    const { data, error } = await sb
      .from("customers")
      .insert({
        email: input.email,
        company: input.company ?? null,
        stripe_customer_id: input.stripe_customer_id ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(`Failed to create customer: ${error.message}`);
    return data as CustomerRow;
  }

  warnOnce();
  const existing = memoryCustomersByEmail.get(input.email);
  if (existing) {
    if (input.stripe_customer_id && !existing.stripe_customer_id) {
      existing.stripe_customer_id = input.stripe_customer_id;
    }
    return existing;
  }
  const row: CustomerRow = {
    id: randomUUID(),
    email: input.email,
    company: input.company ?? null,
    stripe_customer_id: input.stripe_customer_id ?? null,
    phone: null,
    resale_cert_status: "none",
    created_at: new Date().toISOString(),
  };
  memoryCustomersByEmail.set(input.email, row);
  return row;
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export interface NewOrderRow {
  order_number: string;
  quote_id: string | null;
  customer_id: string;
  stripe_session_id: string;
  stripe_payment_intent: string | null;
  customer_po: string | null;
  ship_address: unknown;
  amount_paid_cents: number;
  tax_cents: number;
  promised_ship_date: string | null;
}

export interface OrderRow extends NewOrderRow {
  id: string;
  status: string;
  nest_group_key: string | null;
  tracking_number: string | null;
  carrier: string | null;
  invoice_path: string | null;
  packet_path: string | null;
  created_at: string;
  shipped_at: string | null;
}

const memoryOrdersBySession = new Map<string, OrderRow>();

/** Reads an order by its Stripe Checkout Session id, or null if none exists yet. */
export async function getOrderBySessionId(stripeSessionId: string): Promise<OrderRow | null> {
  if (supabaseConfigured()) {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb.from("orders").select("*").eq("stripe_session_id", stripeSessionId).maybeSingle();
    if (error) throw new Error(`Failed to load order: ${error.message}`);
    return (data as OrderRow) ?? null;
  }
  return memoryOrdersBySession.get(stripeSessionId) ?? null;
}

/**
 * Creates the order for a completed Stripe Checkout Session. `stripe_session_id`
 * is unique, so this is a second, independent layer of duplicate protection
 * beneath the webhook_events idempotency check - if it somehow fires twice
 * anyway, the existing order is returned rather than a duplicate created.
 */
export async function createOrder(row: NewOrderRow): Promise<OrderRow> {
  if (supabaseConfigured()) {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from("orders")
      .insert({ ...row, status: "paid" })
      .select()
      .single();
    if (error) {
      if (error.code === "23505") {
        const existing = await getOrderBySessionId(row.stripe_session_id);
        if (existing) return existing;
      }
      throw new Error(`Failed to create order: ${error.message}`);
    }
    return data as OrderRow;
  }

  warnOnce();
  const existing = memoryOrdersBySession.get(row.stripe_session_id);
  if (existing) return existing;
  const full: OrderRow = {
    ...row,
    id: randomUUID(),
    status: "paid",
    nest_group_key: null,
    tracking_number: null,
    carrier: null,
    invoice_path: null,
    packet_path: null,
    created_at: new Date().toISOString(),
    shipped_at: null,
  };
  memoryOrdersBySession.set(row.stripe_session_id, full);
  return full;
}
