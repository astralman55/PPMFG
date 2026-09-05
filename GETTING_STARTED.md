# GETTING STARTED — From zero to a running build

You are not going to write code. You are going to set up four accounts, install
two things, and then paste prompts in order, checking a gate after each one.

Budget: about 90 minutes of setup before the first prompt.

---

## PART 1 — BEFORE YOU OPEN CLAUDE CODE

### 1.1 Understand what a folder structure is (2 minutes, then forget it)

A web project is a folder of folders. Next.js has fixed conventions:

```
your-project/
├── app/          every URL on your site. app/quote/page.tsx = yoursite.com/quote
├── lib/          logic that isn't a page. The pricing engine lives here.
├── public/       images and static files
├── reference/    the Python files I gave you. Read-only. Never edited.
├── .env.local    your secret keys. NEVER shared, never committed.
└── package.json  the list of libraries the project uses
```

That's the whole mental model. `app` = what people see, `lib` = what thinks,
`.env.local` = secrets. **You will never create these by hand.** One command
generates the entire tree.

### 1.2 Install Node.js

Claude Code itself no longer needs Node, but **your website does** — Next.js
runs on it. Get the LTS version from nodejs.org. Install, then fully close and
reopen your terminal.

Verify:
```
node --version
```
Anything v20 or higher is fine.

### 1.3 Install Claude Code

Requires a paid Claude plan (Pro, Max, Team or Enterprise) or a Console API key.

**Mac / Linux:**
```
curl -fsSL https://claude.ai/install.sh | bash
```

**Windows PowerShell:**
```
irm https://claude.ai/install.ps1 | iex
```

Then:
```
claude --version
claude doctor
```

`claude doctor` checks your install, auth state and settings. If it's happy,
you're ready.

**If terminals make you anxious:** the Claude Desktop app has a Code tab that
runs the same thing with a graphical interface. For someone who doesn't read
code, that's the friendlier path. Same prompts either way.

### 1.4 Create four accounts

Do this now. Claude Code will stop and wait if you don't have keys.

| Service | What for | Get |
|---|---|---|
| **Supabase** | database + file storage for MTRs | Project URL, anon key, service role key |
| **Stripe** | payments | Publishable key, secret key (**test mode**) |
| **Resend** | emails with PDF attachments | API key |
| **Vercel** | hosting | Just sign up with GitHub |

**Stay in Stripe test mode until the whole flow works.** Test keys start with
`pk_test_` and `sk_test_`. Card number `4242 4242 4242 4242`, any future expiry,
any CVC. You can run a hundred fake orders and nothing is charged.

Resend needs you to verify a domain via DNS records before it will send from
your address. Do that early — DNS can take a few hours to propagate.

**Never paste a secret key into a chat with me or any other AI.** Claude Code
writes them into `.env.local` on your own machine, where they belong.

### 1.5 Make the project folder

```
mkdir ~/plastics
cd ~/plastics
mkdir reference
```

Put `CLAUDE_CODE_BRIEF.md` and `GETTING_STARTED.md` in `~/plastics/`.
Put the five other files — `pricing_engine.py`, `nesting.py`, `test_pricing.py`,
`config.json`, `golden_cases.json` — in `~/plastics/reference/`.

Then, from inside `~/plastics`:
```
claude
```

---

## PART 2 — THE PROMPTS

Paste these one at a time. **Do not paste the next one until the gate passes.**
Each prompt ends by telling Claude Code to stop, because an agent that runs
eight phases unsupervised produces eight phases of compounding wrong
assumptions.

---

### Prompt 0 — Orientation and scaffold

```
Read CLAUDE_CODE_BRIEF.md in full before doing anything.

Context: I am the owner. I am a civil and ocean engineer with no software
experience. I cannot read or debug code. Explain what you are doing in plain
English, and when something fails, tell me what broke and what you are doing
about it rather than showing me a stack trace.

Execute Phase 0 only:
- Scaffold a Next.js 15 project with TypeScript strict mode, Tailwind, and the
  App Router, in this directory.
- Create lib/brand.ts with placeholder company name, address, phone and an
  empty CAGE code field.
- Copy reference/config.json to lib/pricing/config.json. Leave the reference
  copy untouched.
- Write the Supabase migration SQL from section 6 of the brief, but do not run
  it yet.
- Initialise git and make a first commit.
- Create .env.local with every variable from section 13 of the brief, left
  blank, and make sure .env.local is in .gitignore.

Then STOP. Tell me exactly which accounts and keys you need from me, and show
me how to confirm the dev server runs.
```

