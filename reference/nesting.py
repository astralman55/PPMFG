"""
Guillotine shelf nester.

WHY THIS ALGORITHM AND NOT A GENERAL RECTANGLE PACKER
-----------------------------------------------------
A sliding table saw can only make edge-to-edge cuts. You rip the sheet into
strips, then crosscut each strip into parts. Every cut runs fully across the
piece it is cutting. That is the definition of a guillotine constraint, and
shelf packing is its exact expression - not an approximation.

A free-form maxrects or skyline packer will return layouts with higher paper
utilisation that are physically uncuttable on this machine. Do not substitute
one. If the shop ever buys a CNC router, revisit this file and only this file.

WHAT IT IS FOR
--------------
Two jobs, and they are separate:

  1. FULFILMENT.  Given the current nest queue, produce a real cut plan: strip
     layout, cut sequence, and the list of remnants worth keeping.

  2. CALIBRATION. Realised utilisation across many nests is what tells you the
     true value of `remnant_recovery_rate` and the `nest_uplift` figures in
     config.json. The nester does not set customer prices. It measures whether
     the prices you quoted were right.

Deterministic: a fixed seed and a fixed restart count mean the same queue always
produces the same plan. An operator must be able to re-run a nest and get the
same sheet back.
"""

from __future__ import annotations

import json
import os
import random
from dataclasses import dataclass, field
from typing import Optional

_HERE = os.path.dirname(os.path.abspath(__file__))


def load_config(path: Optional[str] = None) -> dict:
    with open(path or os.path.join(_HERE, "config.json"), "r") as fh:
        return json.load(fh)


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

@dataclass
class NestPart:
    """One physical blank to be cut. qty is expanded before nesting."""
    part_id: str
    order_id: str
    length_in: float
    width_in: float
    rotatable: bool = True

    @property
    def area(self) -> float:
        return self.length_in * self.width_in


@dataclass
class Placement:
    part_id: str
    order_id: str
    x: float
    y: float
    length_in: float
    width_in: float
    rotated: bool
    strip_index: int


@dataclass
class Remnant:
    length_in: float
    width_in: float
    x: float
    y: float
    source: str          # 'strip_tail' | 'sheet_tail'
    keepable: bool

    @property
    def area(self) -> float:
        return self.length_in * self.width_in


@dataclass
class Sheet:
    index: int
    length_in: float
    width_in: float
    placements: list[Placement] = field(default_factory=list)
    remnants: list[Remnant] = field(default_factory=list)

    @property
    def area(self) -> float:
        return self.length_in * self.width_in

    @property
    def placed_area(self) -> float:
        return sum(p.length_in * p.width_in for p in self.placements)

    @property
    def utilisation(self) -> float:
        return self.placed_area / self.area if self.area else 0.0

    @property
    def keepable_remnant_area(self) -> float:
        return sum(r.area for r in self.remnants if r.keepable)

    @property
    def scrap_area(self) -> float:
        return self.area - self.placed_area - self.keepable_remnant_area


# ---------------------------------------------------------------------------
# Core packer
# ---------------------------------------------------------------------------

