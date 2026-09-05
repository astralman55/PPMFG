/**
 * Quote engine v2 - TypeScript port of reference/pricing_engine.py.
 *
 * This module is the NUMERICAL SPECIFICATION for the business, ported
 * exactly: same module boundaries, same variable names, same order of
 * operations as the Python reference. Do not "improve" it here - if the
 * Python and this file ever disagree, the Python is the oracle
 * (see lib/pricing/__tests__/golden.test.ts).
 *
 * Pure function: input in, result out. No I/O, no fetch, no Date.now().
 * The caller passes both the order date and the parsed config.json.
 *
 * MODULES
 *   1   Material cost basis        brand + certification tier -> $/in^2
 *   2   Consumed footprint         yield, brand-lock penalty, nest uplift
 *   3   Cut time                   + tolerance passes
 *   4   Handling & labor           + finish ops, inspection, add-on labor
 *   5   Consumables                blade destruction, packaging, finish materials
 *   6   Compliance & add-ons
 *   7   Annealing                  oven-hours, not labor-hours
 *   8   Rework risk                expected cost of a part going out of spec
 *   9   Margin, floor, rush
 *   10  Freight                    dimensional weight + local delivery
 *   11  Lead time                  business-day calendar, composite batch days
 */

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Raised for any input the engine refuses to price. Message is customer-facing. */
export class QuoteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuoteError";
    Object.setPrototypeOf(this, QuoteError.prototype);
  }
}

// ---------------------------------------------------------------------------
// Config shape - mirrors config.json exactly
// ---------------------------------------------------------------------------

export interface MaterialBrand {
  label: string;
  price_multiplier: number;
  avl_common: boolean;
}

export interface MaterialSpec {
  label: string;
  family: string;
  density_lb_in3: number;
  price_per_lb: number;
  cut_class: string;
  abrasion: number;
  blade_group: string;
  nest_efficiency: number;
  stock_thicknesses_in: number[];
  sheet_length_in: number;
  sheet_width_in: number;
  thickness_oversize_in: number;
  residual_stress_flag: boolean;
  filled_grade: boolean;
  solvent_stress_crack_sensitive: boolean;
  grain_sensitive: boolean;
  itar_controlled: boolean;
  grain_note?: string;
  brands: Record<string, MaterialBrand>;
  notes?: string;
}

export interface AddOnSpec {
  label: string;
  price: number;
  per: "order" | "line" | "part";
  labor_min?: number;
  labor_min_per_part?: number;
  consumable_per_part?: number;
  tier1_only?: boolean;
  forces_tolerance_min?: string;
  note?: string;
}

export interface PricingConfig {
  schema_version: string;
  revision_date: string;
  notes?: string;
  shop: {
    kerf_in: number;
    datum_trim_per_edge_in: number;
    approach_overtravel_in: number;
    datum_amortization_factor: number;
    burdened_rate_per_hr: number;
    remnant_recovery_rate: number;
    brand_lock_rho_factor: number;
    eta_effective_cap: number;
    price_floor: number;
    order_intake_fee: number;
    sourcing_mode: string;
    sourcing_mode_options: string[];
    jit_passthru_markup: number;
  };
  labor: {
    t_setup_min: number;
    t_load_base_min: number;
    t_load_per_lb_min: number;
    t_part_base_min: number;
    t_part_area_coeff_min: number;
    t_remnant_min: number;
    t_blade_change_min: number;
    learning_curve: number;
  };
  certification_tiers: Record<
    string,
    {
      label: string;
      description: string;
      price_multiplier: number;
      traceability_available: boolean;
      dfars_statement: boolean;
      brand_selection_allowed: boolean;
      blocked_addons: string[];
    }
  >;
  tolerance_tiers: Record<
    string,
    {
      label: string;
      tolerance_in: number;
      squareness_in_per_12in: number;
      extra_passes: number;
      inspection_min_per_part: number;
      inspection_sampling: string;
      max_dim_in: number;
      p_rework_base: number;
      requires_temperature_stabilization?: boolean;
      stabilization_hours?: number;
    }
  >;
  rework_model: {
    size_factor_per_12in_over: number;
    residual_stress_multiplier: number;
    filled_grade_multiplier: number;
    severity: number;
  };
  edge_finish: Record<
    string,
    {
      label: string;
      description?: string;
      min_per_in_perimeter: number;
      passes_perimeter: number;
      included: boolean;
      disclose?: string;
    }
  >;
  face_finish: Record<
    string,
    {
      label: string;
      description?: string;
      min_per_sqft: number;
      min_per_part: number;
      material_cost_per_sqft: number;
      included: boolean;
      solvent_default?: string;
      solvent_for_stress_crack_sensitive?: string;
      solvent_note?: string;
    }
  >;
  add_ons: Record<string, AddOnSpec>;
  annealing: {
    enabled: boolean;
    label: string;
    description?: string;
    ramp_hours: number;
    soak_hours_per_in_thickness: number;
    oven_rate_per_hr: number;
    batch_divisor: number;
    handling_min: number;
    adds_business_days: number;
    blocks_lead_tiers: string[];
    eligible_materials: string[];
    rework_reduction_factor: number;
  };
  consumables: {
    packaging_base: number;
    packaging_per_part: number;
    blades: Record<
      string,
      {
        label: string;
        blade_cost: number;
        sharpen_cost: number;
        n_sharpenings: number;
        base_life_in: number;
      }
    >;
  };
  compliance: {
    per_order: number;
    per_line_item: number;
  };
  margin_curve: {
    type: string;
    anchors: { cogs: number; margin: number }[];
  };
  lead_tiers: Record<
    string,
    {
      label: string;
      multiplier: number;
      nest_uplift: number;
      cutoff_local: string;
      ship_offset_business_days: number;
      allows_batching: boolean;
      customer_copy?: string;
    }
  >;
  /** Not read by the pricing engine itself - used by lib/pricing/nesting.ts. */
  nesting: {
    algorithm: string;
    restarts: number;
    allow_rotation: boolean;
    rotation_blocked_for_grain_sensitive: boolean;
    queue_max_age_business_days: number;
    queue_group_key: string[];
    min_remnant_keep_in: number;
    target_utilization: number;
  };
  cut_time_classes: Record<string, { c0: number; c1: number }>;
  freight: {
    dim_divisor: number;
    box_pad_length_in: number;
    box_pad_width_in: number;
    box_pad_height_in: number;
    packaging_tare_base_lb: number;
    packaging_tare_per_sqft_lb: number;
    handling_adder: number;
    local_delivery?: {
      enabled: boolean;
      zips: string[];
      flat_rate: number;
      free_over: number;
      note?: string;
    };
    fallback_rate_ladder: { max_lb: number; rate: number }[];
  };
  payments: {
    stripe_pct: number;
    stripe_fixed: number;
    gross_up_enabled: boolean;
  };
  sanity_rails: {
    gamma_max: number;
    gamma_min: number;
  };
  competitive_context: {
    curbell_fabrication_minimum: number;
    show_minimum_comparison_below: number;
  };
  geometry_limits: {
    min_dim_in: number;
    max_dim_in: number;
    min_qty: number;
    max_qty_per_line: number;
    max_line_items: number;
    dimension_decimal_places: number;
  };
  calendar: {
    business_days: string[];
    holidays: string[];
    composite_batch_days: string[];
    timezone: string;
  };
  quote: {
    validity_hours: number;
  };
  materials: Record<string, MaterialSpec>;
}