**Gate:** `npm run dev` serves a page at localhost:3000. Doesn't matter what it
looks like. Commit exists.

---

### Prompt 1 — The pricing engine (the most important one)

```
Execute Phase 1 only.

Port reference/pricing_engine.py to lib/pricing/engine.ts. It is a tested
reference implementation and it is the numerical specification for my business.
Preserve module boundaries, variable names and order of operations exactly. Do
not improve it, do not refactor it, do not simplify anything.

Pay specific attention to the five items under "The five things that are easy
to port wrongly" in section 3 of the brief. Each describes a bug that already
happened once.

Then write lib/pricing/__tests__/golden.test.ts. It must load
reference/golden_cases.json and assert that your TypeScript engine reproduces
every field in `expect` for all 13 cases within $0.01, applying the stated
config_override. Also port the invariant tests listed in the Verification Gate,
including the full lead-tier monotonicity sweep.

Run the tests. If any fail, fix the TypeScript, never the golden file. The
Python is the oracle.

Then STOP and show me the test output.
```

**Gate:** every test passes. If it says anything other than 0 failed, reply
`Tests are still failing. Fix the TypeScript, not the expected values, and show
me the output again.` Do not move on. Everything downstream is built on this.

---

### Prompt 2 — The nester

```
Execute Phase 2 only.

Port reference/nesting.py to lib/pricing/nesting.ts, preserving the algorithm
exactly. Read the comment block at the top explaining why it is a guillotine
shelf packer. Do not substitute a maxrects or skyline packer — those produce
layouts my saw physically cannot cut.

Write tests proving: strips never overlap in y (the guillotine guarantee); no
part exceeds sheet bounds; exactly three 12.25 inch blanks fit one 24x48 sheet
and a fourth opens a second sheet; the nester is deterministic; grain-sensitive
material is never rotated; and three batched orders reach higher sheet
utilisation than one order alone.

Then STOP and show me the utilisation numbers.
```

**Gate:** one order should land near 14% utilisation, three batched near 51%.
That gap is the entire economic argument for the FLEX lead tier.

---

### Prompt 3 — Quote flow

```
Execute Phase 3 only. Build:

- POST /api/quote — receives dimensions and options, prices server-side, writes
  a quotes row, returns the result plus quote_id.
- POST /api/quote/upload — CSV/XLSX parsing per section 7.2, including the
  hard rejection of drawing and model files by extension AND magic bytes.
- The quote builder UI with every option: material, brand, certification tier,
  dimensions, thickness as a select scoped to the material, quantity,
  tolerance, edge finish, face finish, anneal, add-ons.
- Fractional input parsing: "12 1/2", "12-1/2" and "12.5" must all become 12.5.
- The five lead tiers shown as a live comparison with price AND promised ship
  date side by side.

Critical: the browser must never send a price. Verify this yourself by
attempting to submit a modified price and showing me that the server ignores it.

Then STOP. Show me a PEEK 12x12x0.5 quote in the browser and confirm it matches
golden case canonical_peek_12x12.
```

**Gate:** browser total matches the golden file. Uploading a `.dxf` gets
rejected with the explanatory message.

---

### Prompt 4 — Stripe

```
Execute Phase 4 only.

Use Stripe Checkout in hosted redirect mode. Do not build custom card fields.

POST /api/checkout accepts ONLY { quote_id, email, company, customer_po }. Read
total_cents from the database row. Check expires_at and that consumed_at is
null. Build the session from the stored figure. A price must never arrive from
the client.

Enable automatic_tax. Set customer_creation to always. Restrict shipping to US.
Add a custom_field for purchase order number.

Build the webhook at /api/webhooks/stripe. Read the raw body with await
req.text() BEFORE parsing, verify the signature, and insert the event id into
webhook_events first, bailing on conflict. Stripe retries webhooks and a
duplicate order or duplicate email is a support nightmare.

Then STOP. Walk me through running a test purchase with card 4242 4242 4242
4242, and show me that replaying the same webhook event creates no second order.
```

**Gate:** one test purchase creates exactly one order row. Replaying creates
none.

---

### Prompts 5 through 8

Same pattern, one phase at a time:

```
Execute Phase 5 only. [invoice PDF + stage-1 email]
Then STOP and send a test email to my address so I can see the attachment.
```

```
Execute Phase 6 only. [lot library, fulfilment, Certificate of Conformance,
packet merge]

The hard block in section 9 is not optional: an order cannot be marked shipped
until every line has a lot_id and that lot has an mtr_path. And on
INDUSTRIAL-tier lines the DFARS and lineage statements must be suppressed —
printing them on material with no mill lineage is the failure mode that ends
this business.

Then STOP and show me a complete certification packet PDF.
```

