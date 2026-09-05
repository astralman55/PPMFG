import { NextResponse } from "next/server";
import { listRemnants } from "@/lib/remnants/store";

/**
 * The remnant register - CLAUDE_CODE_BRIEF.md §10: "Searchable by material,
 * brand, tier and size, with a 'does a remnant satisfy this order?' filter."
 * Query params: material_code, brand, certification_tier, min_length_in,
 * min_width_in, include_consumed.
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const p = url.searchParams;

  const minLength = p.get("min_length_in");
  const minWidth = p.get("min_width_in");

  const remnants = await listRemnants({
    material_code: p.get("material_code") || undefined,
    brand: p.get("brand") || undefined,
    certification_tier: p.get("certification_tier") || undefined,
    min_length_in: minLength ? Number(minLength) : undefined,
    min_width_in: minWidth ? Number(minWidth) : undefined,
    include_consumed: p.get("include_consumed") === "true",
  });

  return NextResponse.json({ remnants });
}
