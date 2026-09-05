import { NextResponse } from "next/server";
import { listRemnants } from "@/lib/remnants/store";

/**
 * Public (unauthenticated - not under /api/ops, so middleware doesn't gate
 * it) listing of sellable remnants for the /drops page. Reuses the exact
 * same lib/remnants/store.ts search the operator's remnant register uses
 * (CLAUDE_CODE_BRIEF.md §10), filtered to a public-safe shape: no
 * location_tag (internal rack reference), no consumed remnants.
 */
export async function GET(req: Request): Promise<Response> {
  const p = new URL(req.url).searchParams;
  const minLength = p.get("min_length_in");
  const minWidth = p.get("min_width_in");

  const remnants = await listRemnants({
    material_code: p.get("material_code") || undefined,
    brand: p.get("brand") || undefined,
    certification_tier: p.get("certification_tier") || undefined,
    min_length_in: minLength ? Number(minLength) : undefined,
    min_width_in: minWidth ? Number(minWidth) : undefined,
  });

  const drops = remnants.map((r) => ({
    id: r.id,
    length_in: r.length_in,
    width_in: r.width_in,
    thickness_nominal: r.thickness_nominal,
    material_code: r.lot?.material_code ?? null,
    brand: r.lot?.brand ?? null,
    certification_tier: r.lot?.certification_tier ?? null,
    lot_number: r.lot?.lot_number ?? null,
  }));

  return NextResponse.json({ drops });
}