```
Execute Phase 7 only. [nest board, remnant register, calibration panel]
Then STOP and show me a nest run committing and populating remnants.
```

```
Execute Phase 8 only. [landing page per section 11]

Follow the design direction closely. The hero is the working quote tool, not a
headline. The dimensional-annotation system is the point — the customer's blank
rendered as a live engineering drawing with callouts that update as they type.

Then STOP and show me screenshots at 390px wide and at desktop width.
```

---

## PART 3 — HOW TO SUPERVISE WITHOUT READING CODE

**Commit after every green gate.** Say: `Commit this with a clear message.`
That's your undo button. Without it, a bad prompt can lose a day's work.

**When something breaks, don't debug — delegate.**
```
That's not working. Diagnose it yourself: read the error, form a hypothesis,
test the hypothesis, and fix it. Then tell me in plain English what was wrong.
Don't show me the stack trace.
```

**When it goes off-brief:**
```
Stop. Re-read section [N] of CLAUDE_CODE_BRIEF.md. What you built doesn't match
it. Explain the difference, then fix it to match.
```

**When it wants to change a business number:**
```
No. That number belongs in lib/pricing/config.json, not in code. Move it there.
```

**Three refusals you should make, every time:**

1. Never let it edit `reference/golden_cases.json` to make tests pass. The
   Python is the oracle. If the TypeScript disagrees, the TypeScript is wrong.
2. Never let it put a secret in a variable starting with `NEXT_PUBLIC_`. That
   prefix means "send this to the browser." Your Supabase service role key and
   Stripe secret key in there would be a full compromise.
3. Never let it skip a gate because a later phase is "more interesting."

---

## PART 4 — AI FEATURES, AND A WARNING

You asked about connecting AI APIs. Two very different things here, and one is
dangerous.

### The safe, genuinely useful case

A buyer emails you: *"need 4 pcs 6x6 half inch peek natural and 2 of the same in
ultem."* Today that's a phone call. An LLM turns it into structured line items
in your quote builder in two seconds. That's a real feature and worth building.

Wire it server-side only, in Phase 9, after everything else works:

```
Add POST /api/quote/parse. It accepts pasted plain text describing quantities,
dimensions and materials, and returns structured line items matching the
LineItem schema in lib/pricing/engine.ts.

Use the Anthropic API with a strict extraction schema. The key lives in
ANTHROPIC_API_KEY in .env.local, server-side only — never a NEXT_PUBLIC_
variable, never called from the browser.

Constraints, non-negotiable:
- The model returns ONLY dimensions, quantities, material codes and brands.
- Raw input is never written to the database or any log. Discard after parsing.
- Anything the model cannot map to a config material is returned as an error
  for the customer to fix manually. Never guess a material.
- Enforce a 500 character input cap.
- The result is always shown to the customer for confirmation before pricing.
  The model never silently populates a quote.

The engine still prices it. The model only parses.
```

### The dangerous case

**Do not build an AI chat assistant, an "ask about your application" field, or
anything that accepts open-ended text about what the customer is making.**

You deliberately architected this business to never hold controlled technical
data. That's why you reject drawings, cap the part-reference field at 40
characters, and ask only for dimensions. An AI chat box undoes all of it in one
afternoon — it's an open invitation for someone to paste a defense program
description, a drawing callout, or a part number from a classified assembly into
your server logs.

Curbell asks "tell us about your application" because a human reads it and it
never leaves their CRM. If you ask the same question through an LLM, you've
created an export-controlled data pipeline you didn't design and can't audit.

The 500-character cap and the discard-after-parsing rule above exist for exactly
this reason. Keep them.

---

## PART 5 — WHAT WILL ACTUALLY GO WRONG

Realistic expectations, so you don't think you've failed when these happen:

- **Phase 1 will take longer than you expect.** Porting 700 lines of Python with
  13 exact-match golden cases is finicky. It may take several rounds. This is
  the phase where patience pays — everything else sits on top of it.
- **Resend DNS won't verify immediately.** Start it during setup.
- **Stripe webhooks won't reach localhost** without the Stripe CLI forwarding
  them. Claude Code knows how; ask it to walk you through `stripe listen`.
- **Something will look wrong on mobile.** Say so plainly: *"On my phone the
  quote tool overflows the screen. Fix it."*

If you get stuck for more than an hour on one thing, start a fresh Claude Code
session. Long sessions accumulate confusion, and a clean context with the brief
re-read often solves in one prompt what twenty prompts couldn't.
