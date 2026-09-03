"""
Quote engine v2 - reference implementation.

This module is the NUMERICAL SPECIFICATION for the business. Pure function:
dict in, dict out. No I/O, no database, no network, no framework, no clock
except the one explicitly passed to the lead-time module.

The TypeScript port in the web app MUST reproduce these outputs to the cent.
Run `python test_pricing.py` to regenerate golden_cases.json.

MODULES
  1   Material cost basis        brand + certification tier -> $/in^2
  2   Consumed footprint         yield, brand-lock penalty, nest uplift
  3   Cut time                   + tolerance passes
  4   Handling & labor           + finish ops, inspection, add-on labor
  5   Consumables                blade destruction, packaging, finish materials
  6   Compliance & add-ons
  7   Annealing                  oven-hours, not labor-hours
  8   Rework risk                expected cost of a part going out of spec
  9   Margin, floor, rush
  10  Freight                    dimensional weight + local delivery
  11  Lead time                  business-day calendar, composite batch days

WHAT CHANGED FROM v1, AND WHY
  - Brand is now a first-class attribute. An AS9100 buyer whose AVL names
    Ensinger TECAPEEK cannot order a generic PEEK. Brand also suppresses
    remnant recovery, because only that brand's drops can satisfy the order.
  - Certification tier splits Tier 1 traceable from industrial grade.
  - Rush now costs twice: the multiplier AND the forfeited nesting uplift.
    The NEST tier is the mirror image - slower, cheaper, denser sheets.
  - Rework risk is priced explicitly. Tight tolerance on stressed material is
    where the money leaks, and it should show up in the quote, not the P&L.
"""

from __future__ import annotations

import json
import math
import os
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any, Optional

_HERE = os.path.dirname(os.path.abspath(__file__))

_DAY_CODES = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"]


def load_config(path: Optional[str] = None) -> dict:
    with open(path or os.path.join(_HERE, "config.json"), "r") as fh:
        return json.load(fh)


class QuoteError(ValueError):
    """Raised for any input the engine refuses to price. Message is customer-facing."""


# ---------------------------------------------------------------------------
# Input contract
# ---------------------------------------------------------------------------

@dataclass
class LineItem:
    material_code: str
    length_in: float
    width_in: float
    thickness_in: float
    qty: int = 1
    part_ref: str = ""
    brand: str = "GENERIC"
    certification_tier: str = "TIER1_TRACEABLE"
    tolerance_tier: str = "STANDARD"
    edge_finish: str = "DEBURRED"
    face_finish: str = "AS_SUPPLIED"
    anneal: bool = False
    add_ons: Optional[list[str]] = None

    def normalised_add_ons(self) -> list[str]:
        return list(self.add_ons or [])


