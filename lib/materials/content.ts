/**
 * Prose for the material library - CLAUDE_CODE_BRIEF.md §17.1: "holding only
 * what config does not already contain." Every number, flag, brand and
 * thickness lives in lib/pricing/config.json and is read from there by the
 * pages that use this file - nothing numeric belongs here, and nothing here
 * should ever need to change when a config number changes.
 */

export interface MaterialFaq {
  question: string;
  answer: string;
}

export interface MaterialContent {
  hero_line: string;
  overview: string;
  typical_applications: string[];
  why_this_material: string;
  handling_notes: string[];
  faq: MaterialFaq[];
  slug: string;
  meta_title: string;
  meta_description: string;
}

export const materialContent: Record<string, MaterialContent> = {
  PEEK_NAT: {
    hero_line: "Metal-replacement performance in a machinable thermoplastic.",
    overview:
      "Unfilled PEEK combines high mechanical strength, chemical resistance, and a continuous service temperature far above most engineering plastics. It's the workhorse grade most distributors stock and most AVLs already qualify.",
    typical_applications: [
      "Bearings, bushings and wear components in high-temperature equipment",
      "Semiconductor process tooling",
      "Medical instrument housings and surgical tool components",
      "Seal and valve parts exposed to steam or aggressive chemicals",
      "Aerospace brackets and structural ducting",
    ],
    why_this_material:
      "Start here unless a specific requirement points elsewhere. Natural PEEK holds tolerance well, is the most commonly AVL-approved grade, and costs less than the glass- or carbon-filled variants.",
    handling_notes: ["Avoid sharp internal corners in downstream machining - PEEK is notch-sensitive in thin sections."],
    faq: [
      {
        question: "Can PEEK be autoclaved?",
        answer:
          "Yes. Natural PEEK tolerates repeated steam sterilization better than almost any other machinable thermoplastic, which is why it shows up throughout medical instrumentation.",
      },
      {
        question: "Does PEEK need to be annealed?",
        answer:
          "Not for most applications, but it carries internal stress from how the sheet was made - see the residual stress note above. If your part holds a tight tolerance or a stressed geometry, annealing is worth the extra day.",
      },
      {
        question: "How does natural PEEK compare to the glass- or carbon-filled grades?",
        answer:
          "Natural PEEK is tougher and easier to machine to a fine finish. The filled grades trade some of that toughness for higher stiffness and better wear resistance.",
      },
    ],
    slug: "peek-natural",
    meta_title: "PEEK Sheet & Plate, Natural (Unfilled) | Cut to Size",
    meta_description:
      "Natural PEEK cut to your dimensions, priced in seconds. Full mill traceability available. Ships certified the same day it's cut.",
  },

  PEEK_GF30: {
    hero_line: "Glass-reinforced PEEK for higher stiffness and dimensional stability under load.",
    overview:
      "Adding 30% glass fiber to PEEK raises stiffness and reduces creep at elevated temperature, at the cost of some toughness and machined surface finish. It's the grade to reach for when a part needs to hold shape under sustained mechanical or thermal load.",
    typical_applications: [
      "Structural components under continuous mechanical load",
      "Precision parts that must resist creep at elevated temperature",
      "Electrical connector bodies and insulators",
      "Pump and compressor components exposed to heat and pressure",
    ],
    why_this_material:
      "Choose glass-filled PEEK over natural PEEK when stiffness and dimensional stability under heat matter more than surface finish or machinability. For wear and friction applications, carbon-filled PEEK is usually the better fit.",
    handling_notes: ["Glass fiber is abrasive to standard tooling; expect faster blade wear than natural PEEK."],
    faq: [
      {
        question: "Is PEEK GF30 stronger than natural PEEK?",
        answer:
          "It's stiffer and creeps less under sustained load at temperature, but natural PEEK is tougher and machines to a cleaner edge. Which is 'stronger' depends on whether your failure mode is deflection or impact.",
      },
      {
        question: "Can I get a tight edge finish on glass-filled PEEK?",
        answer:
          "Glass fiber at the cut edge is more abrasive and slightly rougher than natural PEEK's edge. A scraped or chamfered finish holds up well; a mirror finish isn't realistic on this grade.",
      },
      {
        question: "Does glass-filled PEEK carry the same residual stress as natural PEEK?",
        answer: "Yes - see the residual stress note above. The reinforcement doesn't change how the plate was extruded.",
      },
    ],
    slug: "peek-30-glass-filled",
    meta_title: "PEEK GF30 Sheet & Plate (30% Glass Filled) | Cut to Size",
    meta_description:
      "30% glass-filled PEEK cut to your dimensions. Higher stiffness and dimensional stability under load. Priced in seconds, certified the same day.",
  },

  PEEK_CF30: {
    hero_line: "Carbon-reinforced PEEK for wear resistance and electrical conductivity.",
    overview:
      "30% carbon fiber gives PEEK higher stiffness than the natural grade along with genuine wear resistance and a measure of electrical conductivity that glass fiber doesn't provide. It's the grade to specify for sliding or rotating wear surfaces.",
    typical_applications: [
      "Bearing and bushing surfaces under continuous wear",
      "Components requiring static-dissipative or conductive properties",
      "Aerospace and semiconductor parts needing high stiffness-to-weight",
      "Pump wear rings and thrust washers",
    ],
    why_this_material:
      "Choose carbon-filled PEEK over glass-filled when the part actually slides or rotates against another surface, or when static dissipation matters. Its self-lubricating tendency is the real differentiator from GF30.",
    handling_notes: [
      "Carbon fiber dust is electrically conductive and can be more aggressive on tooling than glass fiber - dedicated blade handling applies.",
    ],
    faq: [
      {
        question: "Is carbon-filled PEEK conductive?",
        answer:
          "It's static-dissipative to semi-conductive depending on loading and part geometry - enough to matter in electronics handling applications, though it's not a substitute for a metal in a true conductor role.",
      },
      {
        question: "Carbon-filled or glass-filled PEEK for a wear part?",
        answer:
          "Carbon-filled, in almost every case. Its lower coefficient of friction and better wear performance are the reason this grade exists.",
      },
      {
        question: "Does the carbon fiber affect edge finish options?",
        answer: "Similarly to glass fiber - expect a slightly rougher as-cut edge than natural PEEK. Deburring and chamfering are unaffected.",
      },
    ],
    slug: "peek-30-carbon-filled",
    meta_title: "PEEK CF30 Sheet & Plate (30% Carbon Filled) | Cut to Size",
    meta_description:
      "30% carbon-filled PEEK cut to your dimensions. Wear resistance and static-dissipative properties. Priced in seconds, certified the same day.",
  },

  ULTEM_1000: {
    hero_line: "Amber, flame-retardant polyetherimide with inherent strength and clarity.",
    overview:
      "Ultem 1000 is an amber, transparent-in-thin-section polyetherimide known for its combination of strength, heat resistance, and inherent flame retardance without additives. It's a mainstay in aerospace interiors and electrical applications where flammability ratings matter.",
    typical_applications: [
      "Aircraft interior components and ducting",
      "Electrical connector housings and insulators",
      "Medical device components requiring sterilization",
      "Food-service equipment parts",
      "Structural components needing a UL94 V-0 flammability rating",
    ],
    why_this_material:
      "Choose Ultem 1000 when a flammability rating is a real requirement, not just a nice-to-have, or when you need a machinable thermoplastic with better impact resistance than PEEK at a lower material cost.",
    handling_notes: [],
    faq: [
      {
        question: "Why does my Ultem part need special cleaning?",
        answer:
          "Ultem is sensitive to certain solvents, IPA included, which can cause stress cracking. We substitute a DI-water cleanroom process specifically to avoid this - see the handling notice above.",
      },
      {
        question: "Is Ultem 1000 the same as PEI?",
        answer: "Ultem is SABIC's trade name for polyetherimide (PEI); Ultem 1000 is the unfilled base grade.",
      },
      {
        question: "Can Ultem 1000 go into an autoclave?",
        answer:
          "It tolerates elevated temperature well, but check your specific sterilization cycle against the resin's continuous-use temperature - it's lower than PEEK's.",
      },
    ],
    slug: "ultem-1000-pei",
    meta_title: "Ultem 1000 PEI Sheet & Plate | Cut to Size",
    meta_description: "Ultem 1000 polyetherimide cut to your dimensions. Inherent flame retardance, aerospace-grade. Priced in seconds, certified the same day.",
  },

  ULTEM_2300: {
    hero_line: "Glass-reinforced Ultem for higher stiffness in structural applications.",
    overview:
      "Ultem 2300 adds 30% glass fiber to the base PEI resin, raising stiffness and dimensional stability at temperature while retaining the flame-retardant properties of the Ultem family. It's the structural counterpart to Ultem 1000's general-purpose grade.",
    typical_applications: [
      "Structural aerospace brackets and mounts",
      "Electrical housings under mechanical load",
      "Components requiring high stiffness at elevated temperature",
      "Precision fixtures needing dimensional stability",
    ],
    why_this_material:
      "Choose Ultem 2300 over Ultem 1000 when the part needs to resist deflection under load, particularly at temperature - the same tradeoff as PEEK's natural-versus-glass-filled choice.",
    handling_notes: ["Glass fiber content increases blade wear versus Ultem 1000."],
    faq: [
      {
        question: "Does Ultem 2300 have the same solvent sensitivity as Ultem 1000?",
        answer: "Yes - the glass fill doesn't change the base resin's stress-crack sensitivity to solvents like IPA. See the handling notice above.",
      },
      {
        question: "Is Ultem 2300 as clear as Ultem 1000?",
        answer: "No. The glass fiber makes it opaque; Ultem 1000's transparency in thin sections is a property of the unfilled resin only.",
      },
      {
        question: "What's the tradeoff versus PEEK GF30?",
        answer:
          "Ultem 2300 costs less and carries a flame rating PEEK doesn't inherently have; PEEK GF30 tolerates higher continuous service temperature and more aggressive chemical exposure.",
      },
    ],
    slug: "ultem-2300-pei-glass-filled",
    meta_title: "Ultem 2300 PEI Sheet, 30% Glass Filled | Cut to Size",
    meta_description: "30% glass-filled Ultem 2300 cut to your dimensions. Structural stiffness with inherent flame retardance. Priced in seconds, certified same day.",
  },

  DELRIN_150: {
    hero_line: "General-purpose acetal homopolymer for precision mechanical parts.",
    overview:
      "Delrin 150 is DuPont's acetal homopolymer, prized for a low coefficient of friction, good dimensional stability, and easy machinability to tight tolerances at a fraction of PEEK or Ultem's cost. It's the default choice for precision mechanical parts that don't face extreme heat or chemical exposure.",
    typical_applications: [
      "Gears, cams and precision mechanical linkages",
      "Bushings and low-friction bearing surfaces",
      "Consumer and industrial product housings",
      "Conveyor and material-handling components",
      "Fasteners and mechanical fittings",
    ],
    why_this_material:
      "Choose Delrin over PEEK or Ultem whenever the application doesn't demand their heat or chemical resistance - it machines faster, holds tolerance well, and costs meaningfully less.",
    handling_notes: [],
    faq: [
      {
        question: "Does Delrin need to be annealed like PEEK?",
        answer: "No. Acetal homopolymer doesn't carry the same residual stress profile as PEEK, Ultem or PPS, so annealing isn't offered for this material.",
      },
      {
        question: "What's the difference between Delrin 150 and Delrin AF?",
        answer:
          "Delrin AF adds PTFE fiber for a lower coefficient of friction and better wear performance in sliding applications, at some cost to stiffness.",
      },
      {
        question: "Is Delrin food-safe?",
        answer:
          "Certain Delrin grades carry FDA/NSF compliance from the manufacturer; confirm the specific certification you need against the mill's documentation before specifying it for food contact.",
      },
    ],
    slug: "delrin-150-acetal",
    meta_title: "Delrin 150 Acetal Sheet & Plate | Cut to Size",
    meta_description: "Delrin 150 acetal homopolymer cut to your dimensions. Precision mechanical parts, low friction, tight tolerance. Priced in seconds.",
  },

  DELRIN_AF: {
    hero_line: "PTFE-fiber-filled Delrin for the lowest friction in the acetal family.",
    overview:
      "Delrin AF blends PTFE fiber into the acetal base resin, cutting the coefficient of friction well below standard Delrin 150 for sliding and wear applications. The tradeoff is reduced stiffness and higher material cost than the unfilled grade.",
    typical_applications: [
      "Sliding wear surfaces and low-friction bushings",
      "Cam followers and mechanical linkages under continuous motion",
      "Parts requiring reduced stick-slip behavior",
      "Components replacing lubricated metal bearings",
    ],
    why_this_material:
      "Choose Delrin AF over Delrin 150 specifically for sliding or rotating wear surfaces where friction and wear life matter more than raw stiffness.",
    handling_notes: [],
    faq: [
      {
        question: "How much lower is the friction versus standard Delrin?",
        answer:
          "Meaningfully lower - the PTFE fiber is the entire point of this grade. If your part doesn't slide or rotate against another surface, standard Delrin 150 is the more cost-effective choice.",
      },
      {
        question: "Does Delrin AF machine differently than Delrin 150?",
        answer: "It cuts similarly, though the PTFE content can leave a slightly waxier surface finish.",
      },
      {
        question: "Is Delrin AF as strong as Delrin 150?",
        answer: "It's somewhat less stiff due to the PTFE fiber content - a real tradeoff for the friction reduction, not a free upgrade.",
      },
    ],
    slug: "delrin-af-ptfe-filled",
    meta_title: "Delrin AF (PTFE-Filled) Sheet & Plate | Cut to Size",
    meta_description: "Delrin AF acetal, PTFE-fiber filled for low friction, cut to your dimensions. Ideal for sliding wear surfaces. Priced in seconds.",
  },

  PTFE_VIRGIN: {
    hero_line: "The most chemically inert machinable plastic, virgin unfilled grade.",
    overview:
      "Virgin PTFE resists essentially every industrial chemical and holds the widest usable temperature range of any material in this catalog, at the cost of being soft, prone to cold flow under sustained load, and difficult to machine to a fine finish.",
    typical_applications: [
      "Chemical-resistant gaskets and seals",
      "Electrical insulators in high-temperature environments",
      "Non-stick surfaces and liners",
      "Valve seats and packing in aggressive chemical service",
      "Cryogenic and high-temperature seal components",
    ],
    why_this_material:
      "Choose virgin PTFE when chemical resistance or temperature extremes rule out every other material on this list. Do not choose it for a part that needs to hold a tight dimensional tolerance under mechanical load - it will creep.",
    handling_notes: ["Virgin PTFE has poor dimensional stability under sustained load (\"cold flow\"). If your part is load-bearing, consider glass-filled PTFE instead."],
    faq: [
      {
        question: "Why is PTFE not offered in tight tolerances?",
        answer:
          "PTFE's softness and tendency to cold-flow under load make a tight tolerance difficult to hold reliably once the part is in service, independent of how precisely it was cut.",
      },
      {
        question: "Is PTFE the same as Teflon?",
        answer: "Teflon is Chemours' trade name for PTFE; the material itself is the same polymer regardless of brand.",
      },
      {
        question: "What's the benefit of the glass-filled grade over virgin PTFE?",
        answer: "Glass fiber substantially reduces cold flow and improves wear resistance, at some cost to chemical inertness and electrical properties.",
      },
    ],
    slug: "ptfe-virgin",
    meta_title: "Virgin PTFE Sheet & Plate | Cut to Size",
    meta_description: "Virgin PTFE cut to your dimensions. Unmatched chemical resistance and temperature range. Priced in seconds, certified the same day.",
  },

  PTFE_GF25: {
    hero_line: "Glass-reinforced PTFE for reduced cold flow and better wear resistance.",
    overview:
      "Adding 25% glass fiber to PTFE substantially reduces its tendency to cold-flow under sustained load and improves wear resistance, while retaining most of the base resin's chemical inertness and temperature range.",
    typical_applications: [
      "Load-bearing seals and wear rings in chemical service",
      "Valve components requiring dimensional stability under load",
      "Piston rings and rotary seal components",
      "Bearing surfaces in corrosive environments",
    ],
    why_this_material:
      "Choose glass-filled PTFE over the virgin grade whenever the part is under sustained mechanical load - the reduced cold flow is the entire reason this grade exists.",
    handling_notes: [
      "Glass fiber slightly reduces chemical resistance and electrical insulating properties versus virgin PTFE - confirm against your specific chemical exposure if it's critical.",
    ],
    faq: [
      {
        question: "Does glass-filled PTFE still resist the same chemicals as virgin PTFE?",
        answer: "Mostly, but not entirely - the glass fiber itself is not chemically inert. For aggressive acid or base exposure, confirm compatibility for your specific chemistry.",
      },
      {
        question: "Will glass-filled PTFE hold a tighter tolerance than virgin PTFE?",
        answer: "It holds dimension better under load after machining, but PTFE as a family still isn't offered in our tightest tolerance tier.",
      },
      {
        question: "Is glass-filled PTFE electrically insulating?",
        answer: "Less so than virgin PTFE. If electrical insulation is the primary requirement, virgin PTFE is the better choice.",
      },
    ],
    slug: "ptfe-25-glass-filled",
    meta_title: "PTFE GF25 Sheet & Plate (25% Glass Filled) | Cut to Size",
    meta_description: "25% glass-filled PTFE cut to your dimensions. Reduced cold flow, better wear resistance than virgin PTFE. Priced in seconds.",
  },

  PPS_TECHTRON: {
    hero_line: "High-temperature, chemically resistant thermoplastic with excellent dimensional stability.",
    overview:
      "Techtron PPS combines high continuous-use temperature with strong chemical resistance and dimensional stability, making it a common substitute for metal in pump and chemical-processing components that need to hold tight tolerances despite harsh exposure.",
    typical_applications: [
      "Pump housings and impellers in chemical service",
      "Electrical connectors requiring high-temperature stability",
      "Semiconductor processing components",
      "Precision parts needing dimensional stability across a wide temperature range",
    ],
    why_this_material:
      "Choose PPS when a part faces sustained chemical exposure at high temperature and needs to hold tolerance through that exposure - it's a common alternative to PEEK where PEEK's cost isn't justified.",
    handling_notes: [],
    faq: [
      {
        question: "How does PPS compare to PEEK on cost?",
        answer: "PPS generally costs less than PEEK while covering a similar range of chemical and thermal service - it's a common first choice before stepping up to PEEK.",
      },
      {
        question: "Does PPS carry the same residual stress as PEEK?",
        answer: "Yes - see the residual stress note above. Techtron PPS plate can bow after cutting the same way PEEK does.",
      },
      {
        question: "Is Techtron PPS UV stable?",
        answer: "PPS resists UV degradation better than many engineering plastics, but confirm against your specific exposure duration for prolonged outdoor use.",
      },
    ],
    slug: "pps-techtron",
    meta_title: "PPS Techtron Sheet & Plate | Cut to Size",
    meta_description: "Techtron PPS cut to your dimensions. High-temperature, chemically resistant, dimensionally stable. Priced in seconds, certified same day.",
  },

  TORLON_4203: {
    hero_line: "The highest-performance machinable thermoplastic in this catalog, for extreme conditions.",
    overview:
      "Torlon polyamide-imide holds mechanical strength at temperatures and loads that push most other engineering plastics past their limits, at a materially higher cost that reflects both the resin and the difficulty of processing it.",
    typical_applications: [
      "Bearings and bushings in extreme-temperature or high-load service",
      "Aerospace structural components under sustained stress",
      "Downhole and industrial components facing combined heat and load",
      "Precision parts requiring the highest strength-to-weight of any machinable plastic",
    ],
    why_this_material:
      "Reach for Torlon only when PEEK's performance genuinely isn't enough - the cost difference is significant, and most applications that seem to need Torlon are well served by PEEK or PPS at lower cost.",
    handling_notes: [],
    faq: [
      {
        question: "Why is Torlon so much more expensive than PEEK?",
        answer:
          "Torlon's raw resin cost and the difficulty of machining it to spec both run higher than PEEK's - it's genuinely a step up in both performance and price, not a marketing distinction.",
      },
      {
        question: "Does Torlon need post-cure or annealing?",
        answer:
          "Torlon parts are often post-cured by the material manufacturer before shipment for maximum properties; check your specific application against the mill's technical data sheet.",
      },
      {
        question: "What's the biggest reason to choose Torlon over PEEK?",
        answer: "Sustained performance at combined high temperature and high mechanical load, where PEEK's properties begin to degrade meaningfully faster.",
      },
    ],
    slug: "torlon-4203-pai",
    meta_title: "Torlon 4203 PAI Sheet & Plate | Cut to Size",
    meta_description: "Torlon 4203 polyamide-imide cut to your dimensions. Extreme temperature and load performance. Priced in seconds, certified same day.",
  },

  G10_FR4: {
    hero_line: "Glass-epoxy laminate for electrical insulation and mechanical rigidity.",
    overview:
      "G10/FR4 is a woven-glass-fabric epoxy laminate valued for electrical insulation, high mechanical strength, and dimensional stability. It's a composite, not a thermoplastic, and cuts and handles differently from every other material in this catalog.",
    typical_applications: [
      "Electrical insulating boards and standoffs",
      "Fixtures and jigs requiring rigidity and dimensional stability",
      "PCB-adjacent structural components",
      "Cryogenic structural supports (low thermal conductivity)",
    ],
    why_this_material:
      "Choose G10/FR4 when you need genuine electrical insulation combined with mechanical rigidity - it isn't a substitute for any of the thermoplastics in this catalog, it solves a different problem.",
    handling_notes: [
      "Cutting G10/FR4 produces fine glass dust that requires local exhaust and a P100 respirator - this material is batched to one scheduled shop day per week for that reason.",
      "The woven glass fabric has a grain direction; part orientation on the sheet can matter for strength in service. Flag this if your application is orientation-sensitive.",
    ],
    faq: [
      {
        question: "Why is G10 only cut on certain days?",
        answer:
          "Cutting G10/FR4 destroys carbide tooling faster than any other material we stock and produces glass dust requiring dedicated exhaust and PPE. Batching it to one scheduled day a week keeps that setup and blade cost from being spread across every order.",
      },
      {
        question: "Is G10 the same as FR4?",
        answer: "They're the same glass-epoxy laminate family; FR4 specifically denotes a flame-retardant resin system, which is standard for this product today.",
      },
      {
        question: "Does G10/FR4 warp after cutting like PEEK does?",
        answer:
          "No - it's a thermoset composite, not a thermoplastic, and doesn't carry the same residual-stress warping behavior. Its main handling consideration is the abrasive glass fiber, not stress relief.",
      },
    ],
    slug: "g10-fr4-glass-epoxy",
    meta_title: "G10/FR4 Glass Epoxy Sheet | Cut to Size",
    meta_description: "G10/FR4 glass-epoxy laminate cut to your dimensions. Electrical insulation and mechanical rigidity. Priced in seconds, certified same day.",
  },
};

/** Throws rather than rendering a blank page if config.json ever gains a material this file hasn't caught up with. */
export function getMaterialContent(materialCode: string): MaterialContent {
  const content = materialContent[materialCode];
  if (!content) {
    throw new Error(`No lib/materials/content.ts entry for material "${materialCode}" - add one before it can have a page.`);
  }
  return content;
}

export function getMaterialCodeBySlug(slug: string): string | null {
  const entry = Object.entries(materialContent).find(([, c]) => c.slug === slug);
  return entry ? entry[0] : null;
}
