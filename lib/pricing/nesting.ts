/**
 * Guillotine shelf nester - TypeScript port of reference/nesting.py.
 *
 * WHY THIS ALGORITHM AND NOT A GENERAL RECTANGLE PACKER
 * -------------------------------------------------------------------------
 * A sliding table saw can only make edge-to-edge cuts. You rip the sheet into
 * strips, then crosscut each strip into parts. Every cut runs fully across
 * the piece it is cutting. That is the definition of a guillotine
 * constraint, and shelf packing is its exact expression - not an
 * approximation.
 *
 * A free-form maxrects or skyline packer will return layouts with higher
 * paper utilisation that are physically uncuttable on this machine. Do not
 * substitute one. If the shop ever buys a CNC router, revisit this file and
 * only this file.
 *
 * WHAT IT IS FOR
 * -------------------------------------------------------------------------
 * Two jobs, and they are separate:
 *
 *   1. FULFILMENT.  Given the current nest queue, produce a real cut plan:
 *      strip layout, cut sequence, and the list of remnants worth keeping.
 *
 *   2. CALIBRATION. Realised utilisation across many nests is what tells you
 *      the true value of remnant_recovery_rate and the nest_uplift figures
 *      in config.json. The nester does not set customer prices. It measures
 *      whether the prices you quoted were right.
 *
 * Deterministic: a fixed seed and a fixed restart count mean the same queue
 * always produces the same plan. An operator must be able to re-run a nest
 * and get the same sheet back. (The TypeScript port uses its own seeded PRNG
 * rather than reproducing Python's Mersenne Twister bit-for-bit - "the same
 * queue always produces the same plan" only requires this implementation to
 * be internally repeatable, which it is.)
 */

import type { PricingConfig } from "./engine";

/** Raised when a single part cannot fit an empty sheet at all. */
export class NestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NestError";
    Object.setPrototypeOf(this, NestError.prototype);
  }
}

