"use client";

import { useEffect, useState } from "react";
import cfgJson from "@/lib/pricing/config.json";
import type { PricingConfig } from "@/lib/pricing/engine";

const CFG = cfgJson as unknown as PricingConfig;

interface NestBoardGroup {
  group_key: { material_code: string; brand: string; certification_tier: string; thickness_nominal: number };
  order_numbers: string[];
  parts_waiting: number;
  oldest_order_age_business_days: number;
  queue_max_age_business_days: number;
  overdue: boolean;
  sheet_count_if_cut_now: number;
  utilisation_if_cut_now: number;
  recoverable_fraction_if_cut_now: number;
  utilisation_if_queue_doubles: number;
}

interface Lot {
  id: string;
  lot_number: string;
  material_code: string;
  brand: string;
  certification_tier: string;
  thickness_nominal: number;
  manufacturer: string;
  mtr_path: string | null;
}

interface CutStep {
  sheet: number;
  op: string;
  detail: string;
  strip?: number;
  part_id?: string;
  order_id?: string;
}

interface CommitResult {
  nestRun: { id: string; sheet_count: number; utilisation: number; recoverable_fraction: number };
  remnants: { length_in: number; width_in: number; thickness_nominal: number }[];
  cutSequence: CutStep[];
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export default function NestBoardPage() {
  const [board, setBoard] = useState<NestBoardGroup[] | null>(null);
  const [lots, setLots] = useState<Lot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);

  function refresh() {
    fetch("/api/ops/nest")
      .then((r) => r.json())
      .then((d) => setBoard(d.board));
    fetch("/api/ops/lots")
      .then((r) => r.json())
      .then((d) => setLots(d.lots));
  }
  useEffect(refresh, []);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!board || !lots) return <p className="text-sm text-neutral-500">Loading...</p>;

  return (
    <div>
      <h1 className="text-xl font-semibold">Nest board</h1>
      <p className="mt-1 text-sm text-neutral-500">Pending-cut lines, grouped by material, brand, thickness and tier.</p>

      {result ? <CommitResultPanel result={result} onClose={() => setResult(null)} /> : null}

      {board.length === 0 ? (
        <p className="mt-6 text-sm text-neutral-500">Nothing pending - every line has a lot assigned.</p>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          {board.map((g) => (
            <GroupCard
              key={JSON.stringify(g.group_key)}
              group={g}
              candidateLots={lots.filter(
                (l) =>
                  l.material_code === g.group_key.material_code &&
                  l.certification_tier === g.group_key.certification_tier &&
                  l.thickness_nominal === g.group_key.thickness_nominal &&
                  (g.group_key.brand === "GENERIC" || l.brand === g.group_key.brand)
              )}
              onError={setError}
              onCommitted={(r) => {
                setResult(r);
                refresh();
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function GroupCard({
  group,
  candidateLots,
  onCommitted,
  onError,
}: {
  group: NestBoardGroup;
  candidateLots: Lot[];
  onCommitted: (r: CommitResult) => void;
  onError: (e: string) => void;
}) {
  const [lotId, setLotId] = useState("");
  const [busy, setBusy] = useState(false);
  const mat = CFG.materials[group.group_key.material_code];
  const brandLabel = group.group_key.brand === "GENERIC" ? "Any approved source" : (mat?.brands?.[group.group_key.brand]?.label ?? group.group_key.brand);

  async function handleCommit() {
    onError("");
    setBusy(true);
    const res = await fetch("/api/ops/nest/commit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...group.group_key, lot_id: lotId }),
    });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) {
      onError(d.error);
      return;
    }
    onCommitted(d);
  }

  return (
    <div className={`rounded border p-4 text-sm ${group.overdue ? "border-red-300 dark:border-red-900" : "border-neutral-200 dark:border-neutral-800"}`}>
      <div className="flex items-baseline justify-between">
        <span className="font-medium">
          {mat?.label ?? group.group_key.material_code} / {brandLabel} / {CFG.certification_tiers[group.group_key.certification_tier]?.label} / {group.group_key.thickness_nominal} in
        </span>
        <span className="font-mono text-xs text-neutral-500">{group.order_numbers.join(", ")}</span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-neutral-500">Parts waiting</dt>
          <dd className="font-mono tabular-nums">{group.parts_waiting}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Oldest order age</dt>
          <dd className={`font-mono tabular-nums ${group.overdue ? "font-semibold text-red-600" : ""}`}>
            {group.oldest_order_age_business_days}d / {group.queue_max_age_business_days}d max
          </dd>
        </div>
        <div>
          <dt className="text-neutral-500">Utilisation if cut now</dt>
          <dd className="font-mono tabular-nums">
            {pct(group.utilisation_if_cut_now)} ({group.sheet_count_if_cut_now} sheet{group.sheet_count_if_cut_now === 1 ? "" : "s"})
          </dd>
        </div>
        <div>
          <dt className="text-neutral-500">If queue doubles</dt>
          <dd className="font-mono tabular-nums">{pct(group.utilisation_if_queue_doubles)}</dd>
        </div>
      </dl>
      {group.overdue ? (
        <p className="mt-2 text-xs text-red-600">Past the {group.queue_max_age_business_days}-business-day queue limit - cut regardless of utilisation.</p>
      ) : null}

      <div className="mt-3 flex items-center gap-2">
        <select
          value={lotId}
          onChange={(e) => setLotId(e.target.value)}
          className="rounded border border-neutral-300 px-2 py-1.5 text-xs dark:border-neutral-700 dark:bg-neutral-900"
        >
          <option value="" disabled>
            Cut from lot...
          </option>
          {candidateLots.map((l) => (
            <option key={l.id} value={l.id}>
              {l.lot_number} ({l.manufacturer}){!l.mtr_path ? " - no MTR" : ""}
            </option>
          ))}
        </select>
        <button
          onClick={handleCommit}
          disabled={!lotId || busy}
          className="rounded bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {busy ? "Running nester..." : "Run nester and commit"}
        </button>
        {candidateLots.length === 0 ? <span className="text-xs text-red-600">No matching lot in the library.</span> : null}
      </div>
    </div>
  );
}

function CommitResultPanel({ result, onClose }: { result: CommitResult; onClose: () => void }) {
  return (
    <div className="mt-6 rounded border border-green-300 bg-green-50 p-4 text-sm dark:border-green-900 dark:bg-green-950">
      <div className="flex items-center justify-between">
        <p className="font-medium">
          Committed: {result.nestRun.sheet_count} sheet{result.nestRun.sheet_count === 1 ? "" : "s"}, {pct(result.nestRun.utilisation)}{" "}
          utilisation, {result.remnants.length} remnant{result.remnants.length === 1 ? "" : "s"} logged.
        </p>
        <button onClick={onClose} className="text-xs text-neutral-500 hover:underline">
          Dismiss
        </button>
      </div>
      <p className="mt-3 text-xs font-medium text-neutral-500 uppercase">Cut sequence</p>
      <ol className="mt-1 list-decimal pl-5 text-xs">
        {result.cutSequence.map((step, i) => (
          <li key={i}>
            Sheet {step.sheet}: {step.op} - {step.detail}
          </li>
        ))}
      </ol>
      {result.remnants.length > 0 ? (
        <>
          <p className="mt-3 text-xs font-medium text-neutral-500 uppercase">Remnants to rack</p>
          <ul className="mt-1 text-xs">
            {result.remnants.map((r, i) => (
              <li key={i}>
                {r.length_in} x {r.width_in} x {r.thickness_nominal} in
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