def _pack_once(parts: list[NestPart], sheet_l: float, sheet_w: float,
               kerf: float, trim: float, min_keep: float,
               allow_rotation: bool) -> list[Sheet]:
    """
    One deterministic pass of shelf packing over a given part ORDER.

    Geometry convention: strips run the full usable LENGTH of the sheet.
    Strip height consumes usable WIDTH. Parts sit along a strip in x.
    """
    usable_l = sheet_l - 2 * trim
    usable_w = sheet_w - 2 * trim

    sheets: list[Sheet] = []

    def new_sheet() -> dict:
        return {
            "sheet": Sheet(index=len(sheets), length_in=sheet_l, width_in=sheet_w),
            "strips": [],        # each: {y, height, cursor_x}
            "w_used": 0.0,
        }

    state = new_sheet()

    def close_sheet(st: dict) -> None:
        sh: Sheet = st["sheet"]
        # Tail of every strip becomes a remnant.
        for si, strip in enumerate(st["strips"]):
            tail = usable_l - strip["cursor_x"]
            if tail > 0:
                keep = tail >= min_keep and strip["height"] >= min_keep
                sh.remnants.append(Remnant(
                    length_in=round(tail, 4), width_in=round(strip["height"], 4),
                    x=round(trim + strip["cursor_x"], 4), y=round(trim + strip["y"], 4),
                    source="strip_tail", keepable=keep,
                ))
        # Unused band across the bottom of the sheet.
        band = usable_w - st["w_used"]
        if band > 0:
            keep = band >= min_keep and usable_l >= min_keep
            sh.remnants.append(Remnant(
                length_in=round(usable_l, 4), width_in=round(band, 4),
                x=round(trim, 4), y=round(trim + st["w_used"], 4),
                source="sheet_tail", keepable=keep,
            ))
        sheets.append(sh)

    for part in parts:
        orientations = [(part.length_in, part.width_in, False)]
        if allow_rotation and part.rotatable and part.length_in != part.width_in:
            orientations.append((part.width_in, part.length_in, True))

        placed = False
        while not placed:
            # 1. Best-fit into an existing strip: least leftover strip height.
            best = None
            for si, strip in enumerate(state["strips"]):
                for (pl, pw, rot) in orientations:
                    if pw > strip["height"] + 1e-9:
                        continue
                    need = pl + (kerf if strip["cursor_x"] > 0 else 0.0)
                    if strip["cursor_x"] + need > usable_l + 1e-9:
                        continue
                    waste = strip["height"] - pw
                    if best is None or waste < best[0]:
                        best = (waste, si, pl, pw, rot, need)

            if best is not None:
                _, si, pl, pw, rot, need = best
                strip = state["strips"][si]
                x = strip["cursor_x"] + (kerf if strip["cursor_x"] > 0 else 0.0)
                state["sheet"].placements.append(Placement(
                    part_id=part.part_id, order_id=part.order_id,
                    x=round(trim + x, 4), y=round(trim + strip["y"], 4),
                    length_in=pl, width_in=pw, rotated=rot, strip_index=si,
                ))
                strip["cursor_x"] += need
                placed = True
                continue

            # 2. Open a new strip. Prefer the orientation that wastes least width.
            opened = False
            for (pl, pw, rot) in sorted(orientations, key=lambda o: o[1]):
                need_w = pw + (kerf if state["strips"] else 0.0)
                if state["w_used"] + need_w <= usable_w + 1e-9 and pl <= usable_l + 1e-9:
                    y = state["w_used"] + (kerf if state["strips"] else 0.0)
                    state["strips"].append({"y": y, "height": pw, "cursor_x": 0.0})
                    state["w_used"] = y + pw
                    si = len(state["strips"]) - 1
                    state["sheet"].placements.append(Placement(
                        part_id=part.part_id, order_id=part.order_id,
                        x=round(trim, 4), y=round(trim + y, 4),
                        length_in=pl, width_in=pw, rotated=rot, strip_index=si,
                    ))
                    state["strips"][si]["cursor_x"] = pl
                    opened = True
                    placed = True
                    break
            if opened:
                continue

            # 3. Sheet is full. Close it and start another.
            if not state["sheet"].placements:
                raise ValueError(
                    f"Part {part.part_id} ({part.length_in} x {part.width_in} in) "
                    f"does not fit a {sheet_l} x {sheet_w} in sheet after edge trim."
                )
            close_sheet(state)
            state = new_sheet()

    close_sheet(state)
    return sheets


# ---------------------------------------------------------------------------
# Multi-restart driver
# ---------------------------------------------------------------------------

