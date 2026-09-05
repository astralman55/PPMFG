import type { PricingConfig } from "../pricing/engine";
import { listNestRuns } from "../nest-runs/store";
import { listRemnants } from "../remnants/store";

/**
 * The calibration panel's data - CLAUDE_CODE_BRIEF.md §10: "Realised
 * utilisation and recoverable fraction from nest_runs versus the
 * nest_uplift figures in config, plus remnant conversion rate from the
 * register. This is how the owner knows when to change a number." Nothing
 * here changes a price or writes anything - it's read-only reporting,
 * exactly as the brief scopes it: "The nester does not set customer prices.
 * It measures whether the prices you quoted were right."
 */

export interface CalibrationReport {
  nest_run_count: number;
  avg_utilisation: number | null;
  avg_recoverable_fraction: number | null;
  target_utilisation: number;
  configured_remnant_recovery_rate: number;
  lead_tier_nest_uplifts: { tier: string; label: string; nest_uplift: number }[];
  remnant_count: number;
  remnant_consumed_count: number;
  remnant_conversion_rate: number | null;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export async function buildCalibrationReport(cfg: PricingConfig): Promise<CalibrationReport> {
  const [runs, remnants] = await Promise.all([listNestRuns(), listRemnants({ include_consumed: true })]);
  const consumedCount = remnants.filter((r) => r.consumed_at !== null).length;

  return {
    nest_run_count: runs.length,
    avg_utilisation: average(runs.map((r) => r.utilisation)),
    avg_recoverable_fraction: average(runs.map((r) => r.recoverable_fraction)),
    target_utilisation: cfg.nesting.target_utilization,
    configured_remnant_recovery_rate: cfg.shop.remnant_recovery_rate,
    lead_tier_nest_uplifts: Object.entries(cfg.lead_tiers).map(([code, t]) => ({
      tier: code,
      label: t.label,
      nest_uplift: t.nest_uplift,
    })),
    remnant_count: remnants.length,
    remnant_consumed_count: consumedCount,
    remnant_conversion_rate: remnants.length > 0 ? consumedCount / remnants.length : null,
  };
}
