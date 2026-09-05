"use client";

import { useState } from "react";
import cfgJson from "@/lib/pricing/config.json";
import type { PricingConfig } from "@/lib/pricing/engine";
import type { SoloNestGroup } from "@/lib/pricing/solo-nest";
import { materialSwatch } from "@/app/_marketing/swatches";
import { deriveCutLines, deriveScrapGaps } from "./nest-diagram-geometry";

const CFG = cfgJson as unknown as PricingConfig;

/**
 * CLAUDE_CODE_BRIEF.md §19 (Phase 11) - renders the read-only solo nest
 * preview for one material group. This is deliberately kept visually and
 * textually separate from the NEST tier's statistical uplift (§19.3): the
 * honest caption below always renders, unconditionally, so a customer can
 * never mistake "how my own parts fit alone" for "what will actually get
 * batched and cut."
 */
export function SheetDiagram({ group }: { group: SoloNestGroup }) {
  const [sheetIdx, setSheetIdx] = useState(0);
  const sheet = group.sheets[Math.min(sheetIdx, group.sheets.length - 1)];
  if (!sheet) return null;

  const materialLabel = CFG.materials[group.material_code]?.label ?? group.material_code;
  const swatch = materialSwatch(group.material_code);
  const belowTarget = group.utilisation < CFG.nesting.target_utilization;

  const cutLines = deriveCutLines(sheet);
  const scrapGaps = deriveScrapGaps(sheet);
  const vw = sheet.length_in;
  const vh = sheet.width_in;
  const hatchSize = vw * 0.018;

  return (
    <div className="mt-6 rounded border border-neutral-300 p-4 dark:border-neutral-700">
      <p className="text-sm font-medium">How your order fits on our stock sheet</p>
      <p className="mt-1 text-xs text-neutral-500">
        {materialLabel} - {trimZeros(vw)} x {trimZeros(vh)} in stock sheet
      </p>

      {group.sheets.length > 1 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {group.sheets.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setSheetIdx(i)}
              className={`rounded px-2 py-1 text-xs ${
                i === sheetIdx
                  ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                  : "border border-neutral-300 dark:border-neutral-700"
              }`}
            >
              Sheet {i + 1} of {group.sheets.length}
            </button>
          ))}
        </div>
      ) : null}

      <svg
        viewBox={`0 0 ${vw} ${vh}`}
        className="mt-3 w-full max-w-lg"
        role="img"
        aria-label={`Cut layout preview: ${sheet.placements.length} parts on a ${trimZeros(vw)} by ${trimZeros(vh)} inch sheet of ${materialLabel}`}
      >
        <defs>
          <pattern id={`scrap-hatch-${sheet.index}`} width={hatchSize} height={hatchSize} patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2={hatchSize} stroke="var(--color-rule, #e3e3de)" strokeWidth={hatchSize * 0.3} />
          </pattern>
        </defs>

        <rect x={0} y={0} width={vw} height={vh} fill="var(--color-paper, #fcfcfa)" stroke="var(--color-ink, #14181c)" strokeWidth={vw * 0.006} />

        {sheet.placements.map((p, i) => {
          const fontSize = fittingFontSize(p.label, p.length_in, p.width_in, vw * 0.045);
          return (
            <g key={i}>
              <rect x={p.x} y={p.y} width={p.length_in} height={p.width_in} fill={swatch} stroke="var(--color-ink, #14181c)" strokeWidth={vw * 0.003} />
              <title>{p.label}</title>
              {fontSize ? (
                <text
                  x={p.x + p.length_in / 2}
                  y={p.y + p.width_in / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontFamily="monospace"
                  fontSize={fontSize}
                  fill="var(--color-ink, #14181c)"
                >
                  {p.label}
                </text>
              ) : null}
            </g>
          );
        })}

        {scrapGaps.map((g, i) => (
          <rect key={`gap-${i}`} x={g.x} y={g.y} width={g.length_in} height={g.width_in} fill={`url(#scrap-hatch-${sheet.index})`} />
        ))}

        {sheet.remnants.map((r, i) => {
          if (!r.keepable) {
            return <rect key={`rem-${i}`} x={r.x} y={r.y} width={r.length_in} height={r.width_in} fill={`url(#scrap-hatch-${sheet.index})`} />;
          }
          const label = `${trimZeros(r.length_in)} x ${trimZeros(r.width_in)}`;
          const fontSize = fittingFontSize(label, r.length_in, r.width_in, vw * 0.045);
          return (
            <g key={`rem-${i}`}>
              <rect
                x={r.x}
                y={r.y}
                width={r.length_in}
                height={r.width_in}
                fill="var(--color-amber, #b8710f)"
                fillOpacity={0.15}
                stroke="var(--color-amber, #b8710f)"
                strokeDasharray={`${vw * 0.008} ${vw * 0.005}`}
                strokeWidth={vw * 0.003}
              />
              <title>{`${label} in remnant`}</title>
              {fontSize ? (
                <text
                  x={r.x + r.length_in / 2}
                  y={r.y + r.width_in / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontFamily="monospace"
                  fontSize={fontSize}
                  fill="var(--color-graphite, #6b7280)"
                >
                  {label}
                </text>
              ) : null}
            </g>
          );
        })}

        {cutLines.map((l, i) => (
          <line
            key={i}
            x1={l.x1}
            y1={l.y1}
            x2={l.x2}
            y2={l.y2}
            stroke="var(--color-ink, #14181c)"
            strokeWidth={l.kind === "rip" ? vw * 0.0045 : vw * 0.0022}
            strokeDasharray={l.kind === "crosscut" ? `${vw * 0.01} ${vw * 0.006}` : undefined}
          />
        ))}
      </svg>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-neutral-500">
        <LegendSwatch color={swatch} label="Your parts" />
        <LegendSwatch color="var(--color-amber, #b8710f)" opacity={0.3} dashed label="Keepable remnant" />
        <LegendHatch label="Scrap" />
        <span>— rip cut</span>
        <span className="tracking-widest">┄┄ crosscut</span>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-3 text-xs">
        <div>
          <dt className="text-neutral-500">Sheets required</dt>
          <dd className="font-mono tabular-nums font-medium">
            {group.sheet_count} sheet{group.sheet_count === 1 ? "" : "s"}
          </dd>
        </div>
        <div>
          <dt className="text-neutral-500">Utilisation</dt>
          <dd className="font-mono tabular-nums font-medium">{pct(group.utilisation)} of this sheet</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Recoverable</dt>
          <dd className="font-mono tabular-nums font-medium">{pct(group.recoverable_fraction)} placed or kept</dd>
        </div>
      </dl>

      {/* §19.3 - non-negotiable, unconditional on every render. Do not
          remove, shorten, or gate this behind utilisation. */}
      <p className="mt-3 text-xs text-neutral-500">
        This shows your order alone. Choosing the flexible ship-when-full option below often improves on this by
        combining your cut with other orders on the same sheet — see{" "}
        <a href="#lead-time-table" className="underline">
          lead time comparison
        </a>{" "}
        for the price difference.
      </p>

      {belowTarget ? (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-500">
          Your order uses {pct(group.utilisation)} of this sheet on its own. The NEST option typically improves this
          by batching with other orders — see the{" "}
          <a href="#lead-time-table" className="underline">
            NEST row
          </a>{" "}
          above.
        </p>
      ) : null}
    </div>
  );
}

