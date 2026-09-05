# BUILD BRIEF v2 — Fractional-Cut Engineering Plastics Storefront

> **How to use this file.** Put it at the repo root and open Claude Code there.
> Do **not** paste it as one prompt. Work the phases at the bottom in order and
> do not advance until the phase's gate passes. Start with:
>
> `Read CLAUDE_CODE_BRIEF.md. Execute Phase 0 and Phase 1 only. Stop at the gate and show me the test output.`

---

## 0. WHAT THIS IS, AND WHO IT IS AGAINST

A one-person industrial supply node in El Cajon, California, selling small
squared blanks of engineering plastic — PEEK, Ultem, Delrin, PTFE, PPS, Torlon,
G10 — to Tier-2 and Tier-3 machine shops. Firm price in seconds, certification
paperwork the same business day.

**The competitive picture is not a green field. Build accordingly.**

**Curbell Plastics, Chula Vista.** 26,000 sq ft combining distribution and
fabrication, running an Onsrud router and a computerised Schelling saw. They
already sell "CNC ready blanks" and cut-to-size on CNC and manual equipment.
ISO 9001, ITAR and EAR compliant, stocking TECAPEEK. Their cutting is not the
weakness. Two things are: a published **$250 minimum charge on custom
fabrication**, and a quote form whose output is a salesperson phoning you back.
Their intake form asks for material name as free text, colour/texture/grade,
whether you need a fabricated part, and what your application is — because it is
a work order for a human, not a pricing input. It has **no zip code, no
required-by date, and no lead time field**. Lead time is negotiated afterward.

**Ready Plastics.** Running this exact playbook nationally: digital-first
distribution, live inventory across 11 hubs, a customer certs portal, and a
line card split into Tier 1 mill-lineage material versus cheaper in-house
verified industrial grade.

**What this means for the build.** Three structural consequences, all already
implemented in the engine:

1. **Brand is a first-class attribute.** An AS9100 buyer whose approved vendor
   list names Ensinger TECAPEEK cannot order a generic `PEEK_NAT`. Curbell
   captures this in free text; you capture it in a dropdown or you lose exactly
   the customers you are targeting.
2. **Two certification tiers.** Tier 1 traceable for AVL and flight work,
   certified industrial grade at roughly 28% less for general job-shop work.
   Without this you are priced against Ready Plastics' cheap tier with your
   expensive one.
3. **Lead time is computed, not negotiated.** Every quote carries a promised
   ship date from a real business-day calendar. That is the single field your
   largest local competitor's form does not have.

**The owner cannot read code.** Favour "fails loudly and legibly" over clever.
Every business number lives in `config.json`, never in source.

---

## 1. STACK — LOCKED

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15, App Router, TypeScript strict | One language, one repo, one deploy |
| Styling | Tailwind CSS | |
| Hosting | Vercel | |
| DB + storage | Supabase (Postgres + Storage) | MTR PDFs need durable storage |
| Payments | **Stripe Checkout (hosted redirect)** | Near-zero PCI scope. Do NOT build card fields. |
| Tax | Stripe Tax, `automatic_tax` enabled | |
| Email | Resend | PDF attachments, simple API |
| PDF generation | `@react-pdf/renderer` | Invoice, C of C |
| PDF merging | `pdf-lib` | Merge generated C of C with scanned MTRs |
| Spreadsheet parsing | `papaparse`, `xlsx` | Dimension upload |
| Validation | `zod` at every API boundary | |

No ORM. No state library. No component library.

---

## 2. REPO STRUCTURE

```
/app
  /(marketing)/page.tsx            landing + live quote tool
  /quote/page.tsx                  full quote builder
  /quote/[id]/page.tsx             saved quote, shareable
  /order/[id]/page.tsx             order status + document downloads
  /ops/...                         operator console (auth-gated)
  /api/quote/route.ts              POST -> priced quote, persisted
  /api/quote/upload/route.ts       POST -> parse CSV/XLSX dimensions
  /api/checkout/route.ts           POST { quote_id } -> Stripe session URL
  /api/webhooks/stripe/route.ts    POST -> order creation + stage-1 docs
  /api/ops/nest/route.ts           POST -> run the nester over the queue
/lib
  /pricing/engine.ts               PORTED FROM PYTHON — see §3
  /pricing/nesting.ts              PORTED FROM PYTHON — see §5
  /pricing/config.json             THE SINGLE SOURCE OF BUSINESS TRUTH
  /pricing/__tests__/golden.test.ts
  /docs/{invoice,certificate}.tsx
  /docs/packet.ts
  /email/*.tsx
  /supabase/{client,admin}.ts
  /brand.ts
/reference
  pricing_engine.py    nesting.py    test_pricing.py
  config.json          golden_cases.json
```

---

## 3. THE PRICING ENGINE — PORT, DON'T REINVENT

`/reference/pricing_engine.py` is a working reference implementation with 84
passing tests. It is the numerical specification for the business.

**Task:** port to `/lib/pricing/engine.ts`, preserving module boundaries,
variable names, and order of operations exactly.

**Hard requirements.** Pure function, no I/O, no `Date.now()` inside it (the
order date is passed in). Reads every constant from `config.json` — zero magic
numbers. Throws typed `QuoteError` with messages written for a machinist:
`"0.437 in is not a stocked thickness for PEEK natural. Available: 0.125, 0.25,
0.375, 0.5, 0.75, 1, 1.5, 2 in."`

### Module map

```
1   Material cost basis     brand x tier multipliers -> $/in^2
2   Consumed footprint      yield, brand-lock penalty, nest uplift
3   Cut time                + tolerance passes at reduced feed
4   Labor                   + edge/face finish, inspection, add-on labor
5   Consumables             blade destruction, packaging, finish materials
6   Compliance & add-ons
7   Annealing               oven-hours, not labor-hours
8   Rework risk             expected cost of a part going out of spec
9   Margin (continuous), floor, rush
10  Freight                 dim weight + local delivery
11  Lead time               business-day calendar, composite batch days
```

### The five things that are easy to port wrongly

**Rush costs twice.** The multiplier raises conversion cost, and the tier's
`nest_uplift` drops to zero so effective yield falls too. `FLEX` is the mirror:
0.85 multiplier *and* +0.25 uplift. This is the entire economic argument for
offering a slow tier and it must survive the port intact.

**Brand lock suppresses remnant recovery.** If a customer names Victrex, only
Victrex drops can satisfy them. `rho` is multiplied by `brand_lock_rho_factor`
before the uplift is added. The premium a named brand carries is not just the
mill's price — it is the yield you lose.

**The margin curve is continuous, not stepped.** A stepped schedule is
non-monotone at its boundaries: shaving a dollar of cost can cross into a
higher-margin band and *raise* the price. The v1 engine had this bug and a
catalogue-wide sweep found it. Interpolate between anchors.

**The free-delivery threshold uses a lead-tier-invariant basis.** Comparing it
against the quoted price creates a cliff where picking the cheaper `FLEX` tier
drops the order below the threshold, adds an $18 fee, and raises the total.
`threshold_basis` is recomputed at STD's uplift for every tier. Do not simplify
this away.

**Rework risk is priced, not absorbed.** `p_rework` scales with tolerance tier,
part span, residual stress, and filled grade, and is reduced by annealing. Tight
tolerance on stressed material is where money leaks; it belongs in the quote.

### Verification gate

`golden.test.ts` loads `/reference/golden_cases.json` and asserts the TS engine
reproduces `subtotal_goods`, `shipping`, `total_due`, `cogs`, `margin_rate`,
`c_rework_expected`, `c_annealing`, `gamma` and `promised_ship_date` for all 13
cases within $0.01, applying the stated `config_override`. Then port these
invariants:

- monotonicity: bigger, thicker, more, tighter, faster is never cheaper
- unit price falls with quantity
- **lead-tier monotonicity sweep**: every material × 3 sizes × 2 zip classes ×
  5 tiers, asserting a slower tier is never more expensive
- **margin curve**: continuous at every anchor, and `COGS × (1+m)` monotone
- all validation rejections, including the tolerance span gates
- brand lock lowers `eta_eff`; named brand blocked on industrial tier
- annealing blocked on same-day and on ineligible materials
- Ultem cleanroom switches solvent to DI water
- composite orders land on the batch day
- dimensional weight governs a 24×20×0.0625 PTFE panel
- determinism

