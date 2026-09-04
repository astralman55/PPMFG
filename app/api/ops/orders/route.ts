import { NextResponse } from "next/server";
import { listOrders } from "@/lib/orders/store";

/** The ops queue - orders sorted by promised ship date, soonest first. */
export async function GET(): Promise<Response> {
  const orders = await listOrders();
  const sorted = orders
    .filter((o) => o.status !== "shipped" && o.status !== "cancelled")
    .sort((a, b) => (a.promised_ship_date ?? "9999-12-31").localeCompare(b.promised_ship_date ?? "9999-12-31"));
  return NextResponse.json({ orders: sorted });
}