// ---------------------------------------------------------------------------
// Input contract
// ---------------------------------------------------------------------------

export interface LineItemInput {
  material_code: string;
  length_in: number;
  width_in: number;
  thickness_in: number;
  qty?: number;
  part_ref?: string;
  brand?: string;
  certification_tier?: string;
  tolerance_tier?: string;
  edge_finish?: string;
  face_finish?: string;
  anneal?: boolean;
  add_ons?: string[] | null;
}

export interface QuoteRequestInput {
  lines: LineItemInput[];
  lead_tier?: string;
  dest_zip?: string;
  order_add_ons?: string[] | null;
  sourcing_mode?: string | null;
  dropcut_quoted_cost?: number | null;
  /** ISO date "YYYY-MM-DD". Falls back to a fixed reference date, never the wall clock. */
  order_date?: string | null;
}

/** Normalised, mutable line item. tolerance_tier can be upgraded by apply_forced_upgrades. */
interface LineItem {
  material_code: string;
  length_in: number;
  width_in: number;
  thickness_in: number;
  qty: number;
  part_ref: string;
  brand: string;
  certification_tier: string;
  tolerance_tier: string;
  edge_finish: string;
  face_finish: string;
  anneal: boolean;
  add_ons: string[];
}

interface QuoteRequest {
  lines: LineItem[];
  lead_tier: string;
  dest_zip: string;
  order_add_ons: string[];
  sourcing_mode: string | null;
  dropcut_quoted_cost: number | null;
  order_date: string | null;
}

function normalise_line_item(input: LineItemInput): LineItem {
  return {
    material_code: input.material_code,
    length_in: input.length_in,
    width_in: input.width_in,
    thickness_in: input.thickness_in,
    qty: input.qty ?? 1,
    part_ref: input.part_ref ?? "",
    brand: input.brand ?? "GENERIC",
    certification_tier: input.certification_tier ?? "TIER1_TRACEABLE",
    tolerance_tier: input.tolerance_tier ?? "STANDARD",
    edge_finish: input.edge_finish ?? "DEBURRED",
    face_finish: input.face_finish ?? "AS_SUPPLIED",
    anneal: input.anneal ?? false,
    add_ons: input.add_ons ?? [],
  };
}

function normalise_request(input: QuoteRequestInput): QuoteRequest {
  return {
    lines: input.lines.map(normalise_line_item),
    lead_tier: input.lead_tier ?? "STD",
    dest_zip: input.dest_zip ?? "92020",
    order_add_ons: input.order_add_ons ?? [],
    sourcing_mode: input.sourcing_mode ?? null,
    dropcut_quoted_cost: input.dropcut_quoted_cost ?? null,
    order_date: input.order_date ?? null,
  };
}

// ---------------------------------------------------------------------------
// Small formatting helpers (mirror Python's f"{x:g}" / f"{x:,.2f}" specifiers)
// ---------------------------------------------------------------------------

/** Mimics Python's "%g" (6 significant digits, trailing zeros stripped). */
function fmt_g(n: number): string {
  if (n === 0) return "0";
  let s = n.toPrecision(6);
  if (s.includes("e") || s.includes("E")) return String(n);
  if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, "");
  return s;
}

