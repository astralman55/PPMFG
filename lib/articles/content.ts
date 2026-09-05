/**
 * The five educational articles from CLAUDE_CODE_BRIEF.md §17.5. Plain
 * paragraphs rendered directly as JSX rather than parsed markdown - no new
 * dependency needed for five static pages, consistent with the locked
 * stack's "no component library" discipline.
 */

export interface Article {
  slug: string;
  title: string;
  dek: string;
  meta_title: string;
  meta_description: string;
  relatedMaterialCodes: string[];
  body: string[];
}

export const articles: Article[] = [
  {
    slug: "why-peek-and-ultem-blanks-warp-after-cutting",
    title: "Why PEEK and Ultem blanks warp after cutting",
    dek: "It's not a defect. It's residual stress finding somewhere to go.",
    meta_title: "Why PEEK and Ultem Blanks Warp After Cutting",
    meta_description: "Residual stress in PEEK, Ultem and PPS plate explained plainly: why blanks bow after cutting, the 48-hour window, and when annealing is worth paying for.",
    relatedMaterialCodes: ["PEEK_NAT", "ULTEM_1000", "PPS_TECHTRON"],
    body: [
      "A customer cuts a clean 12x12 in PEEK blank, checks it flat off the saw, and comes back the next day to find it's bowed by a few thousandths. Nothing was wrong with the cut. This is one of the most common support questions in this business, and it has a simple physical explanation: the material was never flat to begin with, internally.",
      "Sheet stock like PEEK, Ultem, and PPS is extruded or compression-molded under heat and pressure, then cooled. That cooling doesn't happen perfectly evenly through the thickness of the sheet - the surfaces cool faster than the core. The result is a plate that looks flat and behaves flat, but is holding a real internal stress gradient, locked in place by the surrounding material.",
      "Cut a piece free from that sheet, and you remove the surrounding material that was holding the stress in check. The freed piece is now free to relax toward whatever shape relieves that internal stress - usually a slight bow or twist. This isn't unique to plastics; it's the same underlying phenomenon that makes machinists pre-stress-relieve certain metal stock before finish machining. Plastics just show it faster and more visibly.",
      "The practical number to know: a 12x12 in blank in one of these materials can bow somewhere in the range of 0.010 to 0.025 in within about 48 hours of being cut. It usually stabilizes after that - the stress that's going to release, releases, and the part settles into its final shape. This is why we disclose it automatically on every quote line for a residual-stress-flagged material, rather than waiting for someone to ask after the fact.",
      "Whether this matters depends entirely on what the part needs to do. A spacer or a bracket that gets bolted flat against a rigid surface on final assembly usually doesn't care about a few thousandths of pre-assembly bow - it gets pulled flat when it's installed. A part that needs to hold its own flatness unsupported, or that's going into a precision fixture, is a different story.",
      "That's what stress-relief annealing is for. It's a controlled heat cycle - a slow ramp up, a soak at temperature, and a slow cool back down - that lets the internal stress relax before the part ships, instead of after a customer has it in hand. It's not free: it adds oven time and a business day to the lead time, and it's blocked on same-day and next-day tiers because the cycle itself takes longer than that. But for a part that has to hold tight tolerance or sit unsupported, it's usually worth the day.",
      "One thing worth being direct about: annealing reduces the tendency to warp, it doesn't eliminate it outright, and it doesn't turn a stressed material into an unstressed one. If a design absolutely cannot tolerate any post-cut movement, that's a conversation about tolerance and inspection, not just a checkbox at quote time.",
      "If a part in PEEK, Ultem, or PPS is going to be inspected or assembled soon after it's cut, it's worth building the 48-hour settling window into a schedule rather than treating day-one dimensions as final. And if the application genuinely can't tolerate movement, add the anneal option when getting a price - it's the same page, one checkbox, and the tool will tell you the new ship date before you commit to anything.",
    ],
  },
  {
    slug: "peek-machining-tolerances-what-a-saw-can-and-cant-hold",
    title: "PEEK machining tolerances: what a saw can and can't hold",
    dek: "Tighter tolerance only holds over a shorter span. That's physics, not a policy.",
    meta_title: "PEEK Machining Tolerances: What a Saw Can Hold",
    meta_description: "The real, span-limited tolerance system for saw-cut PEEK and engineering plastics, explained the way a machinist would want it explained.",
    relatedMaterialCodes: ["PEEK_NAT", "PEEK_GF30", "PEEK_CF30"],
    body: [
      "Ask a distributor for a tight tolerance on a large blank and you'll often get a quote back anyway - and a part that doesn't actually hold that tolerance once it's off the saw. The honest answer is that tolerance and span are linked, and a straight cut on a sliding table saw simply cannot hold a tight number over a long distance the way it can over a short one.",
      "Three tolerance tiers are offered here, and each one comes with a real span limit, not a suggested one. Standard tolerance, at plus or minus 0.030 in, holds up to a 47 in span. Precision, at plus or minus 0.015 in, holds up to 36 in. Tight, at plus or minus 0.010 in, holds up to 24 in. Ask for tight tolerance on a 40 in part and the quote tool will refuse it and tell you why, rather than quietly quoting something it can't deliver.",
      "Why does the limit shrink as the tolerance tightens? Two compounding reasons. First, blade deflection and feed-rate effects accumulate over distance - a saw blade that tracks within a hair over six inches can wander further than that hair over four feet, especially in denser or more abrasive materials. Second, thermal expansion is a real, physical number: a longer part expands and contracts more in absolute terms for the same temperature swing, and a tight tolerance has less room to absorb that movement before the part reads out of spec.",
      "There's a third factor that's specific to a few materials in this catalog: residual stress. PEEK, Ultem, and PPS plate can move a few thousandths in the two days after cutting as internal stress releases - see the companion article on why these blanks warp. A tight tolerance on a stress-flagged material is exactly where that matters most, which is part of why the pricing engine treats residual-stress-flagged material differently on precision and tight tiers, and why annealing exists as an option at that point.",
      "Squareness is the other half of this conversation, and it's just as span-dependent. Standard tolerance holds squareness to 0.010 in per 12 in of edge. Precision holds 0.006 in per 12 in. Tight holds 0.004 in per 12 in. If a design needs a part to sit flush against a perpendicular reference over a long edge, squareness - not just the linear dimension - is usually the number that actually matters, and it's worth checking against the same span limits.",
      "None of this is a reason to avoid tight tolerance where it's genuinely needed - it exists because some parts really do need it, and the quote tool prices the extra passes and inspection time that holding it requires. It's a reason to be honest about span at the design stage: if a 30 in part needs plus or minus 0.010 in, the real answer is to either split it into two shorter pieces that each qualify, or accept the precision tier's slightly looser number over the full length.",
      "The quote tool enforces all of this automatically - pick a tolerance tier, enter a dimension past its limit, and it tells you plainly rather than letting an order through that can't be held. That's a deliberate choice: a rejected quote with a clear reason is a five-second fix. A part that ships out of tolerance because a limit was never enforced is a much more expensive conversation for everyone.",
    ],
  },
  {
    slug: "why-your-ultem-parts-crack-after-cleaning",
    title: "Why your Ultem parts crack after cleaning",
    dek: "IPA is a normal cleaning solvent almost everywhere else. Not here.",
    meta_title: "Why Ultem (PEI) Parts Crack After IPA Cleaning",
    meta_description: "Ultem and other PEI parts can stress-crack from isopropyl alcohol exposure. What causes it, and how to clean and handle Ultem parts safely.",
    relatedMaterialCodes: ["ULTEM_1000", "ULTEM_2300"],
    body: [
      "Isopropyl alcohol is the default cleaning solvent in half the shops and labs in the country. It's cheap, it evaporates fast, and it's safe on most metals and most plastics. Ultem is one of the exceptions, and it's an exception that surprises people who've never been burned by it before - because the part often doesn't fail immediately. It fails days or weeks later, after it's already in service.",
      "This is called environmental stress cracking, and it's a real, well-documented interaction between certain solvents and certain plastics under stress. Ultem parts almost always carry some internal molded-in or machining-induced stress, even a small amount. IPA and similar solvents can migrate into the polymer at a molecular level and lower the stress threshold at which a crack propagates. A part that would have been fine indefinitely under normal handling can develop a crack from a stress level it would otherwise have tolerated for years.",
      "The insidious part is the delay. Wipe an Ultem part down with IPA, and it typically looks completely fine immediately afterward - no visible reaction, no obvious damage. The cracking can show up hours or weeks later, often at the worst possible time: after the part has been assembled into something else, or after it's already in the customer's hands. By the time the crack is visible, it's easy to blame the wrong step in the process, because the cleaning happened long before the failure did.",
      "This is exactly why we don't clean Ultem parts with IPA here, full stop - our cleanroom handling process substitutes deionized water and lint-free wipes specifically for stress-crack-sensitive materials. It costs a little more in process time than a quick IPA wipe would, and it's non-negotiable for any Ultem line going through a cleanroom pack finish.",
      "If Ultem parts are being cleaned downstream after they arrive - before assembly, before inspection, before packaging for a customer - the same caution applies on your end. Isopropyl alcohol, acetone, and several other common shop solvents are all worth checking against Ultem's chemical compatibility data before they touch a finished part, especially one that's going to see any mechanical stress in service. Mild soap and water, or a solvent explicitly rated compatible with polyetherimide, is the safer default.",
      "It's worth being clear that this isn't a flaw specific to one brand or grade of Ultem - it's a property of the base PEI resin itself, and it applies to both the natural (Ultem 1000) and glass-filled (Ultem 2300) grades equally. The glass fiber doesn't change the underlying chemistry of the resin around it.",
      "The practical takeaway: if a process, a customer's assembly line, or a maintenance procedure calls for wiping down parts with alcohol, and any of those parts are Ultem, that's worth flagging before it becomes a field failure. It's a five-minute conversation now versus a part that fails for no apparent reason months into service.",
    ],
  },
  {
    slug: "buying-a-small-peek-blank-without-buying-a-whole-sheet",
    title: "Buying a small PEEK blank without buying a whole sheet",
    dek: "The minimum-order problem, and the actual arithmetic behind it.",
    meta_title: "Buying a Small PEEK Blank Without a Full Sheet Minimum",
    meta_description: "The real cost of a distributor's full-sheet minimum order, worked out in dollars, and how to buy just the blank a project actually needs.",
    relatedMaterialCodes: ["PEEK_NAT"],
    body: [
      "Most engineering-plastics distributors sell PEEK, Ultem, and similar materials by the sheet. That works fine for a shop that consumes a full sheet every few weeks. It works badly for anyone who needs one 12x12 in blank for a prototype, a single fixture, or a low-volume production run - because the distributor's minimum order is still the whole sheet, or close to it.",
      "The arithmetic behind why this is expensive is worth working out explicitly, because \"a full sheet is expensive\" undersells the actual problem. The box below is computed directly from current material cost - not a rounded estimate - for a standard PEEK sheet against a single 12x12 in blank. A buyer who needs one blank is being asked to pay for all of that material, most of which they will never use, sitting on their own shelf, in order to get the piece they actually need.",
      "That leftover material isn't free storage, either. It's cash tied up in inventory, floor space it occupies, and in some shops it's material that never gets used at all before it's written off. For a one-off prototype or a low-volume job, buying a full sheet to get one blank is frequently the single largest line item in the whole project - larger than the machining time that follows it.",
      "There's a second, quieter cost most people don't think about until they've already committed to the full-sheet purchase: squaring. A sheet arrives with four rough edges from however it was slit or sawn at the mill. Every one of those edges needs to be squared on your own equipment before a usable part comes off the sheet - blade time, setup, and floor time that gets paid for on every single job that starts from raw stock, not just the first one.",
      "The alternative is buying exactly the blank a project needs, already squared on all four sides, from someone who buys full sheets at volume and can absorb the leftover material across many customers' orders instead of one. That's the entire economic argument behind selling individually-cut blanks rather than sheets: the seller carries the sheet-level cost and the remnant-management problem, the buyer pays for the footprint they actually consume.",
      "This only works if the buyer can get a real, firm price for that one blank in a reasonable amount of time - a distributor's human-gated RFQ process for a small order often takes as long as the ordering process for a full sheet, which erases most of the benefit. That's the reason a live, instant quote tool matters here as much as the cutting itself: the MOQ problem isn't just about material cost, it's about the delay of getting a quote for an order too small to be a priority for a sales team optimized around full-sheet purchases.",
      "If a project genuinely needs a full sheet's worth of material - a production run, a shop that will use the remainder soon - buying the sheet directly from a distributor is usually still the better economics. The gap this closes is specifically the one-off, the prototype, and the low-volume order where the alternative is paying for material that will sit on a shelf indefinitely.",
    ],
  },
  {
    slug: "g10-and-fr4-why-it-destroys-carbide-blades",
    title: "G10 and FR4: why it destroys carbide blades and what that means for your quote",
    dek: "The abrasion economics behind the composite-day batching rule.",
    meta_title: "Why G10/FR4 Destroys Carbide Blades",
    meta_description: "G10 and FR4 glass-epoxy laminate wears carbide tooling faster than any other material we cut. Here's the honest reason it's batched to one day a week.",
    relatedMaterialCodes: ["G10_FR4"],
    body: [
      "Every other material in this catalog is a thermoplastic: PEEK, Ultem, Delrin, PTFE, PPS, and Torlon all soften with heat and cut in a way that's broadly similar from a tooling perspective, even as their specific machining parameters differ. G10 and FR4 are not thermoplastics. They're thermoset composites - layers of woven glass fabric bonded together with epoxy resin under heat and pressure - and cutting them wears equipment in a completely different way.",
      "The glass fiber is the reason. Glass is abrasive in a way that plastic resin simply isn't. Every pass through G10 or FR4 is effectively passing carbide tooling through a woven bed of fine glass filaments, and that abrasion adds up far faster than it does cutting any polymer in this shop. A blade that holds an edge through dozens of PEEK or Delrin jobs can show measurable wear after a single G10 job of any real size.",
      "This shows up as a real cost in two places: the physical blade wear itself, and the fine glass dust the cutting produces. That dust isn't just a nuisance - it requires local exhaust ventilation and a P100-rated respirator to handle safely, which is a different setup than what a typical plastics cutting day requires. Switching between a normal thermoplastic job and a G10 job mid-day means a real changeover: different dust collection posture, different PPE, and a blade that may need to be swapped before it's fully worn out on the material it was previously cutting.",
      "The economically honest way to handle this is to not spread that changeover cost across every single order. Instead, G10 and FR4 orders are batched to one scheduled day per week. Every G10 job that comes in gets queued for that day, the shop sets up once for the dust and blade considerations that material demands, and that fixed cost gets shared across every order cut that day instead of being paid in full by whoever happens to place the first G10 order of the week.",
      "The tradeoff, and it is a real one, is lead time. A G10 order placed the day after the scheduled composite day waits nearly a full week for its slot, in a way a PEEK or Delrin order placed on the same day would not. The lead-time calendar accounts for this automatically when pricing a G10 or FR4 line - the promised ship date already reflects the next scheduled composite day, not a generic turnaround estimate.",
      "This is worth trusting rather than being annoyed by, and it's worth explaining plainly rather than glossing over: the alternative to batching would be either quietly absorbing the extra blade cost and dust-handling overhead into every material's price - meaning PEEK and Delrin customers subsidize G10 customers' tooling wear - or running ad-hoc changeovers all week, which is slower and more expensive for everyone, including G10 customers.",
      "One more thing worth knowing if a design is genuinely orientation-sensitive: G10 and FR4's woven glass fabric has a grain direction, similar in spirit to wood grain, and mechanical strength can vary slightly depending on how a part is oriented relative to that weave. If a part's strength in service depends on which direction it was cut, that's worth flagging at quote time rather than assuming orientation doesn't matter the way it wouldn't for an unfilled thermoplastic.",
    ],
  },
];

export function getArticleBySlug(slug: string): Article | null {
  return articles.find((a) => a.slug === slug) ?? null;
}
