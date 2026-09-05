import { NextResponse } from "next/server";
import { buildNestBoard } from "@/lib/nesting/board";
import cfgJson from "@/lib/pricing/config.json";
import type { PricingConfig } from "@/lib/pricing/engine";

const CFG = cfgJson as unknown as PricingConfig;

/** The nest board: pending-cut lines grouped by (material, brand, thickness, tier). */
export async function GET(): Promise<Response> {
  const today = new Date().toISOString().slice(0, 10);
  const board = await buildNestBoard(CFG, today);
  return NextResponse.json({ board });
}