Do not proceed to Phase 2 until every test is green.

---

## 4. NEW PRODUCT OPTIONS — WHAT THEY MEAN PHYSICALLY

Every option below must appear in the quote builder, on the invoice, and on the
Certificate of Conformance. Prices come from config; the physics does not.

**Tolerance tiers.** `STANDARD` ±0.030 in, `PRECISION` ±0.015 in, `TIGHT`
±0.010 in. Each tier adds full-perimeter finishing passes at reduced feed, plus
per-part inspection time. **`max_dim_in` is a hard gate**: a slider cannot hold
±0.010 in over a 30-inch span, so the engine refuses rather than promising it.
Surface the refusal as a helpful redirect, not an error.

**Edge finish.** `DEBURRED` is standard and included. `CHAMFERED` breaks all
eight edges. `SCRAPED` removes saw witness marks — recommend it automatically
for PTFE, which shows fuzz as sawn. **Flame polishing is deliberately absent**
and must not be added: it is an acrylic and polycarbonate process that degrades
PEEK, Ultem and PPS and induces stress.

**Face finish.** `AS_SUPPLIED` is standard. Note that face finish never touches
thickness — the saw cannot. `CLEANROOM_PACK` carries a safety interlock: the
default IPA wipe is a **stress-cracking agent on Ultem and other amorphous
grades**, so the engine automatically substitutes a DI water and lint-free
process for any material flagged `solvent_stress_crack_sensitive`, and raises a
flag saying so. Do not let a UI option override that substitution.

**Annealing.** Costed in oven-hours at a low rate divided by a batch divisor,
plus handling labour — nobody stands at the oven. Adds a business day, blocks
same-day and next-day tiers, and reduces `p_rework` by 45% on stress-sensitive
material at tight tolerance. This is why it pays for itself on precision work,
and the quote builder should say so at the point of choice.

**Add-ons.** Wet-signed C of C, full chain-of-custody packet, resin certificate,
AS9102 FAIR, signed dimensional report, per-part lot marking, individual
bagging. Tier-1-only add-ons are rejected on industrial-grade lines. FAIR
silently upgrades the line to `PRECISION` and discloses the upgrade in a flag —
never quote a first article against a ±0.030 cut.

**Do not build FAIR until there is a documented inspection process and
calibrated gauges.** Ship it disabled in config.

---

## 5. THE NESTING SUBSYSTEM — CROSS-ORDER BATCHING

`/reference/nesting.py` is a working guillotine shelf nester. Port it to
`/lib/pricing/nesting.ts`.

**Why shelf packing and not a general rectangle packer.** A sliding table saw
can only make edge-to-edge cuts: rip the sheet into strips, then crosscut each
strip. That is the definition of a guillotine constraint, and shelf packing is
its exact expression, not an approximation. A maxrects or skyline packer returns
higher paper utilisation and **physically uncuttable layouts**. Do not
substitute one. If the shop ever buys a CNC router, revisit this file only.

**Two jobs, kept separate.**

*Quote time* is deterministic and statistical. The customer needs a firm price
in under five seconds and you cannot wait for other orders to arrive, so the
quote uses the expected yield from `remnant_recovery_rate` plus the tier's
`nest_uplift`. **The nester never sets a customer price.**

*Fulfilment time* is actual. The nester runs over the pending queue, groups by
`(material_code, brand, thickness, certification_tier)`, and produces a real cut
plan: strip layout, rip-then-crosscut sequence, and the list of remnants worth
racking. The gap between quoted and realised yield is your nesting margin, and
it is the evidence base for recalibrating `remnant_recovery_rate`.

