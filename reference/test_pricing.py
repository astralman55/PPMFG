"""
Test suite for quote engine v2 + nester.

Run:  python test_pricing.py
Writes golden_cases.json, which the TypeScript port must reproduce.
"""

import json
import math
import os
import sys
from datetime import date

from pricing_engine import (
    LineItem, QuoteRequest, QuoteError, load_config, quote, quote_from_dict,
    cost_basis, margin_for, add_business_days,
)
import nesting
from nesting import NestPart, nest, plan_nest, group_queue

_HERE = os.path.dirname(os.path.abspath(__file__))
CFG = load_config()
PASS = FAIL = 0


def check(name, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  PASS  {name}")
    else:
        FAIL += 1
        print(f"  FAIL  {name}  {detail}")


def near(a, b, tol=0.01):
    return abs(a - b) <= tol


def mature_cfg():
    c = load_config()
    c["shop"]["remnant_recovery_rate"] = 0.50
    return c


MAT = mature_cfg()


def q(**kw):
    d = dict(material_code="PEEK_NAT", length_in=12.0, width_in=12.0,
             thickness_in=0.5, qty=1)
    line_keys = {"material_code", "length_in", "width_in", "thickness_in", "qty",
                 "brand", "certification_tier", "tolerance_tier", "edge_finish",
                 "face_finish", "anneal", "add_ons", "part_ref"}
    line_kw = {k: v for k, v in kw.items() if k in line_keys}
    req_kw = {k: v for k, v in kw.items() if k not in line_keys}
    d.update(line_kw)
    req = QuoteRequest(lines=[LineItem(**d)],
                       sourcing_mode=req_kw.pop("sourcing_mode", "MASTER_SHEET"),
                       **req_kw)
    return quote(req, MAT)


# ---------------------------------------------------------------------------
print("\n[1] Canonical case - PEEK 12x12x0.500, generic brand, Tier 1, standard")
# ---------------------------------------------------------------------------
c0 = q()
L = c0["lines"][0]
print(f"      c_area        ${L['basis']['c_area_per_in2']:.4f}/in2")
print(f"      eta_eff       {L['geometry']['eta_eff']:.4f}  (uplift {L['geometry']['nest_uplift']})")
print(f"      C_mat         ${L['geometry']['c_mat']:.2f}")
print(f"      C_proc        ${L['labor']['c_proc']:.2f}")
print(f"      C_rework      ${L['rework']['c_rework_expected']:.2f}  (p={L['rework']['p_rework']:.3f})")
print(f"      COGS          ${c0['cost_breakdown']['cogs']:.2f}   margin {c0['cost_breakdown']['margin_rate']:.0%}")
print(f"      gamma         {c0['sanity']['gamma']:.2f}x")
print(f"      ship date     {c0['lead_time']['promised_ship_date']}")
print(f"      TOTAL         ${c0['totals']['total_due']:.2f}")

check("STD tier applies its nest uplift", near(L["geometry"]["nest_uplift"], 0.12, 1e-9))
check("t_actual includes mill oversize", near(L["thickness_actual_in"], 0.535, 1e-9))
check("gamma inside rails",
      CFG["sanity_rails"]["gamma_min"] < c0["sanity"]["gamma"] < CFG["sanity_rails"]["gamma_max"])
check("local delivery applied to 92020", c0["freight"]["rate_source"] == "LOCAL_DELIVERY")
check("free local delivery over threshold", near(c0["totals"]["shipping"], 0.0, 1e-9))

# ---------------------------------------------------------------------------
print("\n[2] Brand as a first-class attribute")
# ---------------------------------------------------------------------------
gen = q(brand="GENERIC")
ens = q(brand="ENSINGER_TECAPEEK")
vic = q(brand="VICTREX")
print(f"      GENERIC  ${gen['totals']['total_due']:>9.2f}   eta_eff {gen['lines'][0]['geometry']['eta_eff']:.4f}")
print(f"      ENSINGER ${ens['totals']['total_due']:>9.2f}   eta_eff {ens['lines'][0]['geometry']['eta_eff']:.4f}")
print(f"      VICTREX  ${vic['totals']['total_due']:>9.2f}   eta_eff {vic['lines'][0]['geometry']['eta_eff']:.4f}")
check("named brand costs more than generic", ens["totals"]["total_due"] > gen["totals"]["total_due"])
check("Victrex premium exceeds Ensinger", vic["totals"]["total_due"] > ens["totals"]["total_due"])
check("brand lock suppresses remnant recovery",
      ens["lines"][0]["geometry"]["eta_eff"] < gen["lines"][0]["geometry"]["eta_eff"])
check("brand lock raises a flag", any("BRAND_LOCKED" in f for f in ens["sanity"]["flags"]))

try:
    q(brand="ENSINGER_TECAPEEK", certification_tier="INDUSTRIAL")
    check("named brand blocked on industrial tier", False, "no exception")
except QuoteError:
    check("named brand blocked on industrial tier", True)

# ---------------------------------------------------------------------------
print("\n[3] Certification tiers")
# ---------------------------------------------------------------------------
t1 = q(certification_tier="TIER1_TRACEABLE")
ind = q(certification_tier="INDUSTRIAL")
saving = 1 - ind["totals"]["total_due"] / t1["totals"]["total_due"]
print(f"      Tier 1     ${t1['totals']['total_due']:>9.2f}")
print(f"      Industrial ${ind['totals']['total_due']:>9.2f}   ({saving:.0%} lower)")
check("industrial tier is cheaper", ind["totals"]["total_due"] < t1["totals"]["total_due"])
check("industrial saving is material (>15%)", saving > 0.15)

try:
    q(certification_tier="INDUSTRIAL", add_ons=["fair_as9102"])
    check("FAIR blocked on industrial tier", False, "no exception")
except QuoteError:
    check("FAIR blocked on industrial tier", True)

# ---------------------------------------------------------------------------
print("\n[4] Tolerance tiers, extra passes, inspection")
# ---------------------------------------------------------------------------
std = q(tolerance_tier="STANDARD")
prc = q(tolerance_tier="PRECISION")
tgt = q(tolerance_tier="TIGHT")
for nm, r in (("STANDARD", std), ("PRECISION", prc), ("TIGHT", tgt)):
    ln = r["lines"][0]
    print(f"      {nm:<10} ${r['totals']['total_due']:>9.2f}  passes {ln['cut']['extra_passes']}  "
          f"insp {ln['labor']['t_inspection_min']:.1f} min  p_rework {ln['rework']['p_rework']:.3f}")
check("tighter tolerance costs more",
      tgt["totals"]["total_due"] > prc["totals"]["total_due"] > std["totals"]["total_due"])
check("extra passes add cut length", tgt["lines"][0]["cut"]["l_extra_in"] > 0)
check("rework probability rises with tolerance",
      tgt["lines"][0]["rework"]["p_rework"] > prc["lines"][0]["rework"]["p_rework"]
      > std["lines"][0]["rework"]["p_rework"])
check("high rework risk raises a flag", any("REWORK_RISK" in f for f in tgt["sanity"]["flags"]))

try:
    q(length_in=30.0, width_in=20.0, tolerance_tier="TIGHT")
    check("TIGHT gated by span", False, "no exception")
except QuoteError as e:
    check("TIGHT gated by span", "24" in str(e), str(e))

# ---------------------------------------------------------------------------
print("\n[5] Edge and face finish")
# ---------------------------------------------------------------------------
base = q(edge_finish="DEBURRED", face_finish="AS_SUPPLIED")
cham = q(edge_finish="CHAMFERED")
scr = q(edge_finish="SCRAPED")
film = q(face_finish="FILM_APPLIED")
clean = q(face_finish="CLEANROOM_PACK")
print(f"      deburred   ${base['totals']['total_due']:>9.2f}")
print(f"      chamfered  ${cham['totals']['total_due']:>9.2f}  (+{cham['lines'][0]['labor']['t_edge_finish_min']:.1f} min)")
print(f"      scraped    ${scr['totals']['total_due']:>9.2f}  (+{scr['lines'][0]['labor']['t_edge_finish_min']:.1f} min)")
print(f"      film       ${film['totals']['total_due']:>9.2f}")
print(f"      cleanroom  ${clean['totals']['total_due']:>9.2f}")
check("chamfer adds cost", cham["totals"]["total_due"] > base["totals"]["total_due"])
check("scraped edge adds cost", scr["totals"]["total_due"] > base["totals"]["total_due"])
check("film adds consumable cost", film["lines"][0]["consumables"]["c_finish_material"] > 0)
check("cleanroom is the most expensive face option",
      clean["totals"]["total_due"] > film["totals"]["total_due"] > base["totals"]["total_due"])

peek_clean = q(material_code="PEEK_NAT", face_finish="CLEANROOM_PACK")
ultem_clean = q(material_code="ULTEM_1000", thickness_in=0.5, face_finish="CLEANROOM_PACK")
check("PEEK cleanroom uses IPA",
      peek_clean["lines"][0]["labor"]["cleanroom_solvent"] == "IPA_WIPE")
check("Ultem cleanroom switches to DI water",
      ultem_clean["lines"][0]["labor"]["cleanroom_solvent"] == "DI_WATER_LINT_FREE")
check("solvent substitution flagged",
      any("SOLVENT_SUBSTITUTION" in f for f in ultem_clean["sanity"]["flags"]))

# ---------------------------------------------------------------------------
print("\n[6] Annealing")
# ---------------------------------------------------------------------------
plain = q(tolerance_tier="PRECISION")
ann = q(tolerance_tier="PRECISION", anneal=True)
print(f"      no anneal  ${plain['totals']['total_due']:>9.2f}  p_rework {plain['lines'][0]['rework']['p_rework']:.3f}")
print(f"      annealed   ${ann['totals']['total_due']:>9.2f}  p_rework {ann['lines'][0]['rework']['p_rework']:.3f}")
print(f"      ship dates {plain['lead_time']['promised_ship_date']} -> {ann['lead_time']['promised_ship_date']}")
check("annealing adds cost", ann["cost_breakdown"]["c_annealing"] > 0)
check("annealing reduces rework probability",
      ann["lines"][0]["rework"]["p_rework"] < plain["lines"][0]["rework"]["p_rework"])
check("annealing credit recorded", ann["lines"][0]["rework"]["anneal_credit_applied"])
check("annealing pushes the ship date",
      ann["lead_time"]["promised_ship_date"] > plain["lead_time"]["promised_ship_date"])
check("annealing suppresses the residual-stress flag",
      not any("RESIDUAL_STRESS" in f for f in ann["sanity"]["flags"]))

try:
    q(anneal=True, lead_tier="SAMEDAY")
    check("anneal blocked on same-day", False, "no exception")
except QuoteError:
    check("anneal blocked on same-day", True)

try:
    q(material_code="G10_FR4", thickness_in=0.25, anneal=True)
    check("anneal blocked on ineligible material", False, "no exception")
except QuoteError:
    check("anneal blocked on ineligible material", True)

# ---------------------------------------------------------------------------
print("\n[7] Lead tiers - rush costs twice, NEST pays back")
# ---------------------------------------------------------------------------
rows = {}
for t in ("SAMEDAY", "RUSH24", "RUSH48", "STD", "NEST"):
    r = q(lead_tier=t)
    rows[t] = r
    ln = r["lines"][0]
    print(f"      {t:<8} x{r['rush_multiplier']:.2f}  uplift {r['nest_uplift']:.2f}  "
          f"eta_eff {ln['geometry']['eta_eff']:.4f}  ${r['totals']['total_due']:>9.2f}  "
          f"ship {r['lead_time']['promised_ship_date']}")
check("price falls monotonically as lead time lengthens",
      rows["SAMEDAY"]["totals"]["total_due"] > rows["RUSH24"]["totals"]["total_due"]
      > rows["RUSH48"]["totals"]["total_due"] > rows["STD"]["totals"]["total_due"]
      > rows["NEST"]["totals"]["total_due"])
check("rush forfeits the nesting uplift", rows["RUSH24"]["nest_uplift"] == 0.0)
check("NEST yields the highest effective yield",
      rows["NEST"]["lines"][0]["geometry"]["eta_eff"]
      > rows["STD"]["lines"][0]["geometry"]["eta_eff"]
      > rows["RUSH24"]["lines"][0]["geometry"]["eta_eff"])

# Tier monotonicity sweep. A free-shipping threshold compared against the
# quoted price creates a cliff where picking the cheaper NEST tier drops the
# order below the threshold, adds a delivery fee, and RAISES the total. Sweep
# the whole catalogue across sizes and both zip classes to prove it cannot
# happen. This is the regression guard for that bug.
ORDER = ["SAMEDAY", "RUSH24", "RUSH48", "STD", "NEST"]
inversions = []
for mcode, mspec in CFG["materials"].items():
    for dims in ((6, 6), (12, 12), (18, 10)):
        t = mspec["stock_thicknesses_in"][len(mspec["stock_thicknesses_in"]) // 2]
        for zipc in ("92020", "10001"):
            try:
                totals = [quote(QuoteRequest(
                    lines=[LineItem(mcode, dims[0], dims[1], t, 1)],
                    lead_tier=tier, dest_zip=zipc,
                    sourcing_mode="MASTER_SHEET"), MAT)["totals"]["total_due"]
                    for tier in ORDER]
            except QuoteError:
                continue
            for a, b in zip(totals, totals[1:]):
                if b > a + 1e-9:
                    inversions.append((mcode, dims, zipc, totals))
                    break
print(f"      swept {len(CFG['materials'])} materials x 3 sizes x 2 zips across 5 tiers")
check("no lead-tier price inversion anywhere in the catalogue",
      not inversions, f"{len(inversions)} inversions, first: {inversions[:1]}")
check("NEST is cheaper than STD on the canonical part",
      rows["STD"]["totals"]["total_due"] > rows["NEST"]["totals"]["total_due"])

# ---------------------------------------------------------------------------
print("\n[8] Add-ons")
# ---------------------------------------------------------------------------
plain2 = q()
fair = q(add_ons=["fair_as9102"], tolerance_tier="STANDARD")
mark = q(add_ons=["part_marking", "individual_bagging"], qty=10)
print(f"      plain          ${plain2['totals']['total_due']:>9.2f}")
print(f"      + AS9102 FAIR  ${fair['totals']['total_due']:>9.2f}")
check("FAIR adds cost", fair["totals"]["total_due"] > plain2["totals"]["total_due"])
check("FAIR forces a tolerance upgrade", fair["lines"][0]["tolerance_tier"] == "PRECISION")
check("tolerance upgrade is disclosed", any("AS9102" in f for f in fair["sanity"]["flags"]))
check("per-part add-ons scale with qty",
      mark["lines"][0]["consumables"]["c_addon_consumable"] > 4.0)

order_level = quote(QuoteRequest(
    lines=[LineItem("PEEK_NAT", 12, 12, 0.5, 1)],
    order_add_ons=["wet_signature_coc", "full_chain_traceability"],
    sourcing_mode="MASTER_SHEET"), MAT)
check("order-scope add-ons hit compliance",
      near(order_level["cost_breakdown"]["c_compliance"], 4.0 + 8.0 + 25.0 + 45.0, 1e-6),
      f"got {order_level['cost_breakdown']['c_compliance']}")

# ---------------------------------------------------------------------------
print("\n[9] Lead time calendar")
# ---------------------------------------------------------------------------
fri = date(2026, 9, 4)
check("STD from Friday skips the weekend",
      add_business_days(fri, 4, CFG).isoformat() == "2026-09-10",
      add_business_days(fri, 4, CFG).isoformat())
check("Thanksgiving holiday skipped",
      add_business_days(date(2026, 11, 25), 1, CFG).isoformat() == "2026-11-30",
      add_business_days(date(2026, 11, 25), 1, CFG).isoformat())

# Ordered Thu 3 Sep, STD +4 business days lands on Wed 9 Sep, which already IS
# the composite batch day. No slip should be reported.
g10_ok = quote(QuoteRequest(
    lines=[LineItem("G10_FR4", 12, 12, 0.25, 1)],
    lead_tier="STD", order_date=date(2026, 9, 3), sourcing_mode="MASTER_SHEET"), MAT)
# Ordered Tue 8 Sep, STD +4 lands on Mon 14 Sep, which must slip to Wed 16 Sep.
g10_slip = quote(QuoteRequest(
    lines=[LineItem("G10_FR4", 12, 12, 0.25, 1)],
    lead_tier="STD", order_date=date(2026, 9, 8), sourcing_mode="MASTER_SHEET"), MAT)
print(f"      G10 ordered Thu 3rd -> ship {g10_ok['lead_time']['promised_ship_date']} "
      f"(slip: {g10_ok['lead_time']['composite_note'] is not None})")
print(f"      G10 ordered Tue 8th -> ship {g10_slip['lead_time']['promised_ship_date']} "
      f"(slip: {g10_slip['lead_time']['composite_note'] is not None})")
check("no slip reported when the date already lands on the batch day",
      g10_ok["lead_time"]["composite_note"] is None)
check("composite order slips to the next batch day",
      g10_slip["lead_time"]["promised_ship_date"] == "2026-09-16",
      g10_slip["lead_time"]["promised_ship_date"])
check("slip is disclosed to the customer",
      g10_slip["lead_time"]["composite_note"] is not None)
check("both composite ship dates are Wednesdays",
      date.fromisoformat(g10_ok["lead_time"]["promised_ship_date"]).weekday() == 2
      and date.fromisoformat(g10_slip["lead_time"]["promised_ship_date"]).weekday() == 2)

# ---------------------------------------------------------------------------
print("\n[10] Competitive comparison surfaces below the fabricator minimum")
# ---------------------------------------------------------------------------
small = q(material_code="DELRIN_150", length_in=6, width_in=6, thickness_in=0.25)
big = q()
print(f"      small Delrin  ${small['totals']['subtotal_goods']:>9.2f}  "
      f"comparison shown: {small['competitive_comparison'] is not None}")
check("comparison shown below $250", small["competitive_comparison"] is not None)
check("comparison hidden above $250", big["competitive_comparison"] is None)

# ---------------------------------------------------------------------------
print("\n[11] Invariants carried over from v1")
# ---------------------------------------------------------------------------
b = q()["totals"]["total_due"]
check("larger area costs more", q(length_in=18.0)["totals"]["total_due"] > b)
check("thicker costs more", q(thickness_in=0.75)["totals"]["total_due"] > b)
check("more qty costs more", q(qty=5)["totals"]["total_due"] > b)
check("unit price falls with qty", q(qty=10)["totals"]["total_due"] / 10 < b)
check("determinism", q()["totals"]["total_due"] == q()["totals"]["total_due"])
check("margin anchor at COGS 150 -> 55%", near(margin_for(150.0, CFG), 0.55, 1e-9))
check("margin anchor at COGS 1000 -> 35%", near(margin_for(1000.0, CFG), 0.35, 1e-9))
check("margin interpolates between anchors",
      near(margin_for(275.0, CFG), 0.50, 1e-9), f"{margin_for(275.0, CFG)}")
check("margin is continuous at every anchor",
      all(near(margin_for(a["cogs"] - 0.01, CFG), margin_for(a["cogs"] + 0.01, CFG), 1e-3)
          for a in CFG["margin_curve"]["anchors"][1:-1]))
check("margin decreases monotonically with COGS",
      all(margin_for(x, CFG) >= margin_for(x + 25, CFG) - 1e-12
          for x in range(0, 8000, 25)))
# The property the margin curve exists to guarantee: price must never fall when
# cost rises. A stepped schedule violates this at its boundaries.
prices = [c * (1 + margin_for(c, CFG)) for c in [x / 4 for x in range(0, 40000)]]
check("price rises monotonically with COGS everywhere",
      all(b >= a - 1e-9 for a, b in zip(prices, prices[1:])))

for label, kw in (
    ("unknown material", dict(material_code="UNOBTAINIUM")),
    ("non-stock thickness", dict(thickness_in=0.437)),
    ("blank larger than sheet", dict(length_in=46, width_in=30)),
    ("dimension below minimum", dict(length_in=0.4)),
    ("qty above cap", dict(qty=999)),
):
    try:
        q(**kw)
        check(label + " rejected", False, "no exception")
    except QuoteError:
        check(label + " rejected", True)

# dimensional weight
dimw = q(material_code="PTFE_VIRGIN", length_in=24, width_in=20, thickness_in=0.0625,
         dest_zip="99999")
f = dimw["freight"]
check("dim weight governs a thin panel", f["dim_weight_lb"] > f["actual_weight_lb"])
check("non-local zip uses carrier ladder", f["rate_source"] == "FALLBACK_LADDER")

# ---------------------------------------------------------------------------
print("\n[12] Nester - guillotine shelf packing")
# ---------------------------------------------------------------------------
# Geometry check the business depends on: a 12x12 blank (12.25 with kerf) on
# 24x48 stock allows only ONE shelf, because 2 x 12.25 + kerf = 24.625 in
# exceeds the 23.875 in usable width. Three per sheet, and the leftover is an
# 11.6 x 47.9 in band. The flagship product is an awkward nest, and the whole
# margin case rests on that band being sold as smaller blanks.
three = [NestPart(f"p{i}", "ORD-1", 12.25, 12.25) for i in range(3)]
four = [NestPart(f"p{i}", "ORD-1", 12.25, 12.25) for i in range(4)]
s3 = nest(three, 48.0, 24.0, CFG)["summary"]
res = nest(four, 48.0, 24.0, CFG)
s = res["summary"]
print(f"      3x 12.25in on 48x24: sheets {s3['sheet_count']}, util {s3['utilisation']:.1%}, "
      f"recoverable {s3['recoverable_fraction']:.1%}")
print(f"      4x 12.25in on 48x24: sheets {s['sheet_count']}, util {s['utilisation']:.1%}, "
      f"recoverable {s['recoverable_fraction']:.1%}")
check("exactly three 12in blanks fit one 24x48 sheet", s3["sheet_count"] == 1)
check("a fourth 12in blank opens a second sheet", s["sheet_count"] == 2)
check("the leftover band is captured as keepable remnant, not scrap",
      s3["recoverable_fraction"] > 0.95, f"{s3['recoverable_fraction']}")
check("raw utilisation on a 12x12 run is poor, as expected",
      0.30 < s3["utilisation"] < 0.45, f"{s3['utilisation']}")
check("no part exceeds sheet bounds",
      all(p.x + p.length_in <= 48.0 + 1e-6 and p.y + p.width_in <= 24.0 + 1e-6
          for sh in res["sheets"] for p in sh.placements))

# strips must not overlap in y — the guillotine guarantee
for sh in res["sheets"]:
    strips = {}
    for p in sh.placements:
        strips.setdefault(p.strip_index, []).append(p)
    ys = sorted((min(p.y for p in ps), max(p.y + p.width_in for p in ps))
                for ps in strips.values())
    ok = all(ys[i][1] <= ys[i + 1][0] + 1e-6 for i in range(len(ys) - 1))
    check("strips do not overlap (guillotine feasible)", ok)

# Determinism
r1 = nest([NestPart(f"p{i}", "O", 7.0, 5.0) for i in range(11)], 48.0, 24.0, CFG)
r2 = nest([NestPart(f"p{i}", "O", 7.0, 5.0) for i in range(11)], 48.0, 24.0, CFG)
check("nester is deterministic", r1["summary"] == r2["summary"])

# Rotation helps
rot_cfg = load_config()
norot_cfg = load_config()
norot_cfg["nesting"]["allow_rotation"] = False
awkward = [NestPart(f"p{i}", "O", 22.0, 5.0) for i in range(6)]
with_rot = nest(awkward, 48.0, 24.0, rot_cfg)["summary"]
no_rot = nest(awkward, 48.0, 24.0, norot_cfg)["summary"]
print(f"      rotation on:  {with_rot['sheet_count']} sheet(s), util {with_rot['utilisation']:.1%}")
print(f"      rotation off: {no_rot['sheet_count']} sheet(s), util {no_rot['utilisation']:.1%}")
check("rotation never uses more sheets", with_rot["sheet_count"] <= no_rot["sheet_count"])

# Oversized part
try:
    nest([NestPart("big", "O", 60.0, 30.0)], 48.0, 24.0, CFG)
    check("oversized part rejected by nester", False, "no exception")
except ValueError:
    check("oversized part rejected by nester", True)

# ---------------------------------------------------------------------------
print("\n[13] Cross-order batching - the Nox mechanism")
# ---------------------------------------------------------------------------
single_order = [{"order_id": "A", "line_no": 1, "material_code": "PEEK_NAT",
                 "brand": "GENERIC", "thickness_nominal": 0.5,
                 "certification_tier": "TIER1_TRACEABLE",
                 "length_in": 11.0, "width_in": 7.0, "qty": 2}]
three_orders = single_order + [
    {"order_id": "B", "line_no": 1, "material_code": "PEEK_NAT", "brand": "GENERIC",
     "thickness_nominal": 0.5, "certification_tier": "TIER1_TRACEABLE",
     "length_in": 9.0, "width_in": 6.5, "qty": 3},
    {"order_id": "C", "line_no": 1, "material_code": "PEEK_NAT", "brand": "GENERIC",
     "thickness_nominal": 0.5, "certification_tier": "TIER1_TRACEABLE",
     "length_in": 14.0, "width_in": 4.0, "qty": 4},
]
p1 = plan_nest(single_order, CFG)[0]["summary"]
p3 = plan_nest(three_orders, CFG)[0]["summary"]
print(f"      1 order  ({p1['order_count']} on sheet): util {p1['utilisation']:.1%}, "
      f"eta_realised {p1['eta_realised']:.1%}, sheets {p1['sheet_count']}")
print(f"      3 orders ({p3['order_count']} on sheet): util {p3['utilisation']:.1%}, "
      f"eta_realised {p3['eta_realised']:.1%}, sheets {p3['sheet_count']}")
check("batching raises utilisation", p3["utilisation"] > p1["utilisation"])
check("all three orders share one sheet", p3["sheet_count"] == 1 and p3["order_count"] == 3)
check("cut sequence produced", len(plan_nest(three_orders, CFG)[0]["cut_sequence"]) > 5)

# Groups must not mix incompatible material
mixed = three_orders + [
    {"order_id": "D", "line_no": 1, "material_code": "PEEK_NAT", "brand": "VICTREX",
     "thickness_nominal": 0.5, "certification_tier": "TIER1_TRACEABLE",
     "length_in": 8.0, "width_in": 8.0, "qty": 1},
    {"order_id": "E", "line_no": 1, "material_code": "PEEK_NAT", "brand": "GENERIC",
     "thickness_nominal": 0.5, "certification_tier": "INDUSTRIAL",
     "length_in": 8.0, "width_in": 8.0, "qty": 1},
]
groups = group_queue(mixed, CFG)
check("brand splits the nest group", len(groups) == 3, f"got {len(groups)} groups")
check("certification tier splits the nest group",
      any(k[3] == "INDUSTRIAL" for k in groups))

# Grain-sensitive material is not rotated
g10_rows = [{"order_id": "G", "line_no": 1, "material_code": "G10_FR4", "brand": "GENERIC",
             "thickness_nominal": 0.25, "certification_tier": "TIER1_TRACEABLE",
             "length_in": 20.0, "width_in": 6.0, "qty": 4}]
g10_plan = plan_nest(g10_rows, CFG)[0]
check("grain-sensitive parts are never rotated",
      all(not p.rotated for sh in g10_plan["sheets"] for p in sh.placements))

# ---------------------------------------------------------------------------
print("\n[14] Golden cases")
# ---------------------------------------------------------------------------
GOLDEN = [
    {"name": "canonical_peek_12x12", "lines": [dict(material_code="PEEK_NAT", length_in=12, width_in=12, thickness_in=0.5, qty=1)], "lead_tier": "STD", "sourcing_mode": "MASTER_SHEET", "order_date": "2026-09-03"},
    {"name": "peek_ensinger_avl", "lines": [dict(material_code="PEEK_NAT", length_in=12, width_in=12, thickness_in=0.5, qty=1, brand="ENSINGER_TECAPEEK")], "lead_tier": "STD", "sourcing_mode": "MASTER_SHEET", "order_date": "2026-09-03"},
    {"name": "peek_industrial_tier", "lines": [dict(material_code="PEEK_NAT", length_in=12, width_in=12, thickness_in=0.5, qty=1, certification_tier="INDUSTRIAL")], "lead_tier": "STD", "sourcing_mode": "MASTER_SHEET", "order_date": "2026-09-03"},
    {"name": "peek_nest_tier", "lines": [dict(material_code="PEEK_NAT", length_in=12, width_in=12, thickness_in=0.5, qty=1)], "lead_tier": "NEST", "sourcing_mode": "MASTER_SHEET", "order_date": "2026-09-03"},
    {"name": "peek_sameday", "lines": [dict(material_code="PEEK_NAT", length_in=12, width_in=12, thickness_in=0.5, qty=1)], "lead_tier": "SAMEDAY", "sourcing_mode": "MASTER_SHEET", "order_date": "2026-09-03"},
    {"name": "ultem_precision_annealed_cleanroom", "lines": [dict(material_code="ULTEM_1000", length_in=10, width_in=8, thickness_in=0.375, qty=2, tolerance_tier="PRECISION", face_finish="CLEANROOM_PACK", edge_finish="CHAMFERED", anneal=True)], "lead_tier": "STD", "sourcing_mode": "MASTER_SHEET", "order_date": "2026-09-03"},
    {"name": "peek_tight_fair", "lines": [dict(material_code="PEEK_NAT", length_in=8, width_in=6, thickness_in=0.5, qty=3, tolerance_tier="TIGHT", add_ons=["fair_as9102", "dimensional_report"], anneal=True)], "lead_tier": "RUSH48", "order_add_ons": ["wet_signature_coc"], "sourcing_mode": "MASTER_SHEET", "order_date": "2026-09-03"},
    {"name": "delrin_floor_case", "lines": [dict(material_code="DELRIN_150", length_in=2, width_in=2, thickness_in=0.125, qty=1)], "lead_tier": "STD", "sourcing_mode": "MASTER_SHEET", "order_date": "2026-09-03"},
    {"name": "g10_composite_batchday", "lines": [dict(material_code="G10_FR4", length_in=12, width_in=12, thickness_in=0.25, qty=3)], "lead_tier": "STD", "sourcing_mode": "MASTER_SHEET", "order_date": "2026-09-03"},
    {"name": "ptfe_dim_weight_remote", "lines": [dict(material_code="PTFE_VIRGIN", length_in=24, width_in=20, thickness_in=0.0625, qty=1, edge_finish="SCRAPED")], "lead_tier": "STD", "dest_zip": "10001", "sourcing_mode": "MASTER_SHEET", "order_date": "2026-09-03"},
    {"name": "torlon_high_value", "lines": [dict(material_code="TORLON_4203", length_in=6, width_in=4, thickness_in=0.5, qty=1, brand="SOLVAY_TORLON")], "lead_tier": "RUSH48", "sourcing_mode": "MASTER_SHEET", "order_date": "2026-09-03"},
    {"name": "multiline_mixed_blades", "lines": [
        dict(material_code="PEEK_NAT", length_in=8, width_in=6, thickness_in=0.5, qty=2),
        dict(material_code="ULTEM_1000", length_in=10, width_in=4, thickness_in=0.25, qty=4),
        dict(material_code="G10_FR4", length_in=12, width_in=12, thickness_in=0.125, qty=1)],
     "lead_tier": "RUSH24", "order_add_ons": ["full_chain_traceability"], "sourcing_mode": "MASTER_SHEET", "order_date": "2026-09-03"},
    {"name": "jit_dropcut", "lines": [dict(material_code="PEEK_NAT", length_in=12, width_in=12, thickness_in=0.5, qty=1)], "lead_tier": "STD", "sourcing_mode": "JIT_DROPCUT", "dropcut_quoted_cost": 430.0, "order_date": "2026-09-03"},
]

golden = {
    "generated_by": "pricing_engine.py v2 reference implementation",
    "config_schema_version": CFG["schema_version"],
    "config_override": {"shop.remnant_recovery_rate": 0.50},
    "tolerance_usd": 0.01,
    "instructions": "The TypeScript port must reproduce every field in `expect` for every case, using config.json with config_override applied.",
    "cases": [],
}
for gi in GOLDEN:
    payload = {k: v for k, v in gi.items() if k != "name"}
    out = quote_from_dict(payload, mature_cfg())
    golden["cases"].append({
        "name": gi["name"], "input": payload,
        "expect": {
            "subtotal_goods": out["totals"]["subtotal_goods"],
            "shipping": out["totals"]["shipping"],
            "total_due": out["totals"]["total_due"],
            "total_cents": out["totals"]["total_cents"],
            "cogs": out["cost_breakdown"]["cogs"],
            "margin_rate": out["cost_breakdown"]["margin_rate"],
            "c_rework_expected": out["cost_breakdown"]["c_rework_expected"],
            "c_annealing": out["cost_breakdown"]["c_annealing"],
            "gamma": out["sanity"]["gamma"],
            "promised_ship_date": out["lead_time"]["promised_ship_date"],
        },
    })

with open(os.path.join(_HERE, "golden_cases.json"), "w") as fh:
    json.dump(golden, fh, indent=2)

for c in golden["cases"]:
    e = c["expect"]
    print(f"      {c['name']:<36} ${e['total_due']:>9.2f}   ship {e['promised_ship_date']}")

print(f"\n{'='*68}\n  {PASS} passed, {FAIL} failed\n{'='*68}")
sys.exit(1 if FAIL else 0)
