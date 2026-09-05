import { NextResponse } from "next/server";
import { getQuote, attachPoUpload } from "@/lib/quotes/store";
import { checkPurchaseOrderUpload } from "@/lib/uploads/require-pdf";
import { uploadPrivateFile } from "@/lib/supabase/storage";

/**
 * CLAUDE_CODE_BRIEF.md §20.4 - stores a customer's own purchase-order PDF as
 * an inert reference attachment on their quote. Never parsed, OCR'd, or run
 * through any extraction - it exists purely so a human can open it during
 * fulfilment if a question comes up about payment terms or PO validity.
 */
export async function POST(req: Request): Promise<Response> {
  const form = await req.formData();
  const quote_id = form.get("quote_id");
  const file = form.get("file");

  if (typeof quote_id !== "string" || quote_id.length === 0) {
    return NextResponse.json({ error: "Missing quote_id." }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }

  const quoteRow = await getQuote(quote_id);
  if (!quoteRow) {
    return NextResponse.json({ error: "That quote no longer exists. Get a fresh price and try again." }, { status: 404 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkPurchaseOrderUpload(file.name, bytes);
  if (!check.ok) {
    return NextResponse.json({ error: check.reason }, { status: 415 });
  }

  const path = `${quote_id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9_.-]/g, "_")}`;
  await uploadPrivateFile("purchase-orders", path, Buffer.from(bytes), "application/pdf", { upsert: true });
  await attachPoUpload(quote_id, path);

  return NextResponse.json({ ok: true });
}
