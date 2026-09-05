"use client";

import { useEffect, useState, type ReactNode } from "react";

interface CalibrationReport {
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

function pct(n: number | null): string {
  return n === null ? "—" : `${(n * 100).toFixed(1)}%`;
}

export default function CalibrationPage() {
  const [report, setReport] = useState<CalibrationReport | null>(null);

  useEffect(() => {
    fetch("/api/ops/calibration")
      .then((r) => r.json())
      .then(setReport);
  }, []);

  if (!report) return <p className="text-sm text-neutral-500">Loading...</p>;

  return (
    <div>
      <h1 className="text-xl font-semibold">Calibration</h1>
      <p className="mt-1 text-sm text-neutral-500">
        What actually happened on the floor, next to what config.json currently assumes. This is how you know when to change a number - it
        doesn&apos;t change anything itself.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card label="Nest runs committed">
          <span className="font-mono text-2xl tabular-nums">{report.nest_run_count}</span>
        </Card>
        <Card label="Realised utilisation (avg)">
          <span className="font-mono text-2xl tabular-nums">{pct(report.avg_utilisation)}</span>
          <span className="ml-2 text-xs text-neutral-500">target_utilization in config: {pct(report.target_utilisation)}</span>
        </Card>
        <Card label="Realised recoverable fraction (avg)">
          <span className="font-mono text-2xl tabular-nums">{pct(report.avg_recoverable_fraction)}</span>
          <span className="ml-2 text-xs text-neutral-500">remnant_recovery_rate in config: {pct(report.configured_remnant_recovery_rate)}</span>
        </Card>
        <Card label="Remnant conversion rate">
          <span className="font-mono text-2xl tabular-nums">{pct(report.remnant_conversion_rate)}</span>
          <span className="ml-2 text-xs text-neutral-500">
            {report.remnant_consumed_count} of {report.remnant_count} logged remnants consumed
          </span>
        </Card>
      </div>

      <h2 className="mt-8 text-sm font-medium text-neutral-500">nest_uplift by lead tier (config.json)</h2>
      <table className="mt-3 w-full max-w-md text-sm">
        <tbody>
          {report.lead_tier_nest_uplifts.map((t) => (
            <tr key={t.tier} className="border-b border-neutral-100 dark:border-neutral-900">
              <td className="py-1.5 pr-4">{t.label}</td>
              <td className="py-1.5 pr-4 font-mono tabular-nums">+{(t.nest_uplift * 100).toFixed(0)}%</td>
            </tr>
          ))}
        </tbody>
      </table>

      {report.nest_run_count === 0 ? (
        <p className="mt-6 text-sm text-neutral-500">No nest runs committed yet - realised figures will appear here once the nest board has been used.</p>
      ) : null}
    </div>
  );
}

function Card({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded border border-neutral-200 p-4 dark:border-neutral-800">
      <p className="text-xs uppercase text-neutral-500">{label}</p>
      <p className="mt-1">{children}</p>
    </div>
  );
}