function LegendSwatch({ color, label, opacity = 1, dashed = false }: { color: string; label: string; opacity?: number; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="inline-block h-2.5 w-2.5"
        style={{ background: color, opacity, border: dashed ? `1px dashed ${color}` : undefined }}
      />
      {label}
    </span>
  );
}

function LegendHatch({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="inline-block h-2.5 w-2.5"
        style={{ backgroundImage: "repeating-linear-gradient(45deg, var(--color-rule, #e3e3de), var(--color-rule, #e3e3de) 1px, transparent 1px, transparent 3px)" }}
      />
      {label}
    </span>
  );
}

/**
 * Returns a font size that fits `text` inside a box.length_in x box.width_in
 * rect, or null if there's no readable size that fits - a label overflowing
 * into a neighbouring part is worse than no label (the <title> tooltip still
 * carries it). Monospace glyphs are ~0.6em wide, so text width is
 * text.length * fontSize * 0.6.
 */
function fittingFontSize(text: string, boxLengthIn: number, boxWidthIn: number, maxFontSize: number): number | null {
  const CHAR_WIDTH_EM = 0.6;
  const MIN_READABLE = maxFontSize * 0.28;
  const byHeight = Math.min(boxWidthIn * 0.7, maxFontSize);
  const byWidth = (boxLengthIn * 0.92) / (text.length * CHAR_WIDTH_EM);
  const size = Math.min(byHeight, byWidth);
  return size >= MIN_READABLE ? size : null;
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function trimZeros(n: number): string {
  return n.toFixed(3).replace(/\.?0+$/, "") || "0";
}