@dataclass
class QuoteRequest:
    lines: list[LineItem]
    lead_tier: str = "STD"
    dest_zip: str = "92020"
    order_add_ons: Optional[list[str]] = None
    sourcing_mode: Optional[str] = None
    dropcut_quoted_cost: Optional[float] = None
    order_date: Optional[date] = None

    def normalised_add_ons(self) -> list[str]:
        return list(self.order_add_ons or [])


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def validate(req: QuoteRequest, cfg: dict) -> None:
    g = cfg["geometry_limits"]

    if not req.lines:
        raise QuoteError("Quote contains no line items.")
    if len(req.lines) > g["max_line_items"]:
        raise QuoteError(
            f"{len(req.lines)} line items exceeds the {g['max_line_items']} line limit. "
            "Split into separate orders or request a manual quote."
        )
    if req.lead_tier not in cfg["lead_tiers"]:
        raise QuoteError(f"Unknown lead time option '{req.lead_tier}'.")

    for name in req.normalised_add_ons():
        if name not in cfg["add_ons"]:
            raise QuoteError(f"Unknown option '{name}'.")

    for i, ln in enumerate(req.lines, start=1):
        mat = cfg["materials"].get(ln.material_code)
        if mat is None:
            raise QuoteError(f"Line {i}: unknown material '{ln.material_code}'.")

        tier = cfg["certification_tiers"].get(ln.certification_tier)
        if tier is None:
            raise QuoteError(f"Line {i}: unknown certification tier '{ln.certification_tier}'.")

        tol = cfg["tolerance_tiers"].get(ln.tolerance_tier)
        if tol is None:
            raise QuoteError(f"Line {i}: unknown tolerance option '{ln.tolerance_tier}'.")

        if ln.edge_finish not in cfg["edge_finish"]:
            raise QuoteError(f"Line {i}: unknown edge finish '{ln.edge_finish}'.")
        if ln.face_finish not in cfg["face_finish"]:
            raise QuoteError(f"Line {i}: unknown face finish '{ln.face_finish}'.")

        # Brand
        if ln.brand not in mat["brands"]:
            avail = ", ".join(mat["brands"].keys())
            raise QuoteError(
                f"Line {i}: '{ln.brand}' is not a stocked source for {mat['label']}. "
                f"Available: {avail}."
            )
        if ln.brand != "GENERIC" and not tier["brand_selection_allowed"]:
            raise QuoteError(
                f"Line {i}: a named mill source requires the Tier 1 traceable option. "
                "Industrial grade carries no mill lineage."
            )

        # Add-ons vs tier
        for name in ln.normalised_add_ons() + req.normalised_add_ons():
            spec = cfg["add_ons"].get(name)
            if spec is None:
                raise QuoteError(f"Line {i}: unknown option '{name}'.")
            if name in tier.get("blocked_addons", []):
                raise QuoteError(
                    f"Line {i}: {spec['label']} is not available on {tier['label']}. "
                    "Switch this line to Tier 1 traceable."
                )
            if spec.get("tier1_only") and ln.certification_tier != "TIER1_TRACEABLE":
                raise QuoteError(
                    f"Line {i}: {spec['label']} requires Tier 1 traceable material."
                )

        # Geometry
        for nm, val in (("length", ln.length_in), ("width", ln.width_in)):
            if val < g["min_dim_in"]:
                raise QuoteError(f"Line {i}: {nm} {val} in is below the {g['min_dim_in']} in minimum.")
            if val > g["max_dim_in"]:
                raise QuoteError(f"Line {i}: {nm} {val} in exceeds the {g['max_dim_in']} in crosscut capacity.")

        max_dim = max(ln.length_in, ln.width_in)
        if max_dim > tol["max_dim_in"]:
            raise QuoteError(
                f"Line {i}: {tol['label']} is only held up to {tol['max_dim_in']:g} in. "
                f"This part is {max_dim:g} in. Choose a wider tolerance or request a manual quote."
            )

        delta = 2 * cfg["shop"]["kerf_in"] + 2 * cfg["shop"]["datum_trim_per_edge_in"]
        long_side = max(ln.length_in, ln.width_in) + delta
        short_side = min(ln.length_in, ln.width_in) + delta
        sheet_long = max(mat["sheet_length_in"], mat["sheet_width_in"])
        sheet_short = min(mat["sheet_length_in"], mat["sheet_width_in"])
        if long_side > sheet_long or short_side > sheet_short:
            raise QuoteError(
                f"Line {i}: {ln.length_in:g} x {ln.width_in:g} in does not fit "
                f"{mat['label']} stock ({sheet_long:g} x {sheet_short:g} in) once kerf "
                "and edge trim are allowed."
            )

        if ln.thickness_in not in mat["stock_thicknesses_in"]:
            avail = ", ".join(f"{t:g}" for t in mat["stock_thicknesses_in"])
            raise QuoteError(
                f"Line {i}: {ln.thickness_in:g} in is not a stocked thickness for "
                f"{mat['label']}. Available: {avail} in."
            )

        if ln.qty < g["min_qty"] or ln.qty > g["max_qty_per_line"]:
            raise QuoteError(
                f"Line {i}: quantity {ln.qty} is outside the {g['min_qty']}-{g['max_qty_per_line']} range."
            )

        # Annealing
        if ln.anneal:
            an = cfg["annealing"]
            if not an["enabled"]:
                raise QuoteError(f"Line {i}: stress-relief annealing is not currently offered.")
            if ln.material_code not in an["eligible_materials"]:
                raise QuoteError(f"Line {i}: {mat['label']} is not annealed in house.")
            if req.lead_tier in an["blocks_lead_tiers"]:
                raise QuoteError(
                    f"Line {i}: an anneal cycle cannot be completed on "
                    f"{cfg['lead_tiers'][req.lead_tier]['label'].lower()}. "
                    "Choose a 2-day or longer lead time."
                )

    if req.sourcing_mode is not None and req.sourcing_mode not in cfg["shop"]["sourcing_mode_options"]:
        raise QuoteError(f"Unknown sourcing mode '{req.sourcing_mode}'.")


def apply_forced_upgrades(req: QuoteRequest, cfg: dict) -> list[str]:
    """
    Some options imply a tighter tolerance than the customer selected. Upgrade
    silently but tell them, rather than quoting a FAIR against a +/-0.030 cut.
    """
    notes: list[str] = []
    order_addons = req.normalised_add_ons()
    rank = {"STANDARD": 0, "PRECISION": 1, "TIGHT": 2}
    for i, ln in enumerate(req.lines, start=1):
        for name in ln.normalised_add_ons() + order_addons:
            forced = cfg["add_ons"].get(name, {}).get("forces_tolerance_min")
            if forced and rank[ln.tolerance_tier] < rank[forced]:
                notes.append(
                    f"Line {i}: {cfg['add_ons'][name]['label']} requires "
                    f"{cfg['tolerance_tiers'][forced]['label']}; upgraded from "
                    f"{cfg['tolerance_tiers'][ln.tolerance_tier]['label']}."
                )
                ln.tolerance_tier = forced
    return notes


# ---------------------------------------------------------------------------
# Module 1 - Material cost basis
# ---------------------------------------------------------------------------

