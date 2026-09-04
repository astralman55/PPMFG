import { NextResponse } from "next/server";
import { createRemnant } from "@/lib/remnants/store";
import { getLot } from "@/lib/lots/store";

/** Logs a remnant left over from cutting this order - CLAUDE_CODE_BRIEF.md §10 "Fulfilment." */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id: orderId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }
  const { lot_id, length_in, width_in, thickness_nominal, location_tag } = (body ?? {}) as Record<string, unknown>;

  if (typeof lot_id !== "string" || !lot_id) {
    return NextResponse.json({ error: "lot_id is required." }, { status: 400 });
  }
  const lot = await getLot(lot_id);
  if (!lot) return NextResponse.json({ error: "That lot does not exist." }, { status: 404 });

  for (const [name, v] of [
    ["length_in", length_in],
    ["width_in", width_in],
    ["thickness_nominal", thickness_nominal],
  ] as const) {
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) {
      return NextResponse.json({ error: `${name} must be a positive number.` }, { status: 400 });
    }
  }

  const remnant = await createRemnant({
    lot_id,
    parent_order_id: orderId,
    length_in: length_in as number,
    width_in: width_in as number,
    thickness_nominal: thickness_nominal as number,
    location_tag: typeof location_tag === "string" && location_tag.trim() ? location_tag.trim() : null,
  });
  return NextResponse.json({ remnant });
}