function fmt_money(n: number, decimals: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function round_to(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validate(req: QuoteRequest, cfg: PricingConfig): void {
  const g = cfg.geometry_limits;

  if (req.lines.length === 0) {
    throw new QuoteError("Quote contains no line items.");
  }
  if (req.lines.length > g.max_line_items) {
    throw new QuoteError(
      `${req.lines.length} line items exceeds the ${g.max_line_items} line limit. ` +
        "Split into separate orders or request a manual quote."
    );
  }
  if (!(req.lead_tier in cfg.lead_tiers)) {
    throw new QuoteError(`Unknown lead time option '${req.lead_tier}'.`);
  }

  for (const name of req.order_add_ons) {
    if (!(name in cfg.add_ons)) {
      throw new QuoteError(`Unknown option '${name}'.`);
    }
  }

  req.lines.forEach((ln, idx) => {
    const i = idx + 1;
    const mat = cfg.materials[ln.material_code];
    if (mat === undefined) {
      throw new QuoteError(`Line ${i}: unknown material '${ln.material_code}'.`);
    }

    const tier = cfg.certification_tiers[ln.certification_tier];
    if (tier === undefined) {
      throw new QuoteError(`Line ${i}: unknown certification tier '${ln.certification_tier}'.`);
    }

    const tol = cfg.tolerance_tiers[ln.tolerance_tier];
    if (tol === undefined) {
      throw new QuoteError(`Line ${i}: unknown tolerance option '${ln.tolerance_tier}'.`);
    }

    if (!(ln.edge_finish in cfg.edge_finish)) {
      throw new QuoteError(`Line ${i}: unknown edge finish '${ln.edge_finish}'.`);
    }
    if (!(ln.face_finish in cfg.face_finish)) {
      throw new QuoteError(`Line ${i}: unknown face finish '${ln.face_finish}'.`);
    }

    // Brand
    if (!(ln.brand in mat.brands)) {
      const avail = Object.keys(mat.brands).join(", ");
      throw new QuoteError(
        `Line ${i}: '${ln.brand}' is not a stocked source for ${mat.label}. Available: ${avail}.`
      );
    }
    if (ln.brand !== "GENERIC" && !tier.brand_selection_allowed) {
      throw new QuoteError(
        `Line ${i}: a named mill source requires the Tier 1 traceable option. ` +
          "Industrial grade carries no mill lineage."
      );
    }

    // Add-ons vs tier
    for (const name of [...ln.add_ons, ...req.order_add_ons]) {
      const spec = cfg.add_ons[name];
      if (spec === undefined) {
        throw new QuoteError(`Line ${i}: unknown option '${name}'.`);
      }
      if (tier.blocked_addons.includes(name)) {
        throw new QuoteError(
          `Line ${i}: ${spec.label} is not available on ${tier.label}. ` +
            "Switch this line to Tier 1 traceable."
        );
      }
      if (spec.tier1_only && ln.certification_tier !== "TIER1_TRACEABLE") {
        throw new QuoteError(`Line ${i}: ${spec.label} requires Tier 1 traceable material.`);
      }
    }

    // Geometry
    for (const [nm, val] of [
      ["length", ln.length_in],
      ["width", ln.width_in],
    ] as const) {
      if (val < g.min_dim_in) {
        throw new QuoteError(`Line ${i}: ${nm} ${val} in is below the ${g.min_dim_in} in minimum.`);
      }
      if (val > g.max_dim_in) {
        throw new QuoteError(
          `Line ${i}: ${nm} ${val} in exceeds the ${g.max_dim_in} in crosscut capacity.`
        );
      }
    }

    const max_dim = Math.max(ln.length_in, ln.width_in);
    if (max_dim > tol.max_dim_in) {
      throw new QuoteError(
        `Line ${i}: ${tol.label} is only held up to ${fmt_g(tol.max_dim_in)} in. ` +
          `This part is ${fmt_g(max_dim)} in. Choose a wider tolerance or request a manual quote.`
      );
    }

    const delta = 2 * cfg.shop.kerf_in + 2 * cfg.shop.datum_trim_per_edge_in;
    const long_side = Math.max(ln.length_in, ln.width_in) + delta;
    const short_side = Math.min(ln.length_in, ln.width_in) + delta;
    const sheet_long = Math.max(mat.sheet_length_in, mat.sheet_width_in);
    const sheet_short = Math.min(mat.sheet_length_in, mat.sheet_width_in);
    if (long_side > sheet_long || short_side > sheet_short) {
      throw new QuoteError(
        `Line ${i}: ${fmt_g(ln.length_in)} x ${fmt_g(ln.width_in)} in does not fit ` +
          `${mat.label} stock (${fmt_g(sheet_long)} x ${fmt_g(sheet_short)} in) once kerf ` +
          "and edge trim are allowed."
      );
    }

    if (!mat.stock_thicknesses_in.includes(ln.thickness_in)) {
      const avail = mat.stock_thicknesses_in.map(fmt_g).join(", ");
      throw new QuoteError(
        `Line ${i}: ${fmt_g(ln.thickness_in)} in is not a stocked thickness for ` +
          `${mat.label}. Available: ${avail} in.`
      );
    }

    if (ln.qty < g.min_qty || ln.qty > g.max_qty_per_line) {
      throw new QuoteError(
        `Line ${i}: quantity ${ln.qty} is outside the ${g.min_qty}-${g.max_qty_per_line} range.`
      );
    }

    // Annealing
    if (ln.anneal) {
      const an = cfg.annealing;
      if (!an.enabled) {
        throw new QuoteError(`Line ${i}: stress-relief annealing is not currently offered.`);
      }
      if (!an.eligible_materials.includes(ln.material_code)) {
        throw new QuoteError(`Line ${i}: ${mat.label} is not annealed in house.`);
      }
      if (an.blocks_lead_tiers.includes(req.lead_tier)) {
        throw new QuoteError(
          `Line ${i}: an anneal cycle cannot be completed on ` +
            `${cfg.lead_tiers[req.lead_tier].label.toLowerCase()}. ` +
            "Choose a 2-day or longer lead time."
        );
      }
    }
  });

  if (req.sourcing_mode !== null && !cfg.shop.sourcing_mode_options.includes(req.sourcing_mode)) {
    throw new QuoteError(`Unknown sourcing mode '${req.sourcing_mode}'.`);
  }
}

/**
 * Some options imply a tighter tolerance than the customer selected. Upgrade
 * silently but tell them, rather than quoting a FAIR against a +/-0.030 cut.
 */
function apply_forced_upgrades(req: QuoteRequest, cfg: PricingConfig): string[] {
  const notes: string[] = [];
  const order_addons = req.order_add_ons;
  const rank: Record<string, number> = { STANDARD: 0, PRECISION: 1, TIGHT: 2 };
  req.lines.forEach((ln, idx) => {
    const i = idx + 1;
    for (const name of [...ln.add_ons, ...order_addons]) {
      const forced = cfg.add_ons[name]?.forces_tolerance_min;
      if (forced && rank[ln.tolerance_tier] < rank[forced]) {
        notes.push(
          `Line ${i}: ${cfg.add_ons[name].label} requires ` +
            `${cfg.tolerance_tiers[forced].label}; upgraded from ` +
            `${cfg.tolerance_tiers[ln.tolerance_tier].label}.`
        );
        ln.tolerance_tier = forced;
      }
    }
  });
  return notes;
}

// ---------------------------------------------------------------------------
// Module 1 - Material cost basis
// ---------------------------------------------------------------------------

interface CostBasis {
  t_actual: number;
  brand: string;
  brand_label: string;
  brand_multiplier: number;
  tier: string;
  tier_label: string;
  tier_multiplier: number;
  effective_price_per_lb: number;
  v_sheet_in3: number;
  wt_sheet_lb: number;
  c_sheet: number;
  c_vol_per_in3: number;
  c_area_per_in2: number;
}

function cost_basis(mat: MaterialSpec, ln: LineItem, cfg: PricingConfig): CostBasis {
  const t_actual = ln.thickness_in + mat.thickness_oversize_in;
  const brand = mat.brands[ln.brand];
  const tier = cfg.certification_tiers[ln.certification_tier];

  const effective_price_lb = mat.price_per_lb * brand.price_multiplier * tier.price_multiplier;

  const v_sheet = mat.sheet_length_in * mat.sheet_width_in * t_actual;
  const wt_sheet = v_sheet * mat.density_lb_in3;
  const c_sheet = wt_sheet * effective_price_lb;
  const c_vol = c_sheet / v_sheet;

  return {
    t_actual,
    brand: ln.brand,
    brand_label: brand.label,
    brand_multiplier: brand.price_multiplier,
    tier: ln.certification_tier,
    tier_label: tier.label,
    tier_multiplier: tier.price_multiplier,
    effective_price_per_lb: effective_price_lb,
    v_sheet_in3: v_sheet,
    wt_sheet_lb: wt_sheet,
    c_sheet,
    c_vol_per_in3: c_vol,
    c_area_per_in2: c_vol * t_actual,
  };
}

// ---------------------------------------------------------------------------
// Module 2 - Consumed footprint, yield, brand lock, nest uplift
// ---------------------------------------------------------------------------

interface Footprint {
  delta_in: number;
  a_net_in2: number;
  a_gross_in2: number;
  eta_nest: number;
  rho_base: number;
  brand_locked: boolean;
  rho_after_brand_lock: number;
  nest_uplift: number;
  rho_effective: number;
  eta_eff: number;
  a_bill_in2: number;
  c_mat: number;
}

function footprint(
  ln: LineItem,
  mat: MaterialSpec,
  basis: CostBasis,
  cfg: PricingConfig,
  lead_tier: string,
  sourcing_mode: string,
  dropcut_cost: number | null
): Footprint {
  const shop = cfg.shop;
  const delta = 2 * shop.kerf_in + 2 * shop.datum_trim_per_edge_in;

  const a_net = ln.length_in * ln.width_in;
  const a_gross = (ln.length_in + delta) * (ln.width_in + delta);

  const rho_base = shop.remnant_recovery_rate;
  const brand_locked = ln.brand !== "GENERIC";
  const rho_after_lock = rho_base * (brand_locked ? shop.brand_lock_rho_factor : 1.0);

  const uplift = cfg.lead_tiers[lead_tier].nest_uplift;
  const rho_eff = rho_after_lock + uplift;

  const eta_nest = mat.nest_efficiency;
  const eta_eff = Math.min(shop.eta_effective_cap, eta_nest + rho_eff * (1.0 - eta_nest));
  const a_bill = a_gross / eta_eff;

  let c_mat: number;
  if (sourcing_mode === "JIT_DROPCUT") {
    const base = dropcut_cost !== null ? dropcut_cost : a_gross * basis.c_area_per_in2 * ln.qty;
    c_mat = base * (1.0 + shop.jit_passthru_markup);
  } else {
    c_mat = a_bill * basis.c_area_per_in2 * ln.qty;
  }

  return {
    delta_in: delta,
    a_net_in2: a_net,
    a_gross_in2: a_gross,
    eta_nest,
    rho_base,
    brand_locked,
    rho_after_brand_lock: rho_after_lock,
    nest_uplift: uplift,
    rho_effective: rho_eff,
    eta_eff,
    a_bill_in2: a_bill,
    c_mat,
  };
}

// ---------------------------------------------------------------------------
// Module 3 - Cut time
// ---------------------------------------------------------------------------

interface CutTime {
  tau_s_per_in: number;
  l_cut_first_in: number;
  l_cut_subsequent_in: number;
  l_base_in: number;
  extra_passes: number;
  l_extra_in: number;
  l_total_in: number;
  t_cut_min: number;
}

function cut_time(ln: LineItem, mat: MaterialSpec, basis: CostBasis, cfg: PricingConfig): CutTime {
  const klass = cfg.cut_time_classes[mat.cut_class];
  const tau = klass.c0 + klass.c1 * basis.t_actual;
  const tol = cfg.tolerance_tiers[ln.tolerance_tier];

  const ot = cfg.shop.approach_overtravel_in;
  const l_cut_1 = 2 * (ln.length_in + ln.width_in) + 4 * ot;
  const l_cut_n = ln.length_in + ln.width_in + 2 * ot;

  const l_base = cfg.shop.datum_amortization_factor * l_cut_1 + (ln.qty - 1) * l_cut_n;

  // Each extra tolerance pass re-cuts the full perimeter of every part at a
  // reduced feed. Reduced feed is captured by the pass_feed_penalty.
  const extra = tol.extra_passes;
  const perimeter_all = 2 * (ln.length_in + ln.width_in) * ln.qty;
  const l_extra = extra * perimeter_all;
  const l_total = l_base + l_extra;

  const pass_feed_penalty = 1.0 + 0.35 * extra;
  const t_cut_min = (l_base * tau + l_extra * tau * pass_feed_penalty) / 60.0;

  return {
    tau_s_per_in: tau,
    l_cut_first_in: l_cut_1,
    l_cut_subsequent_in: l_cut_n,
    l_base_in: l_base,
    extra_passes: extra,
    l_extra_in: l_extra,
    l_total_in: l_total,
    t_cut_min,
  };
}

// ---------------------------------------------------------------------------
// Module 4 - Handling, finish operations, inspection, labor
// ---------------------------------------------------------------------------

interface LaborResult {
  t_setup_min: number;
  t_load_min: number;
  t_batch_min: number;
  t_edge_finish_min: number;
  t_face_finish_min: number;
  t_inspection_min: number;
  t_addon_min: number;
  t_remnant_min: number;
  t_blade_min: number;
  t_total_min: number;
  c_proc: number;
  cleanroom_solvent: string | null;
  addon_labor_detail: { add_on: string; labor_min: number }[];
}

function labor(
  ln: LineItem,
  mat: MaterialSpec,
  basis: CostBasis,
  geo: Footprint,
  cut: CutTime,
  cfg: PricingConfig,
  blade_change: boolean,
  order_add_ons: string[]
): LaborResult {
  const lb = cfg.labor;
  const tol = cfg.tolerance_tiers[ln.tolerance_tier];

  const t_setup = lb.t_setup_min;
  const t_load = lb.t_load_base_min + lb.t_load_per_lb_min * basis.wt_sheet_lb;
  const t_part = lb.t_part_base_min + lb.t_part_area_coeff_min * Math.log(1.0 + geo.a_net_in2 / 144.0);
  const lc_exponent = 1.0 + Math.log2(lb.learning_curve);
  const t_batch = t_part * ln.qty ** lc_exponent;

  // Edge finish
  const ef = cfg.edge_finish[ln.edge_finish];
  const perimeter = 2 * (ln.length_in + ln.width_in);
  const t_edge = !ef.included
    ? ef.min_per_in_perimeter * perimeter * Math.max(1, ef.passes_perimeter ?? 1) * ln.qty
    : 0.0;

  // Face finish
  const ff = cfg.face_finish[ln.face_finish];
  const sqft_each = geo.a_net_in2 / 144.0;
  const t_face = !ff.included ? (ff.min_per_sqft * sqft_each + (ff.min_per_part ?? 0.0)) * ln.qty : 0.0;

  let solvent: string | null = null;
  if (ln.face_finish === "CLEANROOM_PACK") {
    solvent = mat.solvent_stress_crack_sensitive
      ? ff.solvent_for_stress_crack_sensitive ?? null
      : ff.solvent_default ?? null;
  }

  // Inspection driven by tolerance tier
  const t_inspect = tol.inspection_min_per_part * ln.qty;

  // Add-on labor
  let t_addon = 0.0;
  const addon_detail: { add_on: string; labor_min: number }[] = [];
  for (const name of [...ln.add_ons, ...order_add_ons]) {
    const spec = cfg.add_ons[name];
    const mins = spec.labor_min ?? 0.0;
    let mins_total = spec.per === "line" || spec.per === "order" ? mins : 0.0;
    mins_total += (spec.labor_min_per_part ?? 0.0) * ln.qty;
    if (ln.add_ons.includes(name)) {
      t_addon += mins_total;
      addon_detail.push({ add_on: name, labor_min: round_to(mins_total, 3) });
    }
  }

  const t_remnant = lb.t_remnant_min;
  const t_blade = blade_change ? lb.t_blade_change_min : 0.0;

  const t_total =
    t_setup + t_load + cut.t_cut_min + t_batch + t_edge + t_face + t_inspect + t_addon + t_remnant + t_blade;
  const c_proc = (t_total / 60.0) * cfg.shop.burdened_rate_per_hr;

  return {
    t_setup_min: t_setup,
    t_load_min: t_load,
    t_batch_min: t_batch,
    t_edge_finish_min: t_edge,
    t_face_finish_min: t_face,
    t_inspection_min: t_inspect,
    t_addon_min: t_addon,
    t_remnant_min: t_remnant,
    t_blade_min: t_blade,
    t_total_min: t_total,
    c_proc,
    cleanroom_solvent: solvent,
    addon_labor_detail: addon_detail,
  };
}

// ---------------------------------------------------------------------------
// Module 5 - Consumables
// ---------------------------------------------------------------------------

interface ConsumablesResult {
  blade_group: string;
  blade_life_in: number;
  c_blade_per_in: number;
  c_blade: number;
  c_packaging: number;
  c_finish_material: number;
  c_addon_consumable: number;
  c_consum: number;
}

function consumables(
  ln: LineItem,
  mat: MaterialSpec,
  geo: Footprint,
  cut: CutTime,
  cfg: PricingConfig,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for parity with pricing_engine.py; order-scope add-ons never contribute a consumable cost there either
  order_add_ons: string[]
): ConsumablesResult {
  const blade = cfg.consumables.blades[mat.blade_group];
  const life_value = blade.blade_cost + blade.n_sharpenings * blade.sharpen_cost;
  const life_in = blade.base_life_in / mat.abrasion;
  const c_blade_per_in = life_value / life_in;
  const c_blade = cut.l_total_in * c_blade_per_in;

  const c_pack = cfg.consumables.packaging_base + cfg.consumables.packaging_per_part * ln.qty;

  const ff = cfg.face_finish[ln.face_finish];
  const sqft_total = (geo.a_net_in2 / 144.0) * ln.qty;
  const c_finish_mat = (ff.material_cost_per_sqft ?? 0.0) * sqft_total;

  let c_addon = 0.0;
  for (const name of ln.add_ons) {
    const spec = cfg.add_ons[name];
    c_addon += (spec.consumable_per_part ?? 0.0) * ln.qty;
  }

  return {
    blade_group: mat.blade_group,
    blade_life_in: life_in,
    c_blade_per_in,
    c_blade,
    c_packaging: c_pack,
    c_finish_material: c_finish_mat,
    c_addon_consumable: c_addon,
    c_consum: c_blade + c_pack + c_finish_mat + c_addon,
  };
}

// ---------------------------------------------------------------------------
// Module 6 - Compliance and add-on charges
// ---------------------------------------------------------------------------

interface ComplianceDetail {
  add_on: string;
  label: string;
  scope: string;
  price: number;
}

interface ComplianceResult {
  c_comply: number;
  detail: ComplianceDetail[];
}

function compliance_and_addons(req: QuoteRequest, cfg: PricingConfig): ComplianceResult {
  const c = cfg.compliance;
  let total = c.per_order + c.per_line_item * req.lines.length;
  const detail: ComplianceDetail[] = [];

  for (const name of req.order_add_ons) {
    const spec = cfg.add_ons[name];
    if (spec.per === "order") {
      total += spec.price;
      detail.push({ add_on: name, label: spec.label, scope: "order", price: spec.price });
    }
  }

  req.lines.forEach((ln, idx) => {
    const i = idx + 1;
    for (const name of ln.add_ons) {
      const spec = cfg.add_ons[name];
      const per = spec.per ?? "line";
      let amt: number;
      if (per === "line") {
        amt = spec.price;
      } else if (per === "part") {
        amt = spec.price * ln.qty;
      } else {
        // an order-scope add-on attached to a line applies once
        amt = spec.price;
      }
      total += amt;
      detail.push({ add_on: name, label: spec.label, scope: `line ${i}`, price: round_to(amt, 2) });
    }
  });

  return { c_comply: total, detail };
}

// ---------------------------------------------------------------------------
// Module 7 - Annealing
// ---------------------------------------------------------------------------

interface AnnealingResult {
  applied: boolean;
  soak_hours?: number;
  oven_hours: number;
  c_oven?: number;
  t_handling_min: number;
  c_handling?: number;
  c_anneal: number;
}

function annealing(ln: LineItem, basis: CostBasis, cfg: PricingConfig): AnnealingResult {
  if (!ln.anneal) {
    return { applied: false, c_anneal: 0.0, oven_hours: 0.0, t_handling_min: 0.0 };
  }
  const an = cfg.annealing;
  const soak = an.soak_hours_per_in_thickness * basis.t_actual;
  const oven_hours = an.ramp_hours + soak;
  const c_oven = (oven_hours * an.oven_rate_per_hr) / an.batch_divisor;
  const c_handling = (an.handling_min / 60.0) * cfg.shop.burdened_rate_per_hr;
  return {
    applied: true,
    soak_hours: soak,
    oven_hours,
    c_oven,
    t_handling_min: an.handling_min,
    c_handling,
    c_anneal: c_oven + c_handling,
  };
}

// ---------------------------------------------------------------------------
// Module 8 - Rework risk
// ---------------------------------------------------------------------------

interface ReworkResult {
  p_rework: number;
  size_factor: number;
  residual_stress_applied: boolean;
  anneal_credit_applied: boolean;
  c_rework_expected: number;
}

function rework_risk(
  ln: LineItem,
  mat: MaterialSpec,
  // Unused - kept for parity with pricing_engine.py, which also never reads geo here.
  geo: Footprint,
  cfg: PricingConfig,
  c_mat_line: number,
  c_proc_line: number,
  annealed: boolean
): ReworkResult {
  const rm = cfg.rework_model;
  const tol = cfg.tolerance_tiers[ln.tolerance_tier];

  let p = tol.p_rework_base;

  const max_dim = Math.max(ln.length_in, ln.width_in);
  const size_factor = 1.0 + Math.max(0.0, (max_dim - 12.0) / 12.0) * rm.size_factor_per_12in_over;
  p *= size_factor;

  let stress_applied = false;
  if (mat.residual_stress_flag && ln.tolerance_tier !== "STANDARD") {
    p *= rm.residual_stress_multiplier;
    stress_applied = true;
  }

  if (mat.filled_grade) {
    p *= rm.filled_grade_multiplier;
  }

  let anneal_credit = false;
  if (annealed && stress_applied) {
    p *= cfg.annealing.rework_reduction_factor;
    anneal_credit = true;
  }

  p = Math.min(p, 0.85);
  const expected = p * (c_mat_line + c_proc_line) * rm.severity;

  return {
    p_rework: p,
    size_factor,
    residual_stress_applied: stress_applied,
    anneal_credit_applied: anneal_credit,
    c_rework_expected: expected,
  };
}

// ---------------------------------------------------------------------------
// Module 9 - Margin
// ---------------------------------------------------------------------------

/**
 * Continuous piecewise-linear margin curve.
 *
 * A STEPPED margin schedule is non-monotone at its boundaries: shaving a
 * dollar of cost can push an order into a higher-margin band and RAISE the
 * quoted price. That is indefensible to a customer who just chose a cheaper
 * option. Interpolating between the same anchor points keeps the intent
 * (small orders carry more margin) while guaranteeing d(price)/d(COGS) > 0.
 */
export function margin_for(cogs: number, cfg: PricingConfig): number {
  const anchors = cfg.margin_curve.anchors;
  if (cogs <= anchors[0].cogs) {
    return anchors[0].margin;
  }
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    if (cogs <= b.cogs) {
      const span = b.cogs - a.cogs;
      if (span <= 0) {
        return b.margin;
      }
      const f = (cogs - a.cogs) / span;
      return a.margin + f * (b.margin - a.margin);
    }
  }
  return anchors[anchors.length - 1].margin;
}

// ---------------------------------------------------------------------------
// Module 10 - Freight
// ---------------------------------------------------------------------------

interface LineGeo {
  length_in: number;
  width_in: number;
  t_actual: number;
  a_net_in2: number;
  density: number;
  qty: number;
}

interface FreightResult {
  box_l_in: number;
  box_w_in: number;
  box_h_in: number;
  dim_weight_lb: number;
  actual_weight_lb: number;
  billable_weight_lb: number;
  c_freight: number;
  dest_zip: string;
  rate_source: string;
  method: string;
  carrier_rate?: number;
}

/**
 * threshold_basis is the order value at the STANDARD lead tier, NOT the
 * quoted subtotal.
 *
 * Why: a free-shipping threshold compared against the quoted price creates a
 * cliff. A customer who picks the cheaper NEST tier can drop below the
 * threshold, gain an $18 delivery fee, and end up paying MORE for choosing
 * the slower option. Delivery cost has nothing to do with how fast we cut,
 * so the threshold must not move with the lead tier.
 */
function freight(
  lines_geo: LineGeo[],
  cfg: PricingConfig,
  dest_zip: string,
  threshold_basis: number
): FreightResult {
  const f = cfg.freight;

  const box_l = Math.max(...lines_geo.map((g) => g.length_in)) + f.box_pad_length_in;
  const box_w = Math.max(...lines_geo.map((g) => g.width_in)) + f.box_pad_width_in;
  const box_h = lines_geo.reduce((s, g) => s + g.t_actual * g.qty, 0) + f.box_pad_height_in;

  const dim_wt = (box_l * box_w * box_h) / f.dim_divisor;
  const content_lb = lines_geo.reduce((s, g) => s + g.a_net_in2 * g.t_actual * g.density * g.qty, 0);
  const tare = f.packaging_tare_base_lb + f.packaging_tare_per_sqft_lb * ((box_l * box_w) / 144.0);
  const act_wt = content_lb + tare;
  const bill_wt = Math.ceil(Math.max(dim_wt, act_wt));

  const ld = f.local_delivery;
  if (ld?.enabled && ld.zips.includes(dest_zip)) {
    const cost = threshold_basis >= ld.free_over ? 0.0 : ld.flat_rate;
    return {
      box_l_in: box_l,
      box_w_in: box_w,
      box_h_in: box_h,
      dim_weight_lb: dim_wt,
      actual_weight_lb: act_wt,
      billable_weight_lb: bill_wt,
      c_freight: cost,
      dest_zip,
      rate_source: "LOCAL_DELIVERY",
      method: "Local delivery, San Diego County",
    };
  }

  let rate = f.fallback_rate_ladder[f.fallback_rate_ladder.length - 1].rate;
  for (const step of f.fallback_rate_ladder) {
    if (bill_wt <= step.max_lb) {
      rate = step.rate;
      break;
    }
  }

  return {
    box_l_in: box_l,
    box_w_in: box_w,
    box_h_in: box_h,
    dim_weight_lb: dim_wt,
    actual_weight_lb: act_wt,
    billable_weight_lb: bill_wt,
    carrier_rate: rate,
    c_freight: rate + f.handling_adder,
    dest_zip,
    rate_source: "FALLBACK_LADDER",
    method: "Ground",
  };
}

// ---------------------------------------------------------------------------
// Module 11 - Lead time
// ---------------------------------------------------------------------------

/** Default order date when none is supplied. Fixed, not the wall clock. */
const DEFAULT_ORDER_DATE = "2026-09-03";

function to_epoch_day(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
}

function from_epoch_day(days: number): string {
  const dt = new Date(days * 86400000);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function add_days_iso(iso: string, days: number): string {
  return from_epoch_day(to_epoch_day(iso) + days);
}

const _WEEKDAY_CODES_BY_JS_DAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

function weekday_code(iso: string): string {
  const dt = new Date(to_epoch_day(iso) * 86400000);
  return _WEEKDAY_CODES_BY_JS_DAY[dt.getUTCDay()];
}

function is_business_day(iso: string, cfg: PricingConfig): boolean {
  const cal = cfg.calendar;
  if (!cal.business_days.includes(weekday_code(iso))) return false;
  return !cal.holidays.includes(iso);
}

export function add_business_days(start: string, n: number, cfg: PricingConfig): string {
  let d = start;
  if (n === 0) {
    while (!is_business_day(d, cfg)) {
      d = add_days_iso(d, 1);
    }
    return d;
  }
  let remaining = n;
  while (remaining > 0) {
    d = add_days_iso(d, 1);
    if (is_business_day(d, cfg)) {
      remaining -= 1;
    }
  }
  return d;
}

/**
 * Business days elapsed from `start` to `end` (both "YYYY-MM-DD"), using the
 * same calendar as add_business_days - the nest board's "oldest order age
 * against queue_max_age_business_days" (CLAUDE_CODE_BRIEF.md §10) needs the
 * inverse of that function.
 */
export function count_business_days(start: string, end: string, cfg: PricingConfig): number {
  if (end <= start) return 0;
  let d = start;
  let count = 0;
  while (d < end) {
    d = add_days_iso(d, 1);
    if (is_business_day(d, cfg)) count += 1;
  }
  return count;
}

interface LeadTimeResult {
  order_date: string;
  cutoff_local: string;
  ship_offset_business_days: number;
  promised_ship_date: string;
  lead_label: string;
  anneal_days_added: number;
  composite_note: string | null;
}

function lead_time(
  req: QuoteRequest,
  cfg: PricingConfig,
  needs_composite_day: boolean,
  any_anneal: boolean
): LeadTimeResult {
  const tier = cfg.lead_tiers[req.lead_tier];
  const start = req.order_date ?? DEFAULT_ORDER_DATE;

  let offset = tier.ship_offset_business_days;
  if (any_anneal) {
    offset += cfg.annealing.adds_business_days;
  }

  let ship = add_business_days(start, offset, cfg);

  let composite_note: string | null = null;
  if (needs_composite_day) {
    const batch_days = cfg.calendar.composite_batch_days;
    if (tier.multiplier <= 1.0) {
      let probe = ship;
      let guard = 0;
      while (!batch_days.includes(weekday_code(probe)) || !is_business_day(probe, cfg)) {
        probe = add_days_iso(probe, 1);
        guard += 1;
        if (guard > 21) break;
      }
      if (probe !== ship) {
        composite_note =
          "Composite materials are cut on the scheduled batch day. " +
          `Ship date moved from ${ship} to ${probe}.`;
        ship = probe;
      }
    } else {
      composite_note = "Off-cycle composite run; rush tier covers the changeover.";
    }
  }

  return {
    order_date: start,
    cutoff_local: tier.cutoff_local,
    ship_offset_business_days: offset,
    promised_ship_date: ship,
    lead_label: tier.label,
    anneal_days_added: any_anneal ? cfg.annealing.adds_business_days : 0,
    composite_note,
  };
}

// ---------------------------------------------------------------------------
// Master assembly
// ---------------------------------------------------------------------------

export interface LineResult {
  part_ref: string;
  material_code: string;
  material_label: string;
  brand: string;
  brand_label: string;
  certification_tier: string;
  certification_label: string;
  tolerance_tier: string;
  tolerance_label: string;
  edge_finish: string;
  edge_finish_label: string;
  face_finish: string;
  face_finish_label: string;
  annealed: boolean;
  length_in: number;
  width_in: number;
  thickness_nominal_in: number;
  thickness_actual_in: number;
  qty: number;
  residual_stress_flag: boolean;
  basis: CostBasis;
  geometry: Footprint;
  cut: CutTime;
  labor: LaborResult;
  consumables: ConsumablesResult;
  annealing: AnnealingResult;
  rework: ReworkResult;
  prorata_reference: number;
}

export interface QuoteResult {
  schema_version: string;
  sourcing_mode: string;
  lead_tier: string;
  lead_label: string;
  rush_multiplier: number;
  nest_uplift: number;
  lines: LineResult[];
  add_on_detail: ComplianceDetail[];
  cost_breakdown: {
    c_material: number;
    c_processing: number;
    c_consumables: number;
    c_compliance: number;
    c_annealing: number;
    c_rework_expected: number;
    cogs: number;
    margin_rate: number;
    conversion_after_rush: number;
    price_pre_floor: number;
  };
  sanity: {
    prorata_reference: number;
    gamma: number | null;
    floor_applied: boolean;
    flags: string[];
  };
  freight: FreightResult;
  lead_time: LeadTimeResult;
  competitive_comparison: string | null;
  totals: {
    subtotal_goods: number;
    shipping: number;
    processing_adder: number;
    total_due: number;
    currency: string;
    total_cents: number;
  };
  spec_statement: string;
}

export function quote(input: QuoteRequestInput, cfg: PricingConfig): QuoteResult {
  const req = normalise_request(input);
  validate(req, cfg);
  const upgrade_notes = apply_forced_upgrades(req, cfg);

  const mode = req.sourcing_mode || cfg.shop.sourcing_mode;
  const order_add_ons = req.order_add_ons;

  const line_results: LineResult[] = [];
  const lines_geo: LineGeo[] = [];
  const blade_groups_seen = new Set<string>();

  let c_mat_total = 0;
  let c_proc_total = 0;
  let c_consum_total = 0;
  let c_mat_std_total = 0; // material at STD uplift; freight-threshold reference only
  let c_anneal_total = 0;
  let c_rework_total = 0;
  let prorata_total = 0;
  let needs_composite_day = false;
  let any_anneal = false;

  for (const ln of req.lines) {
    const mat = cfg.materials[ln.material_code];
    const basis = cost_basis(mat, ln, cfg);
    const geo = footprint(ln, mat, basis, cfg, req.lead_tier, mode, req.dropcut_quoted_cost);
    const geo_std = footprint(ln, mat, basis, cfg, "STD", mode, req.dropcut_quoted_cost);
    c_mat_std_total += geo_std.c_mat;
    const cut = cut_time(ln, mat, basis, cfg);

    const blade_change = !blade_groups_seen.has(mat.blade_group);
    blade_groups_seen.add(mat.blade_group);
    if (mat.blade_group === "PCD_COMPOSITE") {
      needs_composite_day = true;
    }

    const lab = labor(ln, mat, basis, geo, cut, cfg, blade_change, order_add_ons);
    const con = consumables(ln, mat, geo, cut, cfg, order_add_ons);
    const ann = annealing(ln, basis, cfg);
    if (ann.applied) {
      any_anneal = true;
      lab.t_total_min += ann.t_handling_min;
    }

    const rew = rework_risk(ln, mat, geo, cfg, geo.c_mat, lab.c_proc, ann.applied);

    const a_sheet = mat.sheet_length_in * mat.sheet_width_in;
    const prorata = ((geo.a_net_in2 * ln.qty) / a_sheet) * basis.c_sheet;

    c_mat_total += geo.c_mat;
    c_proc_total += lab.c_proc;
    c_consum_total += con.c_consum;
    c_anneal_total += ann.c_anneal;
    c_rework_total += rew.c_rework_expected;
    prorata_total += prorata;

    const tol = cfg.tolerance_tiers[ln.tolerance_tier];
    line_results.push({
      part_ref: ln.part_ref,
      material_code: ln.material_code,
      material_label: mat.label,
      brand: ln.brand,
      brand_label: basis.brand_label,
      certification_tier: ln.certification_tier,
      certification_label: basis.tier_label,
      tolerance_tier: ln.tolerance_tier,
      tolerance_label: tol.label,
      edge_finish: ln.edge_finish,
      edge_finish_label: cfg.edge_finish[ln.edge_finish].label,
      face_finish: ln.face_finish,
      face_finish_label: cfg.face_finish[ln.face_finish].label,
      annealed: ann.applied,
      length_in: ln.length_in,
      width_in: ln.width_in,
      thickness_nominal_in: ln.thickness_in,
      thickness_actual_in: round_to(basis.t_actual, 4),
      qty: ln.qty,
      residual_stress_flag: mat.residual_stress_flag,
      basis,
      geometry: geo,
      cut,
      labor: lab,
      consumables: con,
      annealing: ann,
      rework: rew,
      prorata_reference: prorata,
    });

    lines_geo.push({
      length_in: ln.length_in,
      width_in: ln.width_in,
      t_actual: basis.t_actual,
      a_net_in2: geo.a_net_in2,
      density: mat.density_lb_in3,
      qty: ln.qty,
    });
  }

  const comp = compliance_and_addons(req, cfg);
  const c_comply = comp.c_comply;

  const cogs = c_mat_total + c_proc_total + c_consum_total + c_comply + c_anneal_total + c_rework_total;
  const m = margin_for(cogs, cfg);
  const rush = cfg.lead_tiers[req.lead_tier].multiplier;

  // Rush multiplies conversion cost, never material.
  const conversion = (c_proc_total + c_consum_total + c_comply + c_anneal_total + c_rework_total) * rush;
  const p_sub = c_mat_total + conversion;
  const p_pre = p_sub * (1.0 + m) + cfg.shop.order_intake_fee;

  const floored = Math.max(p_pre, cfg.shop.price_floor);
  const floor_applied = floored > p_pre;

  // Reference price at the STANDARD lead tier, using STANDARD's yield uplift.
  // Used only for the free-delivery threshold. It must be identical across
  // all five lead tiers, otherwise choosing a cheaper tier can drop the order
  // under the threshold, add a delivery fee, and raise the total.
  const conversion_std = c_proc_total + c_consum_total + c_comply + c_anneal_total + c_rework_total;
  const cogs_std = c_mat_std_total + conversion_std;
  const m_std = margin_for(cogs_std, cfg);
  const p_pre_std = (c_mat_std_total + conversion_std) * (1.0 + m_std) + cfg.shop.order_intake_fee;
  const threshold_basis = Math.max(p_pre_std, cfg.shop.price_floor);

  const gamma = prorata_total > 0 ? floored / prorata_total : null;
  const rails = cfg.sanity_rails;
  const flags: string[] = [...upgrade_notes];

  if (!floor_applied && gamma !== null) {
    if (gamma > rails.gamma_max) {
      flags.push(`GAMMA_HIGH: ${gamma.toFixed(2)}x pro-rata sheet cost. Likely uncompetitive.`);
    }
    if (gamma < rails.gamma_min) {
      flags.push(`GAMMA_LOW: ${gamma.toFixed(2)}x pro-rata sheet cost. Remnant risk not priced in.`);
    }
  }
  if (floor_applied) {
    flags.push("FLOOR_APPLIED: modelled price fell below the minimum ticket. Gamma rails suppressed.");
  }
  if (line_results.some((r) => r.residual_stress_flag && !r.annealed)) {
    flags.push("RESIDUAL_STRESS: disclose the 48-hour flatness note and offer annealing.");
  }
  if (blade_groups_seen.has("PCD_COMPOSITE") && blade_groups_seen.size > 1) {
    flags.push("MIXED_BLADE_GROUPS: two changeovers priced; consider splitting the run.");
  }
  if (line_results.some((r) => r.geometry.brand_locked)) {
    flags.push("BRAND_LOCKED: named mill source reduces remnant recovery and raises cost.");
  }
  for (const r of line_results) {
    if (r.labor.cleanroom_solvent === "DI_WATER_LINT_FREE") {
      flags.push(
        `SOLVENT_SUBSTITUTION: ${r.material_label} is stress-crack sensitive; ` +
          "cleanroom process uses DI water, not IPA."
      );
    }
  }
  for (const r of line_results) {
    if (r.rework.p_rework > 0.12) {
      flags.push(
        `REWORK_RISK: ${r.material_label} at ${r.tolerance_label} carries a ` +
          `${Math.round(r.rework.p_rework * 100)}% modelled scrap probability. Recommend annealing.`
      );
    }
  }

  const frt = freight(lines_geo, cfg, req.dest_zip, threshold_basis);
  const lead = lead_time(req, cfg, needs_composite_day, any_anneal);

  const pay = cfg.payments;
  const subtotal_goods = round_to(floored, 2);
  const shipping = round_to(frt.c_freight, 2);
  let total: number;
  if (pay.gross_up_enabled) {
    total = (subtotal_goods + shipping + pay.stripe_fixed) / (1.0 - pay.stripe_pct);
  } else {
    total = subtotal_goods + shipping;
  }
  total = round_to(total, 2);

  const cc = cfg.competitive_context;
  let comparison: string | null = null;
  if (subtotal_goods < cc.show_minimum_comparison_below) {
    comparison =
      `This order is $${fmt_money(subtotal_goods, 2)}. The nearest full-service fabricator ` +
      `in San Diego County applies a $${fmt_money(cc.curbell_fabrication_minimum, 0)} ` +
      "minimum charge on custom cutting.";
  }

  return {
    schema_version: cfg.schema_version,
    sourcing_mode: mode,
    lead_tier: req.lead_tier,
    lead_label: cfg.lead_tiers[req.lead_tier].label,
    rush_multiplier: rush,
    nest_uplift: cfg.lead_tiers[req.lead_tier].nest_uplift,
    lines: line_results,
    add_on_detail: comp.detail,
    cost_breakdown: {
      c_material: round_to(c_mat_total, 4),
      c_processing: round_to(c_proc_total, 4),
      c_consumables: round_to(c_consum_total, 4),
      c_compliance: round_to(c_comply, 4),
      c_annealing: round_to(c_anneal_total, 4),
      c_rework_expected: round_to(c_rework_total, 4),
      cogs: round_to(cogs, 4),
      margin_rate: m,
      conversion_after_rush: round_to(conversion, 4),
      price_pre_floor: round_to(p_pre, 4),
    },
    sanity: {
      prorata_reference: round_to(prorata_total, 2),
      gamma: gamma !== null ? round_to(gamma, 3) : null,
      floor_applied,
      flags,
    },
    freight: frt,
    lead_time: lead,
    competitive_comparison: comparison,
    totals: {
      subtotal_goods,
      shipping,
      processing_adder: round_to(total - subtotal_goods - shipping, 2),
      total_due: total,
      currency: "usd",
      total_cents: Math.round(total * 100),
    },
    spec_statement: spec_statement(req, cfg),
  };
}

function spec_statement(req: QuoteRequest, cfg: PricingConfig): string {
  const tiers = Array.from(new Set(req.lines.map((ln) => ln.tolerance_tier)));
  const loosest = tiers.reduce((best, t) =>
    cfg.tolerance_tiers[t].tolerance_in > cfg.tolerance_tiers[best].tolerance_in ? t : best
  );
  const tol = cfg.tolerance_tiers[loosest];
  return (
    `Cut to nominal X-Y dimensions, tolerance +/-${tol.tolerance_in.toFixed(3)} in. ` +
    `Squareness ${tol.squareness_in_per_12in.toFixed(3)} in per 12 in. ` +
    "Thickness is as-supplied by the mill and is not machined. " +
    "Four edges saw-cut and deburred."
  );
}