def cost_basis(mat: dict, ln: LineItem, cfg: dict) -> dict:
    t_actual = ln.thickness_in + mat["thickness_oversize_in"]
    brand = mat["brands"][ln.brand]
    tier = cfg["certification_tiers"][ln.certification_tier]

    effective_price_lb = mat["price_per_lb"] * brand["price_multiplier"] * tier["price_multiplier"]

    v_sheet = mat["sheet_length_in"] * mat["sheet_width_in"] * t_actual
    wt_sheet = v_sheet * mat["density_lb_in3"]
    c_sheet = wt_sheet * effective_price_lb
    c_vol = c_sheet / v_sheet

    return {
        "t_actual": t_actual,
        "brand": ln.brand,
        "brand_label": brand["label"],
        "brand_multiplier": brand["price_multiplier"],
        "tier": ln.certification_tier,
        "tier_label": tier["label"],
        "tier_multiplier": tier["price_multiplier"],
        "effective_price_per_lb": effective_price_lb,
        "v_sheet_in3": v_sheet,
        "wt_sheet_lb": wt_sheet,
        "c_sheet": c_sheet,
        "c_vol_per_in3": c_vol,
        "c_area_per_in2": c_vol * t_actual,
    }


# ---------------------------------------------------------------------------
# Module 2 - Consumed footprint, yield, brand lock, nest uplift
# ---------------------------------------------------------------------------

def footprint(ln: LineItem, mat: dict, basis: dict, cfg: dict, lead_tier: str,
              sourcing_mode: str, dropcut_cost: Optional[float]) -> dict:
    shop = cfg["shop"]
    delta = 2 * shop["kerf_in"] + 2 * shop["datum_trim_per_edge_in"]

    a_net = ln.length_in * ln.width_in
    a_gross = (ln.length_in + delta) * (ln.width_in + delta)

    rho_base = shop["remnant_recovery_rate"]
    brand_locked = ln.brand != "GENERIC"
    rho_after_lock = rho_base * (shop["brand_lock_rho_factor"] if brand_locked else 1.0)

    uplift = cfg["lead_tiers"][lead_tier]["nest_uplift"]
    rho_eff = rho_after_lock + uplift

    eta_nest = mat["nest_efficiency"]
    eta_eff = min(shop["eta_effective_cap"], eta_nest + rho_eff * (1.0 - eta_nest))
    a_bill = a_gross / eta_eff

    if sourcing_mode == "JIT_DROPCUT":
        base = dropcut_cost if dropcut_cost is not None else a_gross * basis["c_area_per_in2"] * ln.qty
        c_mat = base * (1.0 + shop["jit_passthru_markup"])
    else:
        c_mat = a_bill * basis["c_area_per_in2"] * ln.qty

    return {
        "delta_in": delta,
        "a_net_in2": a_net,
        "a_gross_in2": a_gross,
        "eta_nest": eta_nest,
        "rho_base": rho_base,
        "brand_locked": brand_locked,
        "rho_after_brand_lock": rho_after_lock,
        "nest_uplift": uplift,
        "rho_effective": rho_eff,
        "eta_eff": eta_eff,
        "a_bill_in2": a_bill,
        "c_mat": c_mat,
    }


# ---------------------------------------------------------------------------
# Module 3 - Cut time
# ---------------------------------------------------------------------------

def cut_time(ln: LineItem, mat: dict, basis: dict, cfg: dict) -> dict:
    klass = cfg["cut_time_classes"][mat["cut_class"]]
    tau = klass["c0"] + klass["c1"] * basis["t_actual"]
    tol = cfg["tolerance_tiers"][ln.tolerance_tier]

    ot = cfg["shop"]["approach_overtravel_in"]
    l_cut_1 = 2 * (ln.length_in + ln.width_in) + 4 * ot
    l_cut_n = ln.length_in + ln.width_in + 2 * ot

    l_base = cfg["shop"]["datum_amortization_factor"] * l_cut_1 + (ln.qty - 1) * l_cut_n

    # Each extra tolerance pass re-cuts the full perimeter of every part at a
    # reduced feed. Reduced feed is captured by the pass_feed_penalty.
    extra = tol["extra_passes"]
    perimeter_all = 2 * (ln.length_in + ln.width_in) * ln.qty
    l_extra = extra * perimeter_all
    l_total = l_base + l_extra

    pass_feed_penalty = 1.0 + 0.35 * extra
    t_cut_min = (l_base * tau + l_extra * tau * pass_feed_penalty) / 60.0

    return {
        "tau_s_per_in": tau,
        "l_cut_first_in": l_cut_1,
        "l_cut_subsequent_in": l_cut_n,
        "l_base_in": l_base,
        "extra_passes": extra,
        "l_extra_in": l_extra,
        "l_total_in": l_total,
        "t_cut_min": t_cut_min,
    }


# ---------------------------------------------------------------------------
# Module 4 - Handling, finish operations, inspection, labor
# ---------------------------------------------------------------------------

