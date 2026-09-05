import type { ReactNode } from "react";
import Link from "next/link";
import { getOrderBySessionId } from "@/lib/orders/store";
import { brand } from "@/lib/brand";

/**
 * Where Stripe Checkout's success_url sends the buyer, and what the Stage-1
 * confirmation email links to as the "order status" page - see
 * CLAUDE_CODE_BRIEF.md §9. Looked up by Stripe session id rather than a
 * database id because that's what success_url has on hand, and
 * getOrderBySessionId() already exists for the webhook handler.
 */

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "To be confirmed";
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

export default async function OrderConfirmedPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;

  if (!session_id) {
    return (
      <Shell>
        <p className="text-sm text-neutral-500">No order was specified.</p>
      </Shell>
    );
  }

  const order = await getOrderBySessionId(session_id);

  if (!order) {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold">Payment received</h1>
        <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
          Your payment went through and your order is being finalized - this usually takes a few seconds. A
          confirmation email with your invoice is on its way. If this page still says this after a minute, reload
          it.
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-2xl font-semibold">Order confirmed</h1>
      <p className="mt-1 text-sm text-neutral-500">
        A confirmation email with your invoice attached has been sent to you.
      </p>

      <dl className="mt-8 divide-y divide-neutral-200 border-y border-neutral-200 text-sm dark:divide-neutral-800 dark:border-neutral-800">
        <Row label="Order number" value={order.order_number} mono />
        <Row label="Promised ship date" value={formatDate(order.promised_ship_date)} />
        <Row label="Amount paid" value={money(order.amount_paid_cents)} mono />
        {order.customer_po ? <Row label="Your PO" value={order.customer_po} /> : null}
      </dl>

      <div className="mt-6 rounded border border-neutral-200 bg-neutral-50 p-4 text-sm dark:border-neutral-800 dark:bg-neutral-900">
        <p className="font-medium">Certification Package - coming separately</p>
        <p className="mt-1 text-neutral-600 dark:text-neutral-400">
          The same business day this order is cut, we&apos;ll email a Certificate of Conformance naming the actual
          material lot, plus the mill&apos;s Material Test Report for that lot.
        </p>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 text-neutral-900 dark:text-neutral-100">
      <p className="text-sm">
        <Link href="/" className="text-neutral-500 hover:underline">
          {brand.companyName}
        </Link>
      </p>
      <div className="mt-4">{children}</div>
    </main>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-3">
      <dt className="text-neutral-500">{label}</dt>
      <dd className={mono ? "font-mono tabular-nums" : "font-medium"}>{value}</dd>
    </div>
  );
}