function round_to(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One physical blank to be cut. qty is expanded before nesting. */
export class NestPart {
  part_id: string;
  order_id: string;
  length_in: number;
  width_in: number;
  rotatable: boolean;

  constructor(part_id: string, order_id: string, length_in: number, width_in: number, rotatable = true) {
    this.part_id = part_id;
    this.order_id = order_id;
    this.length_in = length_in;
    this.width_in = width_in;
    this.rotatable = rotatable;
  }

  get area(): number {
    return this.length_in * this.width_in;
  }
}

export interface Placement {
  part_id: string;
  order_id: string;
  x: number;
  y: number;
  length_in: number;
  width_in: number;
  rotated: boolean;
  strip_index: number;
}

export class Remnant {
  length_in: number;
  width_in: number;
  x: number;
  y: number;
  source: "strip_tail" | "sheet_tail";
  keepable: boolean;

  constructor(
    length_in: number,
    width_in: number,
    x: number,
    y: number,
    source: "strip_tail" | "sheet_tail",
    keepable: boolean
  ) {
    this.length_in = length_in;
    this.width_in = width_in;
    this.x = x;
    this.y = y;
    this.source = source;
    this.keepable = keepable;
  }

  get area(): number {
    return this.length_in * this.width_in;
  }
}

export class Sheet {
  index: number;
  length_in: number;
  width_in: number;
  placements: Placement[] = [];
  remnants: Remnant[] = [];

  constructor(index: number, length_in: number, width_in: number) {
    this.index = index;
    this.length_in = length_in;
    this.width_in = width_in;
  }

  get area(): number {
    return this.length_in * this.width_in;
  }

  get placed_area(): number {
    return this.placements.reduce((s, p) => s + p.length_in * p.width_in, 0);
  }

  get utilisation(): number {
    return this.area ? this.placed_area / this.area : 0.0;
  }

  get keepable_remnant_area(): number {
    return this.remnants.filter((r) => r.keepable).reduce((s, r) => s + r.area, 0);
  }

  get scrap_area(): number {
    return this.area - this.placed_area - this.keepable_remnant_area;
  }
}

// ---------------------------------------------------------------------------
// Core packer
// ---------------------------------------------------------------------------

interface StripState {
  y: number;
  height: number;
  cursor_x: number;
}

interface PackState {
  sheet: Sheet;
  strips: StripState[];
  w_used: number;
}

/**
 * One deterministic pass of shelf packing over a given part ORDER.
 *
 * Geometry convention: strips run the full usable LENGTH of the sheet. Strip
 * height consumes usable WIDTH. Parts sit along a strip in x.
 */
function _pack_once(
  parts: NestPart[],
  sheet_l: number,
  sheet_w: number,
  kerf: number,
  trim: number,
  min_keep: number,
  allow_rotation: boolean
): Sheet[] {
  const usable_l = sheet_l - 2 * trim;
  const usable_w = sheet_w - 2 * trim;

  const sheets: Sheet[] = [];

  function new_sheet(): PackState {
    return { sheet: new Sheet(sheets.length, sheet_l, sheet_w), strips: [], w_used: 0.0 };
  }

  let state = new_sheet();

  function close_sheet(st: PackState): void {
    const sh = st.sheet;
    // Tail of every strip becomes a remnant.
    st.strips.forEach((strip) => {
      const tail = usable_l - strip.cursor_x;
      if (tail > 0) {
        const keep = tail >= min_keep && strip.height >= min_keep;
        sh.remnants.push(
          new Remnant(
            round_to(tail, 4),
            round_to(strip.height, 4),
            round_to(trim + strip.cursor_x, 4),
            round_to(trim + strip.y, 4),
            "strip_tail",
            keep
          )
        );
      }
    });
    // Unused band across the bottom of the sheet.
    const band = usable_w - st.w_used;
    if (band > 0) {
      const keep = band >= min_keep && usable_l >= min_keep;
      sh.remnants.push(
        new Remnant(round_to(usable_l, 4), round_to(band, 4), round_to(trim, 4), round_to(trim + st.w_used, 4), "sheet_tail", keep)
      );
    }
    sheets.push(sh);
  }

  for (const part of parts) {
    const orientations: [number, number, boolean][] = [[part.length_in, part.width_in, false]];
    if (allow_rotation && part.rotatable && part.length_in !== part.width_in) {
      orientations.push([part.width_in, part.length_in, true]);
    }

    let placed = false;
    while (!placed) {
      // 1. Best-fit into an existing strip: least leftover strip height.
      let best: [number, number, number, number, boolean, number] | null = null; // waste, si, pl, pw, rot, need
      state.strips.forEach((strip, si) => {
        for (const [pl, pw, rot] of orientations) {
          if (pw > strip.height + 1e-9) continue;
          const need = pl + (strip.cursor_x > 0 ? kerf : 0.0);
          if (strip.cursor_x + need > usable_l + 1e-9) continue;
          const waste = strip.height - pw;
          if (best === null || waste < best[0]) {
            best = [waste, si, pl, pw, rot, need];
          }
        }
      });

      if (best !== null) {
        const [, si, pl, pw, rot, need] = best as [number, number, number, number, boolean, number];
        const strip = state.strips[si];
        const x = strip.cursor_x + (strip.cursor_x > 0 ? kerf : 0.0);
        state.sheet.placements.push({
          part_id: part.part_id,
          order_id: part.order_id,
          x: round_to(trim + x, 4),
          y: round_to(trim + strip.y, 4),
          length_in: pl,
          width_in: pw,
          rotated: rot,
          strip_index: si,
        });
        strip.cursor_x += need;
        placed = true;
        continue;
      }

      // 2. Open a new strip. Prefer the orientation that wastes least width.
      let opened = false;
      const byWidth = [...orientations].sort((a, b) => a[1] - b[1]);
      for (const [pl, pw, rot] of byWidth) {
        const need_w = pw + (state.strips.length > 0 ? kerf : 0.0);
        if (state.w_used + need_w <= usable_w + 1e-9 && pl <= usable_l + 1e-9) {
          const y = state.w_used + (state.strips.length > 0 ? kerf : 0.0);
          state.strips.push({ y, height: pw, cursor_x: 0.0 });
          state.w_used = y + pw;
          const si = state.strips.length - 1;
          state.sheet.placements.push({
            part_id: part.part_id,
            order_id: part.order_id,
            x: round_to(trim, 4),
            y: round_to(trim + y, 4),
            length_in: pl,
            width_in: pw,
            rotated: rot,
            strip_index: si,
          });
          state.strips[si].cursor_x = pl;
          opened = true;
          placed = true;
          break;
        }
      }
      if (opened) continue;

      // 3. Sheet is full. Close it and start another.
      if (state.sheet.placements.length === 0) {
        throw new NestError(
          `Part ${part.part_id} (${part.length_in} x ${part.width_in} in) ` +
            `does not fit a ${sheet_l} x ${sheet_w} in sheet after edge trim.`
        );
      }
      close_sheet(state);
      state = new_sheet();
    }
  }

  close_sheet(state);
  return sheets;
}

// ---------------------------------------------------------------------------
// Multi-restart driver
// ---------------------------------------------------------------------------

/** Small deterministic PRNG (mulberry32), seeded per call for restart shuffles. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function rand(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seeded_shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function compare_key(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

export interface NestResult {
  sheets: Sheet[];
  summary: NestSummary;
}

/**
 * Run several deterministic orderings and keep the best plan.
 *
 * Objective, in order: fewest sheets, then highest recoverable fraction
 * (placed + keepable remnant), then highest raw utilisation. Fewest sheets
 * dominates because a second sheet is a whole new material commitment.
 */
export function nest(
  parts: NestPart[],
  sheet_l: number,
  sheet_w: number,
  cfg: PricingConfig,
  seed = 20260903
): NestResult {
  const n = cfg.nesting;
  const kerf = cfg.shop.kerf_in;
  const trim = cfg.shop.datum_trim_per_edge_in;
  const min_keep = n.min_remnant_keep_in;
  const allow_rot = n.allow_rotation;
  const restarts = n.restarts;

  if (parts.length === 0) {
    return { sheets: [], summary: _summarise([], sheet_l, sheet_w, 0.0) };
  }

  const total_part_area = parts.reduce((s, p) => s + p.area, 0);

  // Deterministic candidate orderings.
  const orders: NestPart[][] = [
    [...parts].sort(
      (a, b) => Math.max(b.length_in, b.width_in) - Math.max(a.length_in, a.width_in) || b.area - a.area
    ),
    [...parts].sort(
      (a, b) => Math.min(b.length_in, b.width_in) - Math.min(a.length_in, a.width_in) || b.area - a.area
    ),
    [...parts].sort((a, b) => b.area - a.area),
    [...parts].sort((a, b) => b.width_in - a.width_in || b.length_in - a.length_in),
    [...parts].sort((a, b) => b.length_in - a.length_in || b.width_in - a.width_in),
  ];
  const rand = mulberry32(seed);
  const base = [...parts].sort((a, b) => b.area - a.area);
  for (let i = 0; i < Math.max(0, restarts - orders.length); i++) {
    orders.push(seeded_shuffle(base, rand));
  }

  let best: Sheet[] | null = null;
  let best_key: readonly number[] | null = null;
  for (const order of orders) {
    const sheets = _pack_once(order, sheet_l, sheet_w, kerf, trim, min_keep, allow_rot);
    const placed = sheets.reduce((s, sh) => s + sh.placed_area, 0);
    const keepable = sheets.reduce((s, sh) => s + sh.keepable_remnant_area, 0);
    const total = sheets.reduce((s, sh) => s + sh.area, 0);
    const key = [sheets.length, -(placed + keepable) / total, -placed / total] as const;
    if (best_key === null || compare_key(key, best_key) < 0) {
      best_key = key;
      best = sheets;
    }
  }

  const bestSheets = best as Sheet[];
  return { sheets: bestSheets, summary: _summarise(bestSheets, sheet_l, sheet_w, total_part_area) };
}

export interface NestSummary {
  sheet_count: number;
  sheet_area_in2: number;
  placed_area_in2: number;
  keepable_remnant_area_in2: number;
  scrap_area_in2: number;
  utilisation: number;
  recoverable_fraction: number;
  scrap_fraction: number;
  orders_on_sheet: string[];
  order_count: number;
  eta_realised: number;
}

function _summarise(
  sheets: Sheet[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for parity with nesting.py: sheet_l is accepted but never read here
  sheet_l: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for parity with nesting.py: sheet_w is accepted but never read here
  sheet_w: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for parity with nesting.py: total_part_area is accepted but never read here
  total_part_area: number
): NestSummary {
  if (sheets.length === 0) {
    return {
      sheet_count: 0,
      sheet_area_in2: 0.0,
      placed_area_in2: 0.0,
      keepable_remnant_area_in2: 0.0,
      scrap_area_in2: 0.0,
      utilisation: 0.0,
      recoverable_fraction: 0.0,
      scrap_fraction: 0.0,
      orders_on_sheet: [],
      order_count: 0,
      eta_realised: 0.0,
    };
  }
  const sheet_area = sheets.reduce((s, sh) => s + sh.area, 0);
  const placed = sheets.reduce((s, sh) => s + sh.placed_area, 0);
  const keepable = sheets.reduce((s, sh) => s + sh.keepable_remnant_area, 0);
  const scrap = sheet_area - placed - keepable;
  const orders = Array.from(new Set(sheets.flatMap((sh) => sh.placements.map((p) => p.order_id)))).sort();
  return {
    sheet_count: sheets.length,
    sheet_area_in2: round_to(sheet_area, 2),
    placed_area_in2: round_to(placed, 2),
    keepable_remnant_area_in2: round_to(keepable, 2),
    scrap_area_in2: round_to(scrap, 2),
    utilisation: round_to(placed / sheet_area, 4),
    recoverable_fraction: round_to((placed + keepable) / sheet_area, 4),
    scrap_fraction: round_to(scrap / sheet_area, 4),
    orders_on_sheet: orders,
    order_count: orders.length,
    // This is the number that should be fed back into config as the
    // calibrated remnant_recovery_rate / nest_uplift evidence base.
    eta_realised: round_to((placed + keepable) / sheet_area, 4),
  };
}

// ---------------------------------------------------------------------------
// Queue grouping
// ---------------------------------------------------------------------------

export interface QueueRow {
  order_id: string;
  line_no?: number;
  material_code: string;
  brand: string;
  thickness_nominal: number;
  certification_tier: string;
  length_in: number;
  width_in: number;
  qty: number;
}

export interface NestGroup {
  key: (string | number)[];
  rows: QueueRow[];
}

/**
 * Split the pending-cut queue into nestable groups.
 *
 * You can only share a sheet between orders that agree on material, brand,
 * thickness AND certification tier. Mixing a Tier 1 traceable order onto an
 * industrial-grade sheet destroys the lineage claim on both.
 */
export function group_queue(queue_rows: QueueRow[], cfg: PricingConfig): NestGroup[] {
  const key_fields = cfg.nesting.queue_group_key as (keyof QueueRow)[];
  const groups: NestGroup[] = [];
  const index = new Map<string, NestGroup>();
  for (const row of queue_rows) {
    const key = key_fields.map((f) => row[f] as string | number);
    const encoded = JSON.stringify(key);
    let group = index.get(encoded);
    if (!group) {
      group = { key, rows: [] };
      index.set(encoded, group);
      groups.push(group);
    }
    group.rows.push(row);
  }
  return groups;
}

/** Expand qty into individual blanks, applying the cut allowance and grain rule. */
export function expand_to_parts(queue_rows: QueueRow[], cfg: PricingConfig): NestPart[] {
  const delta = 2 * cfg.shop.kerf_in; // per-part kerf allowance; edge trim handled at sheet level
  const block_rot = cfg.nesting.rotation_blocked_for_grain_sensitive;
  const parts: NestPart[] = [];
  for (const row of queue_rows) {
    const mat = cfg.materials[row.material_code];
    const rotatable = !(block_rot && mat.grain_sensitive);
    for (let i = 0; i < row.qty; i++) {
      parts.push(
        new NestPart(
          `${row.order_id}-L${row.line_no ?? 1}-${i + 1}`,
          row.order_id,
          row.length_in + delta,
          row.width_in + delta,
          rotatable
        )
      );
    }
  }
  return parts;
}

export interface NestPlan {
  group_key: Record<string, string | number>;
  part_count: number;
  sheets: Sheet[];
  summary: NestSummary;
  cut_sequence: CutStep[];
}

/**
 * Full fulfilment plan: group the queue, nest each group, return cut plans.
 * This is what the operator console calls.
 */
export function plan_nest(queue_rows: QueueRow[], cfg: PricingConfig): NestPlan[] {
  const plans: NestPlan[] = [];
  for (const { key, rows } of group_queue(queue_rows, cfg)) {
    const material_code = rows[0].material_code;
    const mat = cfg.materials[material_code];
    const parts = expand_to_parts(rows, cfg);
    const result = nest(parts, mat.sheet_length_in, mat.sheet_width_in, cfg);
    const group_key: Record<string, string | number> = {};
    cfg.nesting.queue_group_key.forEach((field, i) => {
      group_key[field] = key[i];
    });
    plans.push({
      group_key,
      part_count: parts.length,
      sheets: result.sheets,
      summary: result.summary,
      cut_sequence: build_cut_sequence(result.sheets),
    });
  }
  plans.sort((a, b) => b.summary.sheet_area_in2 - a.summary.sheet_area_in2);
  return plans;
}

export interface CutStep {
  sheet: number;
  op: "TRIM" | "RIP" | "CROSSCUT" | "LOG_REMNANT";
  detail: string;
  strip?: number;
  part_id?: string;
  order_id?: string;
}

/**
 * Operator-readable cut list. Rips first, then crosscuts per strip. This is
 * the order the saw is actually driven in, and it is what the fulfilment
 * screen prints.
 */
export function build_cut_sequence(sheets: Sheet[]): CutStep[] {
  const steps: CutStep[] = [];
  for (const sh of sheets) {
    const strips = new Map<number, Placement[]>();
    for (const p of sh.placements) {
      const arr = strips.get(p.strip_index) ?? [];
      arr.push(p);
      strips.set(p.strip_index, arr);
    }
    steps.push({ sheet: sh.index, op: "TRIM", detail: "Trim two reference edges to establish datum" });

    const stripIndices = Array.from(strips.keys()).sort((a, b) => a - b);
    for (const si of stripIndices) {
      const h = Math.max(...strips.get(si)!.map((p) => p.width_in));
      steps.push({ sheet: sh.index, op: "RIP", strip: si, detail: `Rip strip ${si + 1} to ${h.toFixed(3)} in` });
    }
    for (const si of stripIndices) {
      const ordered = [...strips.get(si)!].sort((a, b) => a.x - b.x);
      for (const p of ordered) {
        steps.push({
          sheet: sh.index,
          op: "CROSSCUT",
          strip: si,
          part_id: p.part_id,
          order_id: p.order_id,
          detail: `Crosscut ${p.length_in.toFixed(3)} in` + (p.rotated ? " (rotated)" : ""),
        });
      }
    }
    for (const r of sh.remnants) {
      if (r.keepable) {
        steps.push({
          sheet: sh.index,
          op: "LOG_REMNANT",
          detail: `Label and rack ${r.length_in.toFixed(2)} x ${r.width_in.toFixed(2)} in`,
        });
      }
    }
  }
  return steps;
}