def labor(ln: LineItem, mat: dict, basis: dict, geo: dict, cut: dict, cfg: dict,
          blade_change: bool, order_add_ons: list[str]) -> dict:
    lb = cfg["labor"]
    tol = cfg["tolerance_tiers"][ln.tolerance_tier]

    t_setup = lb["t_setup_min"]
    t_load = lb["t_load_base_min"] + lb["t_load_per_lb_min"] * basis["wt_sheet_lb"]
    t_part = lb["t_part_base_min"] + lb["t_part_area_coeff_min"] * math.log(
        1.0 + geo["a_net_in2"] / 144.0
    )
    lc_exponent = 1.0 + math.log2(lb["learning_curve"])
    t_batch = t_part * (ln.qty ** lc_exponent)

    # Edge finish
    ef = cfg["edge_finish"][ln.edge_finish]
    perimeter = 2 * (ln.length_in + ln.width_in)
    t_edge = ef["min_per_in_perimeter"] * perimeter * max(1, ef.get("passes_perimeter", 1)) * ln.qty \
        if not ef["included"] else 0.0

    # Face finish
    ff = cfg["face_finish"][ln.face_finish]
    sqft_each = geo["a_net_in2"] / 144.0
    t_face = (ff["min_per_sqft"] * sqft_each + ff.get("min_per_part", 0.0)) * ln.qty \
        if not ff["included"] else 0.0

    solvent = None
    if ln.face_finish == "CLEANROOM_PACK":
        solvent = (ff["solvent_for_stress_crack_sensitive"]
                   if mat.get("solvent_stress_crack_sensitive")
                   else ff["solvent_default"])

    # Inspection driven by tolerance tier
    t_inspect = tol["inspection_min_per_part"] * ln.qty

    # Add-on labor
    t_addon = 0.0
    addon_detail: list[dict] = []
    for name in ln.normalised_add_ons() + order_add_ons:
        spec = cfg["add_ons"][name]
        mins = spec.get("labor_min", 0.0)
        if spec.get("per") == "line" or spec.get("per") == "order":
            mins_total = mins
        else:
            mins_total = 0.0
        mins_total += spec.get("labor_min_per_part", 0.0) * ln.qty
        if name in ln.normalised_add_ons():
            t_addon += mins_total
            addon_detail.append({"add_on": name, "labor_min": round(mins_total, 3)})

    t_remnant = lb["t_remnant_min"]
    t_blade = lb["t_blade_change_min"] if blade_change else 0.0

    t_total = (t_setup + t_load + cut["t_cut_min"] + t_batch + t_edge + t_face
               + t_inspect + t_addon + t_remnant + t_blade)
    c_proc = (t_total / 60.0) * cfg["shop"]["burdened_rate_per_hr"]

    return {
        "t_setup_min": t_setup,
        "t_load_min": t_load,
        "t_batch_min": t_batch,
        "t_edge_finish_min": t_edge,
        "t_face_finish_min": t_face,
        "t_inspection_min": t_inspect,
        "t_addon_min": t_addon,
        "t_remnant_min": t_remnant,
        "t_blade_min": t_blade,
        "t_total_min": t_total,
        "c_proc": c_proc,
        "cleanroom_solvent": solvent,
        "addon_labor_detail": addon_detail,
    }


# ---------------------------------------------------------------------------
# Module 5 - Consumables
# ---------------------------------------------------------------------------

def consumables(ln: LineItem, mat: dict, geo: dict, cut: dict, cfg: dict,
                order_add_ons: list[str]) -> dict:
    blade = cfg["consumables"]["blades"][mat["blade_group"]]
    life_value = blade["blade_cost"] + blade["n_sharpenings"] * blade["sharpen_cost"]
    life_in = blade["base_life_in"] / mat["abrasion"]
    c_blade_per_in = life_value / life_in
    c_blade = cut["l_total_in"] * c_blade_per_in

    c_pack = cfg["consumables"]["packaging_base"] + cfg["consumables"]["packaging_per_part"] * ln.qty

    ff = cfg["face_finish"][ln.face_finish]
    sqft_total = (geo["a_net_in2"] / 144.0) * ln.qty
    c_finish_mat = ff.get("material_cost_per_sqft", 0.0) * sqft_total

    c_addon = 0.0
    for name in ln.normalised_add_ons():
        spec = cfg["add_ons"][name]
        c_addon += spec.get("consumable_per_part", 0.0) * ln.qty

    return {
        "blade_group": mat["blade_group"],
        "blade_life_in": life_in,
        "c_blade_per_in": c_blade_per_in,
        "c_blade": c_blade,
        "c_packaging": c_pack,
        "c_finish_material": c_finish_mat,
        "c_addon_consumable": c_addon,
        "c_consum": c_blade + c_pack + c_finish_mat + c_addon,
    }


# ---------------------------------------------------------------------------
# Module 6 - Compliance and add-on charges
# ---------------------------------------------------------------------------