def nest(parts: list[NestPart], sheet_l: float, sheet_w: float,
         cfg: Optional[dict] = None, seed: int = 20260903) -> dict:
    """
    Run several deterministic orderings and keep the best plan.

    Objective, in order: fewest sheets, then highest recoverable fraction
    (placed + keepable remnant), then highest raw utilisation. Fewest sheets
    dominates because a second sheet is a whole new material commitment.
    """
    cfg = cfg or load_config()
    n = cfg["nesting"]
    kerf = cfg["shop"]["kerf_in"]
    trim = cfg["shop"]["datum_trim_per_edge_in"]
    min_keep = n["min_remnant_keep_in"]
    allow_rot = n["allow_rotation"]
    restarts = n["restarts"]

    if not parts:
        return {"sheets": [], "summary": _summarise([], sheet_l, sheet_w, 0.0)}

    total_part_area = sum(p.area for p in parts)

    # Deterministic candidate orderings.
    orders: list[list[NestPart]] = [
        sorted(parts, key=lambda p: (-max(p.length_in, p.width_in), -p.area)),
        sorted(parts, key=lambda p: (-min(p.length_in, p.width_in), -p.area)),
        sorted(parts, key=lambda p: -p.area),
        sorted(parts, key=lambda p: (-p.width_in, -p.length_in)),
        sorted(parts, key=lambda p: (-p.length_in, -p.width_in)),
    ]
    rng = random.Random(seed)
    base = sorted(parts, key=lambda p: -p.area)
    for _ in range(max(0, restarts - len(orders))):
        shuffled = base[:]
        rng.shuffle(shuffled)
        orders.append(shuffled)

    best = None
    best_key = None
    for order in orders:
        try:
            sheets = _pack_once(order, sheet_l, sheet_w, kerf, trim, min_keep, allow_rot)
        except ValueError:
            raise
        placed = sum(s.placed_area for s in sheets)
        keepable = sum(s.keepable_remnant_area for s in sheets)
        total = sum(s.area for s in sheets)
        key = (len(sheets), -(placed + keepable) / total, -placed / total)
        if best_key is None or key < best_key:
            best_key, best = key, sheets

    return {"sheets": best, "summary": _summarise(best, sheet_l, sheet_w, total_part_area)}


def _summarise(sheets: list[Sheet], sheet_l: float, sheet_w: float,
               total_part_area: float) -> dict:
    if not sheets:
        return {
            "sheet_count": 0, "sheet_area_in2": 0.0, "placed_area_in2": 0.0,
            "keepable_remnant_area_in2": 0.0, "scrap_area_in2": 0.0,
            "utilisation": 0.0, "recoverable_fraction": 0.0, "scrap_fraction": 0.0,
            "orders_on_sheet": [], "eta_realised": 0.0,
        }
    sheet_area = sum(s.area for s in sheets)
    placed = sum(s.placed_area for s in sheets)
    keepable = sum(s.keepable_remnant_area for s in sheets)
    scrap = sheet_area - placed - keepable
    orders = sorted({p.order_id for s in sheets for p in s.placements})
    return {
        "sheet_count": len(sheets),
        "sheet_area_in2": round(sheet_area, 2),
        "placed_area_in2": round(placed, 2),
        "keepable_remnant_area_in2": round(keepable, 2),
        "scrap_area_in2": round(scrap, 2),
        "utilisation": round(placed / sheet_area, 4),
        "recoverable_fraction": round((placed + keepable) / sheet_area, 4),
        "scrap_fraction": round(scrap / sheet_area, 4),
        "orders_on_sheet": orders,
        "order_count": len(orders),
        # This is the number that should be fed back into config as the
        # calibrated `remnant_recovery_rate` / `nest_uplift` evidence base.
        "eta_realised": round((placed + keepable) / sheet_area, 4),
    }


# ---------------------------------------------------------------------------
# Queue grouping
# ---------------------------------------------------------------------------

