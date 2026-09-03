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
`nest_uplift` drops to zero so effective yield falls too. `NEST` is the mirror:
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
against the quoted price creates a cliff where picking the cheaper `NEST` tier
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
Nox mechanism, and it is what the `NEST` lead tier sells.

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
