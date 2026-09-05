import { NextResponse } from "next/server";
import { buildCalibrationReport } from "@/lib/nesting/calibration";
import cfgJson from "@/lib/pricing/config.json";
import type { PricingConfig } from "@/lib/pricing/engine";

const CFG = cfgJson as unknown as PricingConfig;

export async function GET(): Promise<Response> {
  const report = await buildCalibrationReport(CFG);
  return NextResponse.json(report);
}