**Grouping is a compliance boundary, not just an optimisation.** Mixing a Tier 1
traceable order onto an industrial-grade sheet destroys the lineage claim on
both. The group key must include brand and certification tier. Grain-sensitive
material (G10's woven glass has a warp direction) is never rotated.

**A geometry fact that drives the whole business.** A 12×12 blank is 12.25 in
with kerf. On 24×48 stock the usable width is 23.875 in, so **only one shelf
fits** — two would need 24.625 in. Three parts per sheet, and the leftover is an
11.6 × 47.9 in band. Your flagship product is an awkward nest, and raw
utilisation on a single 12×12 order is under 40%. The margin case rests entirely
on that band being racked and sold as smaller blanks. Make the remnant register
impossible to skip.

Measured in the reference implementation: one order alone reaches 14% sheet
utilisation; three orders batched onto the same sheet reach 51%. That is the
Nox mechanism, and it is what the `FLEX` lead tier sells.

---

## 6. DATA MODEL

Supabase Postgres, RLS on every table, all writes through the service-role key
server-side. The browser never holds a service key.

```sql
create table quotes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  request_json jsonb not null,
  result_json  jsonb not null,
  subtotal_cents integer not null,
  shipping_cents integer not null,
  total_cents    integer not null,
  promised_ship_date date not null,
  config_version text not null,
  consumed_at timestamptz,
  email text, company text
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  stripe_customer_id text unique,
  email text not null, company text, phone text,
  resale_cert_status text not null default 'none',
  resale_cert_path text, resale_cert_expires date,
  approved_vendor_list jsonb,      -- brands this customer's AVL permits
  created_at timestamptz not null default now()
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  order_number text unique not null,
  quote_id uuid references quotes(id),
  customer_id uuid references customers(id),
  stripe_session_id text unique not null,
  stripe_payment_intent text,
  status text not null default 'paid',
     -- paid | queued_for_nest | in_production | certified | shipped | cancelled
  customer_po text,
  ship_address jsonb not null,
  amount_paid_cents integer not null,
  tax_cents integer not null default 0,
  promised_ship_date date,
  nest_group_key text,
  tracking_number text, carrier text,
  invoice_path text, packet_path text,
  created_at timestamptz not null default now(),
  shipped_at timestamptz
);

create table lots (
  id uuid primary key default gen_random_uuid(),
  lot_number text not null,
  material_code text not null,
  brand text not null,                       -- must match config brands key
  certification_tier text not null,
  manufacturer text not null,
  distributor text, distributor_po text,
  country_of_origin text,
  thickness_nominal numeric not null,
  received_date date not null,
  mtr_path text, mtr_uploaded_at timestamptz,
  resin_cert_path text,
  qty_received_in2 numeric, qty_remaining_in2 numeric,
  notes text,
  unique (lot_number, material_code, thickness_nominal)
);

create table order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  line_no integer not null, part_ref text,
  material_code text not null,
  brand text not null default 'GENERIC',
  certification_tier text not null,
  tolerance_tier text not null,
  edge_finish text not null, face_finish text not null,
  annealed boolean not null default false,
  add_ons jsonb,
  length_in numeric not null, width_in numeric not null,
  thickness_nominal numeric not null, thickness_actual numeric,
  qty integer not null,
  lot_id uuid references lots(id),
  cut_by text, cut_at timestamptz, inspected_by text,
  anneal_cycle_id uuid
);

create table nest_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  group_key jsonb not null,
  plan_json jsonb not null,
  sheet_count integer not null,
  utilisation numeric not null,
  recoverable_fraction numeric not null,
  executed_at timestamptz
);

create table remnants (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid references lots(id) not null,
  parent_order_id uuid references orders(id),
  nest_run_id uuid references nest_runs(id),
  length_in numeric not null, width_in numeric not null,
  thickness_nominal numeric not null,
  location_tag text,
  created_at timestamptz not null default now(),
  consumed_at timestamptz, consumed_order_id uuid references orders(id)
);

create table webhook_events (
  id text primary key, type text not null,
  processed_at timestamptz not null default now()
);
```

Private storage buckets: `mtr/`, `resin-certs/`, `certs/`, `invoices/`,
`resale-certs/`.

---

## 7. QUOTE FLOW

### 7.1 Manual entry

Per line: material, **brand**, **certification tier**, length, width, thickness
(a select scoped to the material), quantity, **tolerance**, **edge finish**,
**face finish**, **anneal**, add-ons, optional part reference.

- Accept fractional entry (`12 1/2`, `12.5`, `12-1/2`) and normalise.
- Thickness is a select, never free text. Kills the commonest quote failure.
- Brand defaults to `GENERIC` with the label "Any approved source". Only reveal
  the named-brand list when the customer expands it — most buyers do not need it
  and the premium is real.
- Re-quote on a 400 ms debounce.
- Show the five lead tiers as a live comparison with **price and promised ship
  date side by side**. This is the comparison Curbell's form cannot make.

### 7.2 File upload — dimensions only

Accept `.csv`, `.xlsx`, `.xls`. Provide a downloadable template:

```csv
part_ref,material_code,brand,certification_tier,length_in,width_in,thickness_in,qty,tolerance_tier,edge_finish
BRKT-001,PEEK_NAT,ENSINGER_TECAPEEK,TIER1_TRACEABLE,12,12,0.5,1,STANDARD,DEBURRED
SPCR-002,ULTEM_1000,GENERIC,INDUSTRIAL,6,4,0.25,10,STANDARD,CHAMFERED
```

Optional columns default from config. Errors report row and column:
`"Row 4: PEEK_NAT is not stocked in 0.437 in."`

**Hard-reject drawings and models** by extension *and* magic bytes: `dwg dxf
step stp iges igs sldprt sldasm ipt catpart prt x_t 3dm stl pdf png jpg jpeg tif
tiff heic`. Rejection copy:

> We don't accept drawings or 3D models — only dimensions. This is deliberate.
> Keeping technical data off our servers keeps your program off our servers.

This is the most important compliance decision in the build. Dimensions alone
are not controlled technical data; a drawing of a defence component is. Cap the
part-reference field at 40 characters and label it "internal reference only" so
nobody types a part description into it.

### 7.3 Server-side pricing — non-negotiable

`POST /api/quote` receives dimensions and options only, computes server-side,
writes a `quotes` row, returns the result plus `quote_id`.

`POST /api/checkout` accepts **only** `{ quote_id, email, company, customer_po }`.
The server reads `total_cents` from the row, checks `expires_at` and
`consumed_at IS NULL`, and builds the Stripe session from the stored figure.

If a price can cross the network from client to server, anyone buys a $900 PEEK
blank for a dollar with dev tools. There is no acceptable shortcut.

---

## 8. CHECKOUT

Stripe Checkout hosted redirect, `mode: 'payment'`. Two line items (goods,
shipping). `automatic_tax` enabled, `customer_creation: 'always'`, US-only
shipping at launch, `custom_fields` for the PO number — shops live and die by
PO numbers. `metadata: { quote_id, order_number }`. Set `consumed_at` when the
session is created.

**Resale certificates.** Most customers are shops incorporating this material
into parts they resell and are entitled to a California resale exemption. Do
**not** offer a self-serve exempt checkbox; that liability lands on the seller.
Default to charging tax, provide an upload for CDTFA-230, mark it `pending`, let
the operator approve, and set `tax_exempt` on the Stripe customer for **future**
orders. Never retroactively exempt a completed order in code.

---

## 9. THE COMPLIANCE FLOW — READ TWICE

A **Material Test Report is not a document you author.** It is the mill's record
of measured properties for a specific lot. You retrieve and forward it.

A **Certificate of Conformance is your document**, and it must name the actual
lot cut — which nobody knows until someone pulls the sheet off the rack.
Auto-generating a signed C of C at checkout with a placeholder lot, into an
AS9100 supply chain, is falsification of a certification record.

### Stage 1 — instant, on `checkout.session.completed`

Order confirmation with order number and **promised ship date**; commercial
invoice PDF with full line detail including brand, tier, tolerance and finish;
Stripe's receipt; a Certification Package notice listing exactly which documents
are coming; link to the order status page.

### Stage 2 — at fulfilment, same business day

Operator assigns a lot per line. The system pulls the pre-uploaded mill MTR,
generates the C of C with the real lot number, measured actual thickness, cut
date and operator name, merges into one Certification Packet with `pdf-lib`,
emails it, archives to `certs/`, sets status `certified`.

Because MTRs are uploaded the day material arrives, Stage 2 is a 30-second
operation. Put the commitment on the site plainly: *"Certification packet in
your inbox the same business day we cut."*

**Hard block: an order cannot be marked shipped until every line has a `lot_id`
and that lot has an `mtr_path`.** Not a warning.

### Certificate of Conformance — required content

Company block with CAGE code if held. Cert number, date, sold-to, ship-to,
customer PO, order number. Per line: material and grade, **brand and
manufacturer**, lot/batch, nominal size, **measured actual thickness**, qty,
country of origin, **tolerance tier held**, edge and face finish, and whether
the blank was annealed.

Statement of conformance. Then the process statement:

> Material was saw-cut to the nominal dimensions shown, tolerance ±0.0XX in on
> X-Y, squareness within 0.0XX in per 12 in, and edge-finished as noted.
> Thickness is as-supplied by the manufacturer and was not machined. No thermal,
> chemical, or other property-altering process was performed **other than the
> stress-relief anneal recorded above where applicable.**

Supplemental statements: DFARS 252.225-7009 specialty metals restrictions do not
apply to polymer and composite materials; material procured from an authorised
distribution channel with no knowingly suspect or counterfeit material; no
mercury used in processing or handling; country of origin per line. Signature
block. "This certificate shall not be reproduced except in full."

Every field populates from real database values. If any is missing the generator
throws rather than printing a blank. **On `INDUSTRIAL` tier lines, the DFARS and
lineage statements are suppressed** and the certificate states no mill lineage is
claimed — printing them anyway is the failure mode that ends the business.

---

## 10. OPERATOR CONSOLE — `/ops`

Supabase Auth, single admin, middleware guard on the whole segment.

**Queue.** Orders by promised ship date, colour-coded on lateness.

**Nest board.** The new screen and the one that pays. Shows pending-cut lines
grouped by `(material, brand, thickness, tier)` with, per group: parts waiting,
oldest order age against `queue_max_age_business_days`, projected utilisation if
cut now, and projected utilisation if you wait. One button runs the nester and
prints the rip-then-crosscut sequence. Committing a run writes a `nest_runs` row
and pre-populates the remnant register from the plan's keepable drops.

**Lot library.** Add a lot with material, **brand**, tier, lot number,
manufacturer, distributor, PO, country of origin, thickness, received date, MTR
upload, resin cert upload. Warn loudly on any lot with no MTR — that material
cannot be sold into an AS9100 chain.

**Fulfilment.** Assign lots, enter measured actual thickness, cut-by and
inspected-by, log remnants (dimensions plus rack location, one tap), generate
packet, preview, send, then tracking and mark shipped. The lot dropdown must
filter by brand and tier and refuse a mismatch.

**Remnant register.** Searchable by material, brand, tier and size, with a
"does a remnant satisfy this order?" filter. This drives
`remnant_recovery_rate` from 0.15 toward 0.50 and is the highest-ROI screen in
the app.

**Calibration panel.** Realised utilisation and recoverable fraction from
`nest_runs` versus the `nest_uplift` figures in config, plus remnant conversion
rate from the register. This is how the owner knows when to change a number.

---

## 11. LANDING PAGE

### Design direction

**Not a SaaS landing page.** The audience is a shop owner or buyer, 35–60, on a
floor, on a phone, comparing you to a distributor site from 2009. They want a
number.

**The hero is the working quote tool.** Showing a firm price in four seconds
*is* the pitch; describing it is strictly worse.

**Design system: dimensional annotation.** The distinctive device is the
vernacular of an engineering drawing — extension lines, dimension arrows,
tolerance callouts. The hero renders the customer's blank as a live drawing that
updates as they type, with `±.030` annotated on the edge and the callout
changing when they switch tolerance tier. Spend the boldness here; keep
everything else quiet.

**Palette**, drawn from the materials rather than a template:

| Token | Hex | Use |
|---|---|---|
| `paper` | `#FCFCFA` | ground |
| `ink` | `#14181C` | primary text, dimension lines |
| `graphite` | `#6B7280` | extension lines, secondary text |
| `rule` | `#E3E3DE` | dividers |
| `amber` | `#B8710F` | Ultem-derived. Live price and primary action ONLY. |

Material swatches carry true colours: PEEK bone `#E8E0CE`, Ultem amber
`#C88A2E`, Delrin white `#F4F4F2`, black Delrin `#1C1C1C`, G10 green `#5F7A3E`.

**Type.** One family: Archivo variable, using its width axis for hierarchy.
`font-variant-numeric: tabular-nums` locked on every dimension and price —
misaligned digits read as unserious to people who measure for a living.

Avoid: all-caps eyebrow labels, single accented words in headlines, identical
rounded cards for every block, `→` appended to buttons, meta strings joined with
middle dots.

**Motion.** One orchestrated moment: dimension callouts drawing themselves in
when a price resolves. Nothing else animates on scroll. Respect
`prefers-reduced-motion`.

### Page structure

1. **Hero** — live quote tool with the dimensioned blank. One line above it:
   *"Aerospace plastics, cut to your size. Priced in seconds, certified the same
   day."*
2. **The lead-time table** — all five tiers with price and promised ship date.
   Lead with the thing the competition cannot show.
3. **The three costs of a full sheet** — MOQ trap, squaring hours, paperwork
   delay, with a real worked comparison and visible arithmetic. This audience
   trusts arithmetic and distrusts adjectives.
4. **The minimum** — when a quote lands under $250, show the comparison the
   engine returns in `competitive_comparison`. State it as fact, name no
   competitor.
5. **What you get** — four edges saw-cut, tolerance per tier, squareness,
   **thickness as-supplied and not machined**, stated prominently. This prevents
   the single most likely return.
6. **Materials** — grid with real swatches, densities, thicknesses, brands
   available, typical applications.
7. **Two ways to buy** — Tier 1 lineage versus certified industrial, with the
   honest statement that industrial grade is not for AVL or flight hardware.
8. **Certification** — what arrives and when, with a redacted sample packet.
9. **Why we don't take your drawings** — short, confident, a trust signal.
10. **FAQ** — residual stress and the 48-hour flatness note, annealing, resale
    certificates, tolerance limits by span, what happens if a cut is out of spec.

### Copy rules

Active voice, sentence case. Buttons say what happens: `Get price`, `Continue to
payment`, `Send certification packet`. An action keeps its name through the whole
flow. Errors state what went wrong and how to fix it; never apologise, never be
vague.

---

## 12. DISCLOSURES THE SITE MUST MAKE

**Thickness is not machined.** PEEK sold as 0.500 in ships at roughly 0.520–0.570
in. A saw cannot correct that. Say so on the landing page, on every quote line,
on the invoice, and on the C of C.

**Residual stress.** PEEK, Ultem and PPS plate carry internal stress; cutting
releases it and a 12×12 blank can bow 0.010–0.025 in within 48 hours. Show this
automatically for any material with `residual_stress_flag`, alongside the
annealing option at the point of choice.

**Machinists face both sides anyway.** The standard shop fix for warp is removing
equal material from both faces. If your customers do that regardless, the
edge-squaring value proposition is weaker than assumed and the MOQ argument
carries the business. Do not overclaim squaring savings in copy until customer
discovery settles it.

**Tolerance is span-limited.** ±0.010 in only up to 24 in; ±0.015 in up to 36 in.
Enforced in the engine, and it should be stated before someone tries.

**Composite dust.** G10 and FR4 need local exhaust and P100, and they destroy
carbide. Batched to one scheduled day per week; the calendar enforces it.

---

## 13. ENVIRONMENT

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # server only, never NEXT_PUBLIC_
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
RESEND_API_KEY=
NEXT_PUBLIC_SITE_URL=
OPS_ALLOWED_EMAIL=
```

Webhooks: read the raw body with `await req.text()` before parsing, verify the
signature, insert the event id into `webhook_events` first and bail on conflict.
Stripe retries; double-sending an invoice is a support nightmare.

---

## 14. DEFINITION OF DONE

- [ ] All 13 golden cases pass within $0.01 against the Python oracle
- [ ] Lead-tier monotonicity sweep green across the whole catalogue
- [ ] Margin curve continuous; `COGS × (1+m)` monotone
- [ ] A price cannot be set from the client — verified by attempting it
- [ ] Uploading a `.dxf` is rejected with the explanatory message
- [ ] `12 1/2` normalises to `12.5`
- [ ] Named brand rejected on an industrial-tier line, with a clear message
- [ ] ±0.010 in refused above 24 in span, with a helpful redirect
- [ ] Ultem cleanroom order shows the DI-water substitution flag
- [ ] Annealing blocked on same-day; ship date moves by one business day
- [ ] G10 order ordered Tue 8 Sep 2026 promises Wed 16 Sep 2026
- [ ] Nester produces guillotine-feasible layouts; strips never overlap
- [ ] Three orders on one sheet beat one order's utilisation
- [ ] Nest groups never mix brand or certification tier
- [ ] Committing a nest run pre-populates the remnant register
- [ ] Expired quote returns a clear error at checkout, not a stack trace
- [ ] Replaying a Stripe webhook produces no duplicate order or email
- [ ] Order cannot ship with any line lacking a lot with an MTR
- [ ] C of C suppresses DFARS and lineage statements on industrial-tier lines
- [ ] Lighthouse accessibility ≥ 95; keyboard focus visible
- [ ] Quote tool usable one-handed on a 390 px phone
- [ ] `config.json` edits change every price with no code touched

---

## 15. PHASES

| Phase | Scope | Gate |
|---|---|---|
| **0** | Scaffold, Supabase migrations, `brand.ts` | `npm run dev` serves; migrations applied |
| **1** | Port pricing engine + golden tests + monotonicity sweep | All green — **do not skip** |
| **2** | Port nester + guillotine feasibility tests | Three-order batch beats one-order utilisation |
| **3** | Quote API, manual entry with all options, CSV upload + rejection | Quote a PEEK 12×12 and match the oracle in-browser |
| **4** | Stripe Checkout + webhook + idempotency | Test-mode purchase creates one order |
| **5** | Invoice PDF + Stage-1 email | Email arrives with correct PDF |
| **6** | Lot library, fulfilment, C of C, packet merge | Full order → packet, end to end |
| **7** | Nest board + remnant register + calibration panel | Nest run commits and populates remnants |
| **8** | Landing page per §11 | Screenshot review, mobile and desktop |
| **9** | Material library: `/materials` grid + detail pages + `/learn` articles, per §17 | Grid and a detail page generated entirely from `config.json`; images sourced honestly or clearly flagged as placeholder |
| **10** | Homepage restructure modeled on Nox Metals, per §18 | Eight-section homepage; no fabricated logos/certifications/AI claims |
| **11** | Solo cut-layout diagram at quote time, per §19 | Diagram for 5× 12×3 parts on a 36×24 sheet, with sheet count and utilisation; no DB write |
| **12** | Live diagram in the quote builder, per-material/thickness sheet sizing, collapsible specs/PO sections, email-a-quote, per §20 | Diagram updates live with material/thickness; sample `QuoteSummary` PDF |

---

## 16. NOT IN SCOPE — OWNER ACTION REQUIRED

1. Stripe account, Resend DNS verification, Supabase project.
2. **Real material and brand pricing.** Every `price_per_lb` and every
   `price_multiplier` in `brands` is a placeholder. Replace with quoted landed
   cost from actual distributors.
3. **Calibration.** `c0`, `c1`, `nest_efficiency`, labour timings, `p_rework`
   values, annealing costs and `nest_uplift` are estimates. Protocol: 27 timed
   cuts (3 materials × 3 thicknesses × 3 reps) fitted by least squares;
   stopwatch 10 real orders for labour buckets; weigh drops from 5 full sheets;
   and re-fit `remnant_recovery_rate` monthly from the register. Two hours
   replaces every guess in this file.
4. **`p_rework` is the least trustworthy number here.** It is a modelled
   probability with no data behind it. Track actual scrap per tolerance tier from
   day one and replace it before offering `TIGHT` commercially.
5. CDTFA seller's permit and an inbound resale-certificate process.
6. Terms of sale, return policy, stated liability cap — reviewed before the first
   order, not after the first dispute.
7. Business liability insurance.
8. A named individual who signs certificates of conformance, and a decision on
   CAGE code registration.
9. A written policy for deleting any drawing a customer sends anyway, unread,
   and a DDTC conversation before that ever changes.
10. **Verify the machine before trusting `max_dim_in` and the tolerance gates.**
    Every tolerance claim in config is a promise a specific saw has to keep.

---

## 17. PHASE 9 — MATERIAL LIBRARY: SEO PAGES AND CARDS

Do not start this phase before Phase 8 is done — it links into the homepage
and the quote tool, both of which need to already exist.

### Why this phase exists

Right now the only way to find this site is to already know it exists. A buyer
who searches "PEEK machining tolerances" or "why does my PEEK blank warp" is
standing at the exact moment of the exact problem this business solves, and
without this phase, that search sends them to a forum thread or a competitor
instead of here.

The material library is not decoration. It is the acquisition channel that
runs while you sleep, and it is built entirely from data that already exists in
`lib/pricing/config.json`. No new business decisions are needed — this phase is
presentation and search-visibility work over the 12 materials already defined.

### What gets built

1. A materials index page — a grid of cards, one per material
2. An individual detail page per material, at a permanent URL
3. A homepage entry point into the grid
4. A short library of standalone educational articles, cross-linked from the
   relevant material pages
5. Search metadata so the pages are actually findable

### 17.1 — Data source: do not hand-write material facts twice

Every number and flag on these pages — density, stock thicknesses, abrasion,
residual stress, solvent sensitivity, brands carried — already lives in
`config.json`. The page content is generated FROM that file, not written
separately and then left to drift out of sync with it.

Build `lib/materials/content.ts`: one object per material code, keyed to match
`config.json` exactly, holding only what config does not already contain —
the prose. Nothing numeric belongs in this file if config already has it.

```ts
export const materialContent: Record<string, {
  hero_line: string;              // one sentence, under 20 words
  overview: string;               // 2-3 sentences, plain language
  typical_applications: string[]; // 4-6 short bullets
  why_this_material: string;      // when to choose it over alternatives
  handling_notes: string[];       // beyond what config's residual_stress_flag /
                                   // solvent_stress_crack_sensitive already state —
                                   // do not repeat those, link to them
  faq: { question: string; answer: string }[]; // 3-5 per material
  slug: string;                   // url-safe, e.g. "peek-natural"
  meta_title: string;             // under 60 characters
  meta_description: string;       // under 155 characters
}>
```

A page component reads config for every fact (density, price basis, stock
thicknesses, brands, flags) and reads this file only for the prose wrapped
around those facts. If a number ever needs to change, changing config.json is
enough — no page needs editing.

### 17.2 — Material card (grid + homepage)

One card per material. Required content, all sourced as above:

- Material swatch color (already defined per material in the frontend-design
  palette work from Phase 8 — reuse it, do not invent new colors)
- Material image (see 17.4 — sourcing rules)
- Name and family (e.g. "PEEK, natural" / "Polyetheretherketone")
- One-line hero (`hero_line`)
- Two or three spec chips: density, stock thickness range, brands available
- A flag badge if `residual_stress_flag` or `solvent_stress_crack_sensitive`
  is true on that material — small, not alarming, consistent with how flags
  are already surfaced in quote results
- Click target: the whole card links to the detail page

Grid lives at `/materials`. Sort by `family` so related grades sit together
(PEEK variants together, Ultem variants together, etc).

### 17.3 — Material detail page

Route: `/materials/[slug]`, statically generated at build time — these pages
do not need to be dynamic, they change only when config.json changes.

Structure, top to bottom:

1. Hero: image, name, family, `hero_line`
2. Overview (`overview`)
3. Spec table pulled directly from config: density, price basis note (do not
   show the actual `price_per_lb` — that's an internal cost figure, not a
   retail price), stock thicknesses, available brands with their labels,
   sheet size, blade group
4. Handling notice block — pull directly from config flags:
   - if `residual_stress_flag`: the 48-hour flatness note, with a link to the
     tolerance tiers section of the quote tool and a mention that annealing is
     available
   - if `solvent_stress_crack_sensitive`: the IPA warning, in the same language
     already used in the engine's flag output
   - if `grain_sensitive`: the orientation note
   - never invent a caution that isn't already a flag in config; if config
     doesn't flag it, don't claim it on the page
5. `why_this_material`
6. `typical_applications` as a bullet list
7. `handling_notes`
8. FAQ (`faq`), rendered as an accordion
9. A live-price CTA: "See a price for this material" — pre-fills the quote
   tool at `/quote` with this material_code already selected via a query
   parameter, so the visitor lands one field away from a number, not zero
10. Cross-links to 2-3 related materials (same family, or common substitution
    pairs — e.g. Delrin AF from the Delrin 150 page)
11. Cross-links to any educational articles (17.5) that reference this material

SEO metadata, per page: use `generateMetadata` in the Next.js App Router.
Title from `meta_title`, description from `meta_description`. Add JSON-LD
structured data using the `Product` schema (material as product, `material`
and `additionalProperty` for density/tolerance/brands) so search engines can
surface spec data directly in results.

### 17.4 — Images: sourcing rules, read before generating anything

Two acceptable sources only:

1. **Manufacturer-provided product photography**, if you have a distributor
   relationship that provides it for marketing use — confirm licensing terms
   explicitly before using anything a distributor sends you.
2. **AI-generated images** created for this project specifically — a rendered
   photograph-style image of a squared plastic blank on a neutral background,
   in that material's true color, generated fresh for this site.

**Do not scrape, screenshot, or reuse images found via web or image search from
distributor sites, stock photo sites, or competitor pages.** Those are
copyrighted, and using them creates real legal exposure for a business this
small. This applies even to a generic-looking product photo — genericness does
not make it unlicensed.

If image generation is available in your Claude Code environment, generate one
image per material: a photograph-style render of a cut, squared blank in that
material's characteristic color and surface finish (PEEK bone, Ultem amber
translucent, Delrin white or black, PTFE white with slight surface texture, G10
green woven-glass pattern), lit simply, on a neutral background, no visible
branding or watermark. If generation is not available in this environment, use
solid-color placeholder swatches per material (the palette already defined) and
flag clearly in your response that real photography is a pre-launch requirement,
not a nice-to-have — a page selling material sight-unseen needs to show it.

### 17.5 — Educational articles

Standalone long-form pages, not tied to a single material, targeting a specific
search a buyer runs before they've found a supplier. These are markdown content
files rendered at `/learn/[slug]`, cross-linked from relevant material pages
and from a "Learn" index.

Write these five to start:

1. **"Why PEEK and Ultem blanks warp after cutting"** — residual stress,
   plainly explained, the 48-hour flatness window, when annealing is worth
   paying for. Links to PEEK, Ultem, and PPS material pages and to the
   annealing add-on.
2. **"PEEK machining tolerances: what a saw can and can't hold"** — the
   ±0.030 / ±0.015 / ±0.010 span-limited tolerance system, explained the way a
   machinist would want it explained, with the actual span limits from config.
   Links to the quote tool's tolerance tier selector.
3. **"Why your Ultem parts crack after cleaning"** — the IPA stress-cracking
   issue, told as a cautionary explanation, not a sales pitch. Links to Ultem
   pages and the cleanroom-pack add-on.
4. **"Buying a small PEEK blank without buying a whole sheet"** — the MOQ /
   cash-flow problem, told straight, with the real worked-example arithmetic
   already developed for the landing page. This is the page most likely to
   rank for a buyer who is actively frustrated with a distributor's minimum
   right now.
5. **"G10 and FR4: why it destroys carbide blades and what that means for
   your quote"** — the abrasion economics, explained honestly enough that a
   buyer trusts the batching/composite-day lead time instead of being annoyed
   by it.

Each article: 600-900 words, one clear thesis, no keyword stuffing, plain
sentences. Same copy rules as the rest of the site — active voice, no marketing
adjectives doing the work numbers should do. End each with a link to the
relevant material page(s) and, where natural, a link straight into `/quote`.

### 17.6 — Homepage integration

Add one section to the homepage, positioned after the hero quote tool and
before the deeper landing-page content already built in Phase 8. Not a
dramatic slab — a quiet, well-labeled entry point:

- Short header: "Materials we stock"
- A horizontal scroll or condensed grid of 4-6 featured material cards (not
  all 12 — feature the ones most likely to convert: PEEK natural, Ultem 1000,
  Delrin, G10)
- A single link: "See all materials and specs" → `/materials`

This is a secondary CTA. It must not compete visually with the primary hero
quote tool for attention.

### Definition of done — Phase 9

- [ ] `/materials` renders a card for every material in config.json — adding a
      material to config and re-running the build produces its card and page
      automatically, no manual page creation
- [ ] Every detail page's spec table matches config.json exactly — change a
      number in config, the page reflects it on rebuild
- [ ] No caution or flag appears on a page unless the matching flag is true in
      config for that material
- [ ] No image on the site was scraped, screenshotted, or reused from another
      company's site
- [ ] Every material page's price CTA correctly pre-fills the quote tool with
      that material selected
- [ ] All five articles exist, are cross-linked from relevant material pages,
      and are reachable from a `/learn` index
- [ ] `generateMetadata` produces a distinct title and description per material
      and per article page — verify no two pages share identical metadata
- [ ] JSON-LD structured data validates (test with Google's Rich Results Test)
- [ ] Homepage materials section does not visually compete with the hero quote
      tool
- [ ] Lighthouse SEO score ≥ 95 on `/materials`, a sample detail page, and a
      sample article

---

## 18. PHASE 10 — HOMEPAGE STYLING, MODELED ON NOX METALS

Restyles the homepage built in Phase 8 to follow Nox Metals' actual current
site structure (noxmetals.co, verified live as of drafting), translated to
plastics and to this project's own dimensional-annotation design system from
Phase 8 — not a copy-paste, a structural model. Do not start before Phase 9,
since the "shop by material" section reuses Phase 9's material data.

### What Nox's site actually does, section by section

Fetched from their live homepage rather than from memory, so the translation
below is grounded in what exists, not what's assumed to exist.

1. **Full-width hero video** behind a two-line headline and one short subhead,
   with a single primary button ("Get Metal Fast")
2. **A scrolling strip of client logos** directly under the hero
3. **A tabbed "shop by" grid** — alloy or shape — where each card shows a
   periodic-table-style element composition breakdown, a one-line description,
   and a "Shop now" link that deep-links straight into a pre-filled quote
4. **An AI/nesting explainer section** with a live-dashboard-style visual:
   customer job tickets flowing into a "DROP" panel showing yield percentage,
   number of layouts evaluated, and estimated hours — i.e., they show their
   nesting engine actually working, as a piece of marketing
5. **A short manifesto paragraph** — plain, unadorned, about who they built the
   company for
6. **A featured guides strip** — four educational article cards
7. **A second, final quote CTA band** near the footer
8. **A footer** with a real street address, phone, email, social links, and a
   quality-policy link

Nothing here is exotic. It's a well-executed version of ordinary e-commerce
patterns, aimed at an industrial buyer instead of a consumer.

### Translation to this site, section by section

**1. Hero.** Keep what Phase 8 already specified: the live quote tool with the
dimensioned blank rendered as an engineering drawing, updating as the customer
types. Do not add a background video — Nox is selling a 30,000 sq ft automated
facility; this business is selling speed and trust from a one-person shop, and
a stock-feeling video would work against it. The honest version of "showing the
machine" here is showing the *price resolve in real time*, which Phase 8
already does. One line above it, matching Nox's brevity: *"Aerospace plastics,
cut to your size. Priced in seconds, certified the same day."*

**2. Trust strip — do not fabricate this.** Nox shows real client logos:
Safran, Impulse Space, Stoke Space, actual named companies who buy from them.
**There are no customers yet.** Do not create a placeholder logo strip, do not
use stock company logos, and do not invent names. A fabricated client list is
not a stylistic shortcut — it is a false claim of trust, and if a real visitor
ever recognizes it as fake, it costs more credibility than having no strip at
all. Instead, build this section but leave it dormant: a horizontal strip
component that displays nothing until real logos exist, with a code comment
explaining why, and a note in your response to the owner that this section
activates after the first 5-10 real customers agree to be named. If
certifications are actually held (ISO, AS9100) show that badge here instead —
but only ones actually earned. Do not display "ISO 9001:2015 certified" or any
compliance badge unless the business has genuinely completed that
certification. Check `lib/brand.ts` for a certifications field; if none is
set, show nothing here.

**3. "Shop by material" tabbed grid.** This is the one section worth
replicating closely, and it should reuse the material data already built in
Phase 9 rather than duplicating it. Two tabs: **By material family** (PEEK,
Ultem, Delrin, PTFE, PPS, Torlon, G10) and **By form** — for now this is just
"sheet," since the shop only cuts flat stock, but build the tab structure so
round rod or tube can be added later without a rework. Each card, sourced from
`config.json` + `lib/materials/content.ts` (Phase 9):

- Material swatch color
- Name and one-line description (`hero_line`)
- A composition-style micro-fact row, styled like Nox's periodic-table
  chemistry callout but showing what's actually relevant to a plastic:
  density, max continuous service temperature if you have it, or the
  brands-available count — pick two or three facts that read as credible
  specs, not decoration
- "Shop now" link that deep-links to `/quote?material=PEEK_NAT`, pre-filling
  the quote tool exactly the way Nox's cart-encoded links do

**4. Nesting explainer — build this honestly, because the engine is real.**
Nox shows a live-feeling dashboard of their nesting AI: yield percentage,
layouts evaluated, estimated hours. This project has the exact same underlying
engine — it's what Phase 2 built. This section should not be faked; wire it to
real output from `lib/pricing/nesting.ts`. Build a static illustrative panel
using the actual reference numbers already proven in testing: one order alone
reaching roughly 14% sheet utilisation, three orders batched onto the same
sheet reaching roughly 51%. Label it honestly as an illustration of how
batching works, not a live customer feed — there is no live order flow yet, and
presenting a static illustration as live data would be the same kind of false
claim as the fabricated logo strip. Content, adapted from Nox's framing:

> Every cut is a decision. On a sliding table saw, a single 12x12 order uses
> under half the sheet. Batch it with two others cutting the same material
> and thickness, and the same sheet clears half its area for scrap instead of
> most of it. [illustrative yield comparison, sourced from real nester output]

Do not claim "AI-trained scheduling" or "machine learning" anywhere on this
site. The nester is a deterministic guillotine-packing algorithm — genuinely
the correct tool for a single sliding table saw, and worth being proud of, but
it is not machine learning and claiming otherwise is a false technical claim a
knowledgeable buyer (exactly this audience) will catch immediately.

**5. Manifesto paragraph.** Short, plain, no adjectives doing work numbers
should do. Model the tone, not the content — Nox's version names their buyer
archetypes (the three-man shop, the aerospace buyer juggling suppliers) and
states plainly who they built for. This one should do the same using the
actual pain points already established in the brief:

> Every Tier-2 and Tier-3 shop running a defense or aerospace contract has
> waited on a distributor to answer a $400 quote request. We built this for
> them: a firm price in seconds, a blank that's actually square, and
> certification paperwork the same day we cut — not the same week.

**6. Featured guides strip.** Direct port of Nox's pattern, populated from the
five articles already built in Phase 9. Four-card grid, title plus one-line
description, linking to `/learn/[slug]`.

**7. Final CTA band.** Reuse Nox's placement and framing pattern: *"Your
distributor takes three days. We take five seconds."* Link straight back to
the quote tool.

**8. Footer.** Real address (El Cajon or Miramar, once the lease is signed —
until then, use the owner's confirmed mailing address), real phone, real
email, and the `/quality-policy` link only if a documented quality policy
actually exists. Do not fabricate compliance language in the footer.

### What not to carry over from Nox

- **No fabricated logos, testimonials, or certifications.** Covered above,
  repeated because it is the single most tempting shortcut in this phase.
- **No "AI" or "machine learning" claims for the nester.** It's deterministic
  and that is the correct and honest description.
- **No hero video.** Wrong scale for a one-person shop; the live quote tool is
  the stronger and more honest hero.
- **No dashboard implying live multi-customer order flow.** There is none yet.
  Label illustrative content as illustrative.

### Definition of done — Phase 10

- [ ] Homepage follows the eight-section structure above, in order
- [ ] Trust-strip component exists but renders nothing until real client names
      are added, with that condition documented in a code comment
- [ ] No certification badge appears unless set in `lib/brand.ts`
- [ ] "Shop by material" cards pull every fact from `config.json` and
      `lib/materials/content.ts` — no hand-typed duplicate data
- [ ] Nesting explainer content is labeled as illustrative and sourced from
      actual `nesting.ts` output, not fabricated numbers
- [ ] No "AI" or "machine learning" language appears anywhere describing the
      nester
- [ ] Featured guides strip pulls from the five Phase 9 articles
- [ ] Footer contact details are real, not placeholder text
- [ ] Design system (palette, type, motion) from Phase 8 is unchanged — this
      phase restructures sections, it does not introduce a new visual language

---

## 19. PHASE 11 — CUT LAYOUT VISUALIZATION AT QUOTE TIME

Adds a real cut-layout diagram to the quote result, using the same nesting
engine already built in Phase 2 — called in "solo mode" against only the
current customer's own line items.

### The problem this solves, and the limit it respects

Customers who cut sheet stock for a living want to see the thing before they
buy it: how many sheets, how the parts sit, how much is left over. Interstate
Plastics and others publish standalone "yield calculators" that do exactly
this, and it is a legitimate, well-understood feature category — not a novelty.

But there is a hard limit, and this phase must not cross it: **the diagram
shown at quote time can only reflect this customer's own parts, alone on a
fresh sheet.** It cannot reflect real cross-order batching, because the other
orders that would eventually share a sheet do not exist yet when this customer
is quoting. Any diagram implying otherwise is a claim about the future dressed
up as a fact about the present.

This creates two genuinely different things, and the UI must keep them visibly
separate:

1. **The solo diagram** — real, exact, computed live from this order alone.
   "Here is how your parts fit on our stock sheet, and how many sheets you
   need." Always accurate. Always buildable. Build it now.
2. **The FLEX tier's statistical uplift** — already priced into the engine via
   `nest_uplift` in config.json. This is a *claim about expected future
   batching*, not a picture of a specific sheet. It stays a number and a
   sentence, never a diagram, because a diagram implies a specific layout that
   doesn't exist yet.

Do not build a single combined view that blurs these. A customer who reads the
solo diagram as "this is what happens to my parts" and separately reads "choose
the flexible option and we'll batch you with others to cut cost" understands
both truthfully.
A single diagram trying to show both would have to either fabricate other
orders or silently omit the batching benefit — both are worse than two honest,
separate answers.

### 19.1 — Solo nest call

In the quote API (`/api/quote`), after pricing is computed, call
`lib/pricing/nesting.ts`'s `nest()` function directly — the same function
built in Phase 2 — using only the current request's line items, expanded to
individual parts exactly as `expand_to_parts` already does it. Group by
`(material_code, brand, thickness, certification_tier)`, same as fulfillment
grouping, since a customer's own multi-line order can span more than one sheet
group (e.g., PEEK parts on one sheet, Ultem parts on another).

This is read-only and stateless: it does not write to `nest_runs`, does not
touch the remnant register, and has no effect on production. It exists purely
to answer "what would my own parts look like, alone, on a sheet."

Return this alongside the existing quote result:

```ts
solo_nest: {
  groups: [
    {
      material_code, brand, thickness_nominal, certification_tier,
      sheets: [ { index, length_in, width_in, placements: [...], remnants: [...] } ],
      sheet_count, utilisation, recoverable_fraction,
    },
    ...
  ]
}
```

### 19.2 — The diagram component

Build `SheetDiagram.tsx` — an SVG rendering of one sheet from `solo_nest`:

- Sheet outline to scale
- Each placed part as a labeled rectangle (part reference or line number),
  colored by the material swatch already defined in the design system
- Cut lines drawn along strip boundaries — visually distinguishing rip cuts
  (full-length) from crosscuts (within a strip), matching the guillotine
  sequence the nester actually produces
- Keepable remnants shaded differently and labeled with their dimensions
- Scrap (sub-`min_remnant_keep_in`) shown as plain hatching, unlabeled

If a group needs more than one sheet, render each as a tab or a stacked list,
labeled "Sheet 1 of 2," etc. Reuse the tabbed pattern already established
elsewhere on the site rather than inventing a new one.

Below the diagram, three real numbers pulled directly from the nest result:

- **Sheets required:** e.g. "1 sheet" or "2 sheets"
- **Utilisation:** e.g. "39% of this sheet"
- **Recoverable fraction:** e.g. "96% placed or kept as usable remnant"

Label this block plainly: **"How your order fits on our stock sheet."** Do not
call it a "cut plan" or "production plan" — reserve that language for the
actual fulfillment-time plan the operator generates, which may differ once
real batching happens. This is a preview, and should read as one.

### 19.3 — The honest caption

Directly under the diagram, one sentence, non-negotiable in every render:

> This shows your order alone. Choosing the flexible ship-when-full option
> below often improves on this by combining your cut with other orders on the
> same sheet — see [lead time comparison] for the price difference.

This sentence is what keeps 19.1's honest diagram and the FLEX tier's honest
statistic from contradicting each other in the customer's mind. Do not remove
it, shorten it below the point of clarity, or move it below the fold.

### 19.4 — Low-utilisation nudge

If `utilisation` on the solo diagram is below `nesting.target_utilization`
from config (currently 0.78, though flagged uncalibrated), surface a plain
suggestion rather than silence:

> Your order uses under half this sheet on its own. The flexible option
> typically improves this by batching with other orders — [see pricing]

Do not phrase this as a guarantee ("will improve") — it's a tendency based on
the statistical uplift already in config, not a commitment about this specific
order.

### What this phase does not do

- It does not query real pending orders. The diagram is always solo, always
  computed from the current request only.
- It does not write anything to the database. No `nest_runs` row, no remnant
  entries. This is preview-only.
- It does not change pricing. `subtotal_goods` is unaffected by anything in
  this phase — the price was already set using the statistical model in
  Phase 1's engine, before this diagram is even computed.
- It does not replace the operator's real nest board from Phase 7. That screen
  still runs the real, current-queue nest at fulfillment time and is the only
  place a real cross-order layout exists.

### Definition of done — Phase 11

- [ ] Every quote result includes a `solo_nest` object computed from that
      request's own lines only
- [ ] The diagram renders to scale, with placements, cut lines, and remnants
      distinguished visually
- [ ] Sheet count, utilisation, and recoverable fraction shown as real numbers
      from the nest result — never estimated or rounded misleadingly
- [ ] The honest caption in §19.3 appears on every render, unconditionally
- [ ] Low-utilisation orders get the nudge toward the FLEX tier, worded as a
      tendency, not a guarantee
- [ ] No database write occurs anywhere in this phase
- [ ] The solo diagram and the FLEX tier's statistical uplift are never merged
      into one visual — verify by reading the finished UI yourself and
      confirming a customer could not mistake one for the other

---

## 20. PHASE 12 — LIVE DIAGRAM, PER-MATERIAL SHEET SIZING, COLLAPSIBLE SECTIONS, EMAIL-A-QUOTE

Wires the solo cut diagram from §19 directly into the live quote builder,
makes sheet dimensions responsive to the actual material/thickness selected,
and adds three UI patterns modeled on Nox's site: collapsible specs,
collapsible part-number/PO fields, and a capture-and-email button. Do not
start before Phase 11.

### 20.1 — The diagram must live on the input screen, not a results screen

Phase 11 built the solo diagram as part of the quote result. That's necessary
but not sufficient — right now it likely renders only after the customer
finishes entering a line and a price resolves. Fix this: the diagram must
update on the same 400ms debounce as the price itself, in the same panel where
the customer is actively typing dimensions, so watching the sheet fill in is
part of the same feedback loop as watching the price change.

Concretely: wherever the live price is rendered next to the input fields
(built in Phase 3), the `SheetDiagram` component sits beside or below it,
subscribed to the same debounced re-quote call. Every keystroke that changes
material, thickness, length, width, or quantity triggers both the price
recompute and the diagram recompute together, from the same API response —
they should never be one step out of sync with each other.

If a line item is incomplete (material chosen but no dimensions yet), show the
diagram area as an empty sheet outline at that material's real stock size,
not blank space — this previews the canvas before it previews the cut.

### 20.2 — Sheet size must follow the actual material and thickness selected

Distributors' stock sheets are not one universal size. `config.json` already
models this at the material level: PEEK and Ultem ship 48x24, G10/FR4 ships
48x36, Torlon ships a smaller 24x12. The diagram must read `sheet_length_in`
and `sheet_width_in` from the SELECTED material's config entry every time the
material dropdown changes — never hardcode a sheet size anywhere in the diagram
component.

**One real-world gap to close.** Right now sheet size is fixed per material
regardless of thickness, but in reality a distributor's thick PEEK plate and
their thin PEEK sheet can legitimately come in different stock panel sizes.
Add optional per-thickness overrides to config without breaking the existing
default:

```json
"PEEK_NAT": {
  ...
  "sheet_length_in": 48.0,
  "sheet_width_in": 24.0,
  "sheet_size_overrides": {
    "0.125": { "sheet_length_in": 48.0, "sheet_width_in": 48.0 },
    "2.0":   { "sheet_length_in": 24.0, "sheet_width_in": 24.0 }
  }
}
```

If a thickness has no override, fall back to the material-level default — this
is additive, not a breaking change to the engine or the golden test cases.

**This is data the owner needs to get from actual distributors, not guess.**
Leave `sheet_size_overrides` empty (`{}`) for every material until real stock
sizes per thickness are confirmed with suppliers. Flag this in config with an
`UNCALIBRATED` note exactly like the other placeholder values already in the
file.

### 20.3 — Collapsible "specs" section, per line item

Model this on the applicable-standards table pattern common on metals sites —
a short list of industry specifications a given material/grade meets, each
with a checkbox-style indicator, next to the base spec designation.

**Read this before implementing anything:**

`ASTM D6262` genuinely covers extruded, compression-molded, and injection-molded
PAEK (PEEK) shapes — sheet, plate, rod, and tubular bar — and is a real, active
standard. That confirms this pattern is legitimate for plastics. It does not
confirm which standards apply to the other eleven materials, at what grade,
from which brand. **Do not invent ASTM, SAE AMS, NEMA, or MIL-spec
designations for materials without verified data.** A wrong standard number
next to a certification claim is a false statement of fact on a commercial
site, in the same category of risk as the DFARS and lineage statements already
handled carefully elsewhere in this build.

**Implementation, data-driven only:**

Add an `applicable_specs` array to each material/brand pair in config.json,
starting empty:

```json
"brands": {
  "ENSINGER_TECAPEEK": {
    "label": "Ensinger TECAPEEK natural",
    "price_multiplier": 1.08,
    "avl_common": true,
    "applicable_specs": []
  }
}
```

Each populated entry, once there is verified data from a manufacturer
datasheet or an actual MTR, looks like:

```json
"applicable_specs": [
  { "designation": "ASTM D6262", "description": "PAEK extruded/molded shapes", "verified_source": "Ensinger TECAPEEK datasheet, rev. 2025" }
]
```

The `verified_source` field is mandatory on every entry — it's the audit trail
proving where the claim came from. **Build a validation check that refuses to
render a spec on the live site if `verified_source` is empty or missing.**
This is a hard gate, matching the pattern already used for MTRs and lots
elsewhere in the system — no unverified claim reaches a customer.

The accordion itself: clickable header ("Applicable specs ▾ / ▴"), collapsed
by default, expanding to a simple two-column list — designation, description
— exactly like the reference pattern, adapted to plastics. If a material/brand
has zero populated specs, do not show an empty accordion; hide the whole
section for that line rather than displaying a section with nothing in it.

### 20.4 — Collapsible part number and purchase order sections

Two independent collapsible sections per line item or per order (scope
whichever way makes sense per field — part reference is naturally per-line, PO
number is naturally per-order), collapsed by default, same accordion pattern
as §20.3.

**Part reference field.** Already exists per the original brief — capped at 40
characters, labeled "internal reference only." This phase just adds the
show/hide toggle around it; the character cap and labeling from the original
spec do not change.

**Purchase order upload.** This is new. A customer's own PO document is a
business/procurement record, not a technical drawing of their part — treat it
differently from the drawing-upload restriction, but still with real limits:

- Accept PDF only. Reject every other extension, including image formats — a
  PO is a document, not a photo.
- Cap file size (5 MB is generous for a text PO).
- Store to the `resale-certs`-style pattern: a private Supabase Storage bucket
  (`purchase-orders/`), never public, attached to the quote or order record by
  ID.
- **Do not OCR it, parse it, or run it through any AI extraction.** It exists
  purely as a reference attachment a human can open during fulfillment if a
  question comes up about payment terms or PO validity. Automatically parsing
  a document a customer didn't design for that purpose is a good way to
  accidentally ingest something they didn't intend to share — treat it as
  inert storage, not a data source.
- If a customer's actual PO number is needed for the Stripe checkout
  custom_field (already specified in §8), that stays a separate typed text
  field — the upload is supplementary documentation, not a replacement for
  that field.

### 20.5 — Capture and email the on-screen quote as a PDF

New endpoint: `POST /api/quote/email`.

**Input:** `{ quote_id }` only. The email address it sends to is the same
email the customer already entered earlier in the flow — **do not accept an
arbitrary destination email address in this request.** If this endpoint can
send to any address typed into a field, it becomes an open mechanism for
someone to spam a third party's inbox with a branded PDF. Reuse whatever
identity check already exists on the quote record; if none exists yet at this
point in the flow, require the customer to (re)enter their own email and use
that as both the storage key and the send target in one step.

**What gets generated:** a distinct PDF template — call it `QuoteSummary`
(`lib/docs/quote-summary.tsx`), separate from the `Invoice` template built in
Phase 5. A quote is not an invoice: it has no PAID status, no tax line unless
one is estimated, and should say "Quote — not a bill" somewhere visible, since
a quote PDF wandering into an accounts-payable inbox looking identical to an
invoice is a real confusion risk for a company this size.

Content, pulled directly from the stored `quotes.result_json` — never
recomputed, so the PDF always matches exactly what was on screen:

- Quote number and date, validity window (from `quote.validity_hours`)
- Every line: material, brand, certification tier, dimensions, thickness,
  quantity, tolerance, finishes, annealing, add-ons
- The solo cut diagram, if feasible to render into the PDF (an SVG-to-image
  snapshot); if this is too heavy an integration for react-pdf in this
  environment, it's acceptable to omit the diagram and include the numeric
  summary only (sheets required, utilisation) — flag which approach was taken
- Full cost breakdown and lead-time table, same as the on-screen quote
- The existing spec statement (tolerance/squareness/thickness disclosure)
  already generated by the pricing engine
- Company contact details from `lib/brand.ts`

**Send it via Resend**, same pattern as the Stage-1 order confirmation email in
Phase 5, with the PDF as an attachment.

**Rate-limit this endpoint.** A basic per-quote-id cooldown (e.g., no more than
one send per 5 minutes per quote) is enough at this scale — it exists to stop
accidental double-clicks and casual abuse, not to defend against a serious
attacker. Don't over-build this; a simple in-memory or database timestamp
check is sufficient.

**Button placement and label:** "Email me this quote" — not "Send" or
"Export," so it's unambiguous where it goes. Place it near the price, visible
without scrolling once a valid price has resolved.

### Definition of done — Phase 12

- [ ] The diagram updates on the same debounce as the price, in the same input
      panel — never gated behind a separate "get quote" click
- [ ] Changing the material dropdown changes the sheet outline size and
      proportions in the diagram immediately
- [ ] `sheet_size_overrides` exists in config, empty by default, and the
      diagram correctly falls back to the material-level size when no override
      is present for the selected thickness
- [ ] No ASTM, AMS, NEMA, or MIL designation appears anywhere on the site
      unless it has a non-empty `verified_source` in config
- [ ] The specs accordion is hidden entirely for any material/brand with zero
      populated, verified specs — never shown empty
- [ ] Part reference and PO upload each collapse/expand independently and
      default to collapsed
- [ ] PO upload rejects every extension except PDF, caps file size, and is
      never parsed or OCR'd — verify by confirming no code path sends the
      uploaded file to any AI or text-extraction service
- [ ] "Email me this quote" sends only to the email already on the quote
      record — attempting to pass an arbitrary destination address is rejected
- [ ] The generated PDF is visually and textually distinguishable from an
      invoice, including an explicit "Quote — not a bill" marker
- [ ] Resending the same quote within the cooldown window is blocked with a
      clear message, not a silent failure
