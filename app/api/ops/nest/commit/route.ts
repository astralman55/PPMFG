import { NextResponse } from "next/server";
import { commitNestRun, NestCommitError } from "@/lib/nesting/commit";
import cfgJson from "@/lib/pricing/config.json";
import type { PricingConfig } from "@/lib/pricing/engine";

const CFG = cfgJson as unknown as PricingConfig;

/** Commits a nest run for one group - see lib/nesting/commit.ts. */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }
  const { material_code, brand, certification_tier, thickness_nominal, lot_id } = (body ?? {}) as Record<string, unknown>;

  if (typeof material_code !== "string" || !material_code) {
    return NextResponse.json({ error: "material_code is required." }, { status: 400 });
  }
  if (typeof brand !== "string" || !brand) {
    return NextResponse.json({ error: "brand is required." }, { status: 400 });
  }
  if (typeof certification_tier !== "string" || !certification_tier) {
    return NextResponse.json({ error: "certification_tier is required." }, { status: 400 });
  }
  if (typeof thickness_nominal !== "number" || !Number.isFinite(thickness_nominal)) {
    return NextResponse.json({ error: "thickness_nominal is required." }, { status: 400 });
  }
  if (typeof lot_id !== "string" || !lot_id) {
    return NextResponse.json({ error: "lot_id is required." }, { status: 400 });
  }

  try {
    const result = await commitNestRun({ material_code, brand, certification_tier, thickness_nominal, lot_id }, CFG);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof NestCommitError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}
