import { NextResponse } from "next/server";
import { getOrderById } from "@/lib/orders/store";
import { getSignedUrl } from "@/lib/supabase/storage";

/** Redirects to a short-lived signed URL for the order's archived Stage-1 invoice PDF. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const order = await getOrderById(id);
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  if (!order.invoice_path) {
    return NextResponse.json(
      { error: "No invoice has been archived for this order (it may predate this feature, or the Stage-1 email hasn't gone out yet)." },
      { status: 404 }
    );
  }

  const url = await getSignedUrl("invoices", order.invoice_path);
  return NextResponse.redirect(url);
}