def compliance_and_addons(req: QuoteRequest, cfg: dict) -> dict:
    c = cfg["compliance"]
    total = c["per_order"] + c["per_line_item"] * len(req.lines)
    detail: list[dict] = []

    for name in req.normalised_add_ons():
        spec = cfg["add_ons"][name]
        if spec.get("per") == "order":
            total += spec["price"]
            detail.append({"add_on": name, "label": spec["label"], "scope": "order",
                           "price": spec["price"]})

    for i, ln in enumerate(req.lines, start=1):
        for name in ln.normalised_add_ons():
            spec = cfg["add_ons"][name]
            per = spec.get("per", "line")
            if per == "line":
                amt = spec["price"]
            elif per == "part":
                amt = spec["price"] * ln.qty
            else:  # an order-scope add-on attached to a line applies once
                amt = spec["price"]
            total += amt
            detail.append({"add_on": name, "label": spec["label"], "scope": f"line {i}",
                           "price": round(amt, 2)})

    return {"c_comply": total, "detail": detail}


# ---------------------------------------------------------------------------
# Module 7 - Annealing
# ---------------------------------------------------------------------------

def annealing(ln: LineItem, basis: dict, cfg: dict) -> dict:
    if not ln.anneal:
        return {"applied": False, "c_anneal": 0.0, "oven_hours": 0.0, "t_handling_min": 0.0}
    an = cfg["annealing"]
    soak = an["soak_hours_per_in_thickness"] * basis["t_actual"]
    oven_hours = an["ramp_hours"] + soak
    c_oven = oven_hours * an["oven_rate_per_hr"] / an["batch_divisor"]
    c_handling = (an["handling_min"] / 60.0) * cfg["shop"]["burdened_rate_per_hr"]
    return {
        "applied": True,
        "soak_hours": soak,
        "oven_hours": oven_hours,
        "c_oven": c_oven,
        "t_handling_min": an["handling_min"],
        "c_handling": c_handling,
        "c_anneal": c_oven + c_handling,
    }


# ---------------------------------------------------------------------------
# Module 8 - Rework risk
# ---------------------------------------------------------------------------

def rework_risk(ln: LineItem, mat: dict, geo: dict, cfg: dict,
                c_mat_line: float, c_proc_line: float, annealed: bool) -> dict:
    rm = cfg["rework_model"]
    tol = cfg["tolerance_tiers"][ln.tolerance_tier]

    p = tol["p_rework_base"]

    max_dim = max(ln.length_in, ln.width_in)
    size_factor = 1.0 + max(0.0, (max_dim - 12.0) / 12.0) * rm["size_factor_per_12in_over"]
    p *= size_factor

    stress_applied = False
    if mat.get("residual_stress_flag") and ln.tolerance_tier != "STANDARD":
        p *= rm["residual_stress_multiplier"]
        stress_applied = True

    if mat.get("filled_grade"):
        p *= rm["filled_grade_multiplier"]

    anneal_credit = False
    if annealed and stress_applied:
        p *= cfg["annealing"]["rework_reduction_factor"]
        anneal_credit = True

    p = min(p, 0.85)
    expected = p * (c_mat_line + c_proc_line) * rm["severity"]

    return {
        "p_rework": p,
        "size_factor": size_factor,
        "residual_stress_applied": stress_applied,
        "anneal_credit_applied": anneal_credit,
        "c_rework_expected": expected,
    }


# ---------------------------------------------------------------------------
# Module 9 - Margin
# ---------------------------------------------------------------------------

def margin_for(cogs: float, cfg: dict) -> float:
    """
    Continuous piecewise-linear margin curve.

    A STEPPED margin schedule is non-monotone at its boundaries: shaving a
    dollar of cost can push an order into a higher-margin band and RAISE the
    quoted price. That is indefensible to a customer who just chose a cheaper
    option. Interpolating between the same anchor points keeps the intent
    (small orders carry more margin) while guaranteeing d(price)/d(COGS) > 0.
    """
    anchors = cfg["margin_curve"]["anchors"]
    if cogs <= anchors[0]["cogs"]:
        return anchors[0]["margin"]
    for a, b in zip(anchors, anchors[1:]):
        if cogs <= b["cogs"]:
            span = b["cogs"] - a["cogs"]
            if span <= 0:
                return b["margin"]
            f = (cogs - a["cogs"]) / span
            return a["margin"] + f * (b["margin"] - a["margin"])
    return anchors[-1]["margin"]


# ---------------------------------------------------------------------------
# Module 10 - Freight
# ---------------------------------------------------------------------------