def group_queue(queue_rows: list[dict], cfg: Optional[dict] = None) -> dict[tuple, list[dict]]:
    """
    Split the pending-cut queue into nestable groups.

    You can only share a sheet between orders that agree on material, brand,
    thickness AND certification tier. Mixing a Tier 1 traceable order onto an
    industrial-grade sheet destroys the lineage claim on both.
    """
    cfg = cfg or load_config()
    key_fields = cfg["nesting"]["queue_group_key"]
    groups: dict[tuple, list[dict]] = {}
    for row in queue_rows:
        key = tuple(row[f] for f in key_fields)
        groups.setdefault(key, []).append(row)
    return groups


def expand_to_parts(queue_rows: list[dict], cfg: Optional[dict] = None) -> list[NestPart]:
    """Expand qty into individual blanks, applying the cut allowance and grain rule."""
    cfg = cfg or load_config()
    delta = 2 * cfg["shop"]["kerf_in"]  # per-part kerf allowance; edge trim handled at sheet level
    block_rot = cfg["nesting"]["rotation_blocked_for_grain_sensitive"]
    parts: list[NestPart] = []
    for row in queue_rows:
        mat = cfg["materials"][row["material_code"]]
        rotatable = not (block_rot and mat.get("grain_sensitive", False))
        for i in range(row["qty"]):
            parts.append(NestPart(
                part_id=f"{row['order_id']}-L{row.get('line_no', 1)}-{i+1}",
                order_id=row["order_id"],
                length_in=row["length_in"] + delta,
                width_in=row["width_in"] + delta,
                rotatable=rotatable,
            ))
    return parts


def plan_nest(queue_rows: list[dict], cfg: Optional[dict] = None) -> list[dict]:
    """
    Full fulfilment plan: group the queue, nest each group, return cut plans.
    This is what the operator console calls.
    """
    cfg = cfg or load_config()
    plans = []
    for key, rows in group_queue(queue_rows, cfg).items():
        material_code = rows[0]["material_code"]
        mat = cfg["materials"][material_code]
        parts = expand_to_parts(rows, cfg)
        result = nest(parts, mat["sheet_length_in"], mat["sheet_width_in"], cfg)
        plans.append({
            "group_key": dict(zip(cfg["nesting"]["queue_group_key"], key)),
            "part_count": len(parts),
            "sheets": result["sheets"],
            "summary": result["summary"],
            "cut_sequence": build_cut_sequence(result["sheets"]),
        })
    plans.sort(key=lambda p: -p["summary"]["sheet_area_in2"])
    return plans


def build_cut_sequence(sheets: list[Sheet]) -> list[dict]:
    """
    Operator-readable cut list. Rips first, then crosscuts per strip. This is
    the order the saw is actually driven in, and it is what the fulfilment
    screen prints.
    """
    steps: list[dict] = []
    for sh in sheets:
        strips: dict[int, list[Placement]] = {}
        for p in sh.placements:
            strips.setdefault(p.strip_index, []).append(p)
        steps.append({"sheet": sh.index, "op": "TRIM", "detail": "Trim two reference edges to establish datum"})
        for si in sorted(strips):
            h = max(p.width_in for p in strips[si])
            steps.append({"sheet": sh.index, "op": "RIP", "strip": si,
                          "detail": f"Rip strip {si + 1} to {h:.3f} in"})
        for si in sorted(strips):
            for p in sorted(strips[si], key=lambda q: q.x):
                steps.append({
                    "sheet": sh.index, "op": "CROSSCUT", "strip": si,
                    "part_id": p.part_id, "order_id": p.order_id,
                    "detail": f"Crosscut {p.length_in:.3f} in"
                              + (" (rotated)" if p.rotated else ""),
                })
        for r in sh.remnants:
            if r.keepable:
                steps.append({"sheet": sh.index, "op": "LOG_REMNANT",
                              "detail": f"Label and rack {r.length_in:.2f} x {r.width_in:.2f} in"})
    return steps
