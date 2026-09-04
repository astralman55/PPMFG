"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface QueueOrder {
  id: string;
  order_number: string;
  status: string;
  promised_ship_date: string | null;
  customer_po: string | null;
  amount_paid_cents: number;
  invoice_path: string | null;
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const target = new Date(`${dateStr}T00:00:00Z`);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function latenessClasses(days: number | null): string {
  if (days === null) return "text-neutral-500";
  if (days < 0) return "text-red-600 font-medium";
  if (days <= 1) return "text-amber-600 font-medium";
  return "text-neutral-700 dark:text-neutral-300";
}

export default function OpsQueuePage() {
  const [orders, setOrders] = useState<QueueOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ops/orders")
      .then((r) => r.json())
      .then((d) => setOrders(d.orders))
      .catch(() => setError("Could not load the order queue."));
  }, []);

  return (
    <div>
      <h1 className="text-xl font-semibold">Queue</h1>
      <p className="mt-1 text-sm text-neutral-500">Open orders, soonest promised ship date first.</p>

      {error ? <p className="mt-6 text-sm text-red-600">{error}</p> : null}
      {!orders && !error ? <p className="mt-6 text-sm text-neutral-500">Loading...</p> : null}
      {orders && orders.length === 0 ? <p className="mt-6 text-sm text-neutral-500">No open orders.</p> : null}

      {orders && orders.length > 0 ? (
        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs uppercase text-neutral-500 dark:border-neutral-800">
              <th className="py-2 pr-4">Order</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Promised ship</th>
              <th className="py-2 pr-4">PO</th>
              <th className="py-2 pr-4">Paid</th>
              <th className="py-2 pr-4">Invoice</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const days = daysUntil(o.promised_ship_date);
              return (
                <tr key={o.id} className="border-b border-neutral-100 dark:border-neutral-900">
                  <td className="py-2 pr-4">
                    <Link href={`/ops/orders/${o.id}`} className="font-mono text-amber-700 hover:underline dark:text-amber-500">
                      {o.order_number}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{o.status}</td>
                  <td className={`py-2 pr-4 tabular-nums ${latenessClasses(days)}`}>
                    {o.promised_ship_date ?? "—"}
                    {days !== null ? ` (${days < 0 ? `${Math.abs(days)}d late` : `${days}d`})` : ""}
                  </td>
                  <td className="py-2 pr-4">{o.customer_po ?? "—"}</td>
                  <td className="py-2 pr-4 font-mono tabular-nums">${(o.amount_paid_cents / 100).toFixed(2)}</td>
                  <td className="py-2 pr-4">
                    {o.invoice_path ? (
                      <a
                        href={`/api/ops/orders/${o.id}/invoice`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-amber-700 hover:underline dark:text-amber-500"
                      >
                        View
                      </a>
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