def freight(lines_geo: list[dict], cfg: dict, dest_zip: str,
            threshold_basis: float) -> dict:
    """
    threshold_basis is the order value at the STANDARD lead tier, NOT the
    quoted subtotal.

    Why: a free-shipping threshold compared against the quoted price creates a
    cliff. A customer who picks the cheaper NEST tier can drop below the
    threshold, gain an $18 delivery fee, and end up paying MORE for choosing the
    slower option. Delivery cost has nothing to do with how fast we cut, so the
    threshold must not move with the lead tier. See the tier-monotonicity test.
    """
    f = cfg["freight"]

    box_l = max(g["length_in"] for g in lines_geo) + f["box_pad_length_in"]
    box_w = max(g["width_in"] for g in lines_geo) + f["box_pad_width_in"]
    box_h = sum(g["t_actual"] * g["qty"] for g in lines_geo) + f["box_pad_height_in"]

    dim_wt = (box_l * box_w * box_h) / f["dim_divisor"]
    content_lb = sum(g["a_net_in2"] * g["t_actual"] * g["density"] * g["qty"] for g in lines_geo)
    tare = f["packaging_tare_base_lb"] + f["packaging_tare_per_sqft_lb"] * (box_l * box_w / 144.0)
    act_wt = content_lb + tare
    bill_wt = math.ceil(max(dim_wt, act_wt))

    ld = f.get("local_delivery", {})
    if ld.get("enabled") and dest_zip in ld.get("zips", []):
        cost = 0.0 if threshold_basis >= ld["free_over"] else ld["flat_rate"]
        return {
            "box_l_in": box_l, "box_w_in": box_w, "box_h_in": box_h,
            "dim_weight_lb": dim_wt, "actual_weight_lb": act_wt,
            "billable_weight_lb": bill_wt,
            "c_freight": cost, "dest_zip": dest_zip,
            "rate_source": "LOCAL_DELIVERY",
            "method": "Local delivery, San Diego County",
        }

    rate = f["fallback_rate_ladder"][-1]["rate"]
    for step in f["fallback_rate_ladder"]:
        if bill_wt <= step["max_lb"]:
            rate = step["rate"]
            break

    return {
        "box_l_in": box_l, "box_w_in": box_w, "box_h_in": box_h,
        "dim_weight_lb": dim_wt, "actual_weight_lb": act_wt,
        "billable_weight_lb": bill_wt,
        "carrier_rate": rate,
        "c_freight": rate + f["handling_adder"],
        "dest_zip": dest_zip,
        "rate_source": "FALLBACK_LADDER",
        "method": "Ground",
    }


# ---------------------------------------------------------------------------
# Module 11 - Lead time
# ---------------------------------------------------------------------------

def _is_business_day(d: date, cfg: dict) -> bool:
    cal = cfg["calendar"]
    if _DAY_CODES[d.weekday()] not in cal["business_days"]:
        return False
    return d.isoformat() not in cal["holidays"]


def add_business_days(start: date, n: int, cfg: dict) -> date:
    d = start
    if n == 0:
        while not _is_business_day(d, cfg):
            d += timedelta(days=1)
        return d
    remaining = n
    while remaining > 0:
        d += timedelta(days=1)
        if _is_business_day(d, cfg):
            remaining -= 1
    return d


def lead_time(req: QuoteRequest, cfg: dict, needs_composite_day: bool,
              any_anneal: bool) -> dict:
    tier = cfg["lead_tiers"][req.lead_tier]
    start = req.order_date or date(2026, 9, 3)

    offset = tier["ship_offset_business_days"]
    if any_anneal:
        offset += cfg["annealing"]["adds_business_days"]

    ship = add_business_days(start, offset, cfg)

    composite_note = None
    if needs_composite_day:
        batch_days = cfg["calendar"]["composite_batch_days"]
        if tier["multiplier"] <= 1.0:
            probe = ship
            guard = 0
            while _DAY_CODES[probe.weekday()] not in batch_days or not _is_business_day(probe, cfg):
                probe += timedelta(days=1)
                guard += 1
                if guard > 21:
                    break
            if probe != ship:
                composite_note = (
                    f"Composite materials are cut on the scheduled batch day. "
                    f"Ship date moved from {ship.isoformat()} to {probe.isoformat()}."
                )
                ship = probe
        else:
            composite_note = "Off-cycle composite run; rush tier covers the changeover."

    return {
        "order_date": start.isoformat(),
        "cutoff_local": tier["cutoff_local"],
        "ship_offset_business_days": offset,
        "promised_ship_date": ship.isoformat(),
        "lead_label": tier["label"],
        "anneal_days_added": cfg["annealing"]["adds_business_days"] if any_anneal else 0,
        "composite_note": composite_note,
    }


# ---------------------------------------------------------------------------
# Master assembly
# ---------------------------------------------------------------------------

def quote(req: QuoteRequest, cfg: Optional[dict] = None) -> dict:
    cfg = cfg or load_config()
    validate(req, cfg)
    upgrade_notes = apply_forced_upgrades(req, cfg)

    mode = req.sourcing_mode or cfg["shop"]["sourcing_mode"]
    order_add_ons = req.normalised_add_ons()

    line_results: list[dict] = []
    lines_geo: list[dict] = []
    blade_groups_seen: set[str] = set()

    c_mat_total = c_proc_total = c_consum_total = 0.0
    c_mat_std_total = 0.0   # material at STD uplift; freight-threshold reference only
    c_anneal_total = c_rework_total = prorata_total = 0.0
    needs_composite_day = any_anneal = False

    for ln in req.lines:
        mat = cfg["materials"][ln.material_code]
        basis = cost_basis(mat, ln, cfg)
        geo = footprint(ln, mat, basis, cfg, req.lead_tier, mode, req.dropcut_quoted_cost)
        geo_std = footprint(ln, mat, basis, cfg, "STD", mode, req.dropcut_quoted_cost)
        c_mat_std_total += geo_std["c_mat"]
        cut = cut_time(ln, mat, basis, cfg)

        blade_change = mat["blade_group"] not in blade_groups_seen
        blade_groups_seen.add(mat["blade_group"])
        if mat["blade_group"] == "PCD_COMPOSITE":
            needs_composite_day = True

        lab = labor(ln, mat, basis, geo, cut, cfg, blade_change, order_add_ons)
        con = consumables(ln, mat, geo, cut, cfg, order_add_ons)
        ann = annealing(ln, basis, cfg)
        if ann["applied"]:
            any_anneal = True
            lab["t_total_min"] += ann["t_handling_min"]

        rew = rework_risk(ln, mat, geo, cfg, geo["c_mat"], lab["c_proc"], ann["applied"])

        a_sheet = mat["sheet_length_in"] * mat["sheet_width_in"]
        prorata = (geo["a_net_in2"] * ln.qty / a_sheet) * basis["c_sheet"]

        c_mat_total += geo["c_mat"]
        c_proc_total += lab["c_proc"]
        c_consum_total += con["c_consum"]
        c_anneal_total += ann["c_anneal"]
        c_rework_total += rew["c_rework_expected"]
        prorata_total += prorata

        tol = cfg["tolerance_tiers"][ln.tolerance_tier]
        line_results.append({
            "part_ref": ln.part_ref,
            "material_code": ln.material_code,
            "material_label": mat["label"],
            "brand": ln.brand,
            "brand_label": basis["brand_label"],
            "certification_tier": ln.certification_tier,
            "certification_label": basis["tier_label"],
            "tolerance_tier": ln.tolerance_tier,
            "tolerance_label": tol["label"],
            "edge_finish": ln.edge_finish,
            "edge_finish_label": cfg["edge_finish"][ln.edge_finish]["label"],
            "face_finish": ln.face_finish,
            "face_finish_label": cfg["face_finish"][ln.face_finish]["label"],
            "annealed": ann["applied"],
            "length_in": ln.length_in,
            "width_in": ln.width_in,
            "thickness_nominal_in": ln.thickness_in,
            "thickness_actual_in": round(basis["t_actual"], 4),
            "qty": ln.qty,
            "residual_stress_flag": mat["residual_stress_flag"],
            "basis": basis, "geometry": geo, "cut": cut, "labor": lab,
            "consumables": con, "annealing": ann, "rework": rew,
            "prorata_reference": prorata,
        })

        lines_geo.append({
            "length_in": ln.length_in, "width_in": ln.width_in,
            "t_actual": basis["t_actual"], "a_net_in2": geo["a_net_in2"],
            "density": mat["density_lb_in3"], "qty": ln.qty,
        })

    comp = compliance_and_addons(req, cfg)
    c_comply = comp["c_comply"]

    cogs = (c_mat_total + c_proc_total + c_consum_total + c_comply
            + c_anneal_total + c_rework_total)
    m = margin_for(cogs, cfg)
    rush = cfg["lead_tiers"][req.lead_tier]["multiplier"]

    # Rush multiplies conversion cost, never material.
    conversion = (c_proc_total + c_consum_total + c_comply + c_anneal_total + c_rework_total) * rush
    p_sub = c_mat_total + conversion
    p_pre = p_sub * (1.0 + m) + cfg["shop"]["order_intake_fee"]

    floored = max(p_pre, cfg["shop"]["price_floor"])
    floor_applied = floored > p_pre

    # Reference price at the STANDARD lead tier, using STANDARD's yield uplift.
    # Used only for the free-delivery threshold. It must be identical across all
    # five lead tiers, otherwise choosing a cheaper tier can drop the order under
    # the threshold, add a delivery fee, and raise the total.
    conversion_std = c_proc_total + c_consum_total + c_comply + c_anneal_total + c_rework_total
    cogs_std = c_mat_std_total + conversion_std
    m_std = margin_for(cogs_std, cfg)
    p_pre_std = (c_mat_std_total + conversion_std) * (1.0 + m_std) + cfg["shop"]["order_intake_fee"]
    threshold_basis = max(p_pre_std, cfg["shop"]["price_floor"])

    gamma = floored / prorata_total if prorata_total > 0 else None
    rails = cfg["sanity_rails"]
    flags: list[str] = []
    flags.extend(upgrade_notes)

    if not floor_applied and gamma is not None:
        if gamma > rails["gamma_max"]:
            flags.append(f"GAMMA_HIGH: {gamma:.2f}x pro-rata sheet cost. Likely uncompetitive.")
        if gamma < rails["gamma_min"]:
            flags.append(f"GAMMA_LOW: {gamma:.2f}x pro-rata sheet cost. Remnant risk not priced in.")
    if floor_applied:
        flags.append("FLOOR_APPLIED: modelled price fell below the minimum ticket. Gamma rails suppressed.")
    if any(r["residual_stress_flag"] and not r["annealed"] for r in line_results):
        flags.append("RESIDUAL_STRESS: disclose the 48-hour flatness note and offer annealing.")
    if "PCD_COMPOSITE" in blade_groups_seen and len(blade_groups_seen) > 1:
        flags.append("MIXED_BLADE_GROUPS: two changeovers priced; consider splitting the run.")
    if any(r["geometry"]["brand_locked"] for r in line_results):
        flags.append("BRAND_LOCKED: named mill source reduces remnant recovery and raises cost.")
    for r in line_results:
        if r["labor"].get("cleanroom_solvent") == "DI_WATER_LINT_FREE":
            flags.append(
                f"SOLVENT_SUBSTITUTION: {r['material_label']} is stress-crack sensitive; "
                "cleanroom process uses DI water, not IPA."
            )
    for r in line_results:
        if r["rework"]["p_rework"] > 0.12:
            flags.append(
                f"REWORK_RISK: {r['material_label']} at {r['tolerance_label']} carries a "
                f"{r['rework']['p_rework']:.0%} modelled scrap probability. Recommend annealing."
            )

    frt = freight(lines_geo, cfg, req.dest_zip, threshold_basis)
    lead = lead_time(req, cfg, needs_composite_day, any_anneal)

    pay = cfg["payments"]
    subtotal_goods = round(floored, 2)
    shipping = round(frt["c_freight"], 2)
    if pay["gross_up_enabled"]:
        total = (subtotal_goods + shipping + pay["stripe_fixed"]) / (1.0 - pay["stripe_pct"])
    else:
        total = subtotal_goods + shipping
    total = round(total, 2)

    cc = cfg["competitive_context"]
    comparison = None
    if subtotal_goods < cc["show_minimum_comparison_below"]:
        comparison = (
            f"This order is ${subtotal_goods:,.2f}. The nearest full-service fabricator "
            f"in San Diego County applies a ${cc['curbell_fabrication_minimum']:,.0f} "
            "minimum charge on custom cutting."
        )

    return {
        "schema_version": cfg["schema_version"],
        "sourcing_mode": mode,
        "lead_tier": req.lead_tier,
        "lead_label": cfg["lead_tiers"][req.lead_tier]["label"],
        "rush_multiplier": rush,
        "nest_uplift": cfg["lead_tiers"][req.lead_tier]["nest_uplift"],
        "lines": line_results,
        "add_on_detail": comp["detail"],
        "cost_breakdown": {
            "c_material": round(c_mat_total, 4),
            "c_processing": round(c_proc_total, 4),
            "c_consumables": round(c_consum_total, 4),
            "c_compliance": round(c_comply, 4),
            "c_annealing": round(c_anneal_total, 4),
            "c_rework_expected": round(c_rework_total, 4),
            "cogs": round(cogs, 4),
            "margin_rate": m,
            "conversion_after_rush": round(conversion, 4),
            "price_pre_floor": round(p_pre, 4),
        },
        "sanity": {
            "prorata_reference": round(prorata_total, 2),
            "gamma": round(gamma, 3) if gamma is not None else None,
            "floor_applied": floor_applied,
            "flags": flags,
        },
        "freight": frt,
        "lead_time": lead,
        "competitive_comparison": comparison,
        "totals": {
            "subtotal_goods": subtotal_goods,
            "shipping": shipping,
            "processing_adder": round(total - subtotal_goods - shipping, 2),
            "total_due": total,
            "currency": "usd",
            "total_cents": int(round(total * 100)),
        },
        "spec_statement": _spec_statement(req, cfg),
    }


def _spec_statement(req: QuoteRequest, cfg: dict) -> str:
    tiers = {ln.tolerance_tier for ln in req.lines}
    loosest = max(tiers, key=lambda t: cfg["tolerance_tiers"][t]["tolerance_in"])
    tol = cfg["tolerance_tiers"][loosest]
    return (
        f"Cut to nominal X-Y dimensions, tolerance +/-{tol['tolerance_in']:.3f} in. "
        f"Squareness {tol['squareness_in_per_12in']:.3f} in per 12 in. "
        "Thickness is as-supplied by the mill and is not machined. "
        "Four edges saw-cut and deburred."
    )


def quote_from_dict(payload: dict, cfg: Optional[dict] = None) -> dict:
    lines = [LineItem(**ln) for ln in payload["lines"]]
    od = payload.get("order_date")
    req = QuoteRequest(
        lines=lines,
        lead_tier=payload.get("lead_tier", "STD"),
        dest_zip=payload.get("dest_zip", "92020"),
        order_add_ons=payload.get("order_add_ons"),
        sourcing_mode=payload.get("sourcing_mode"),
        dropcut_quoted_cost=payload.get("dropcut_quoted_cost"),
        order_date=date.fromisoformat(od) if od else None,
    )
    return quote(req, cfg)
