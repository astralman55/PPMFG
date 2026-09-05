import type { ReactNode } from "react";
import Link from "next/link";
import cfgJson from "@/lib/pricing/config.json";
import type { PricingConfig } from "@/lib/pricing/engine";
import { sheetVsBlankComparison } from "@/lib/materials/sheet-economics";
import { materialContent } from "@/lib/materials/content";
import { materialSwatch } from "./swatches";

const CFG = cfgJson as unknown as PricingConfig;

function money0(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function Heading({ children }: { children: string }) {
  return <h2 className="text-2xl font-medium tracking-tight sm:text-3xl">{children}</h2>;
}

function Section({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`mx-auto max-w-5xl border-t border-rule px-4 py-14 ${className}`}>{children}</section>;
}

/** §11 section 3: "a real worked comparison and visible arithmetic." Computed from config.json, not hand-typed. */
export function ThreeCosts() {
  const c = sheetVsBlankComparison(CFG, "PEEK_NAT", 0.5, 12, 12);

  return (
    <Section>
      <Heading>The three costs of a full sheet</Heading>
      <div className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-3">
        <div>
          <p className="font-medium">The minimum order</p>
          <p className="mt-2 text-sm text-graphite">
            A {c.sheetLengthIn} x {c.sheetWidthIn} in PEEK sheet at {c.thicknessIn} in runs {c.sheetWeightLb.toFixed(1)} lb of raw
            material - about {money0(c.sheetRawCost)} before any cutting. A single 12 x 12 in blank needs{" "}
            {money0(c.blankRawCost)} of it. The other {money0(c.shelfRemainderCost)} sits on a shelf.
          </p>
        </div>
        <div>
          <p className="font-medium">Squaring hours</p>
          <p className="mt-2 text-sm text-graphite">
            A sheet arrives with four rough edges. Every one needs to be squared on your own saw before a part comes off it -
            setup, blade wear and floor time you pay for on every job, not just this one.
          </p>
        </div>
        <div>
          <p className="font-medium">The paperwork delay</p>
          <p className="mt-2 text-sm text-graphite">
            A commodity blank usually means a quote request, a wait for a person to price it, then freight arranged - days
            before a saw ever touches the sheet.
          </p>
        </div>
      </div>
    </Section>
  );
}

export function WhatYouGet() {
  return (
    <Section>
      <Heading>What you get</Heading>
      <ul className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <li>
          <p className="font-medium">Four edges saw-cut and deburred</p>
          <p className="mt-1 text-sm text-graphite">Included on every order. Chamfered or scraped-clean edges are available as options.</p>
        </li>
        <li>
          <p className="font-medium text-amber">Thickness is as-supplied, not machined</p>
          <p className="mt-1 text-sm text-graphite">
            A saw cuts length and width, not thickness. PEEK sold as 0.500 in typically ships 0.520-0.570 in. This is normal
            mill tolerance, stated on every quote line, the invoice and the Certificate of Conformance.
          </p>
        </li>
        <li>
          <p className="font-medium">Tolerance and squareness by tier</p>
          <ul className="mt-1 text-sm text-graphite">
            {Object.values(CFG.tolerance_tiers).map((t) => (
              <li key={t.label}>
                {t.label} - squareness {t.squareness_in_per_12in.toFixed(3)} in per 12 in, up to {t.max_dim_in} in span
              </li>
            ))}
          </ul>
        </li>
        <li>
          <p className="font-medium">Tolerance is span-limited</p>
          <p className="mt-1 text-sm text-graphite">
            Tighter tolerances only hold over a shorter span - that&apos;s physics, not a policy. The quote tool enforces it
            and tells you the largest part each tier can hold.
          </p>
        </li>
      </ul>
    </Section>
  );
}

/**
 * §17.6: a quiet entry point into the full /materials library, not a second
 * full grid competing with the one now living there. Featured materials
 * chosen for likely conversion, not alphabetically or by family.
 */
const FEATURED_MATERIALS = ["PEEK_NAT", "ULTEM_1000", "DELRIN_150", "G10_FR4"];

export function MaterialsPreview() {
  return (
    <Section>
      <div className="flex items-baseline justify-between">
        <Heading>Materials we stock</Heading>
        <Link href="/materials" className="text-sm text-amber hover:underline">
          See all materials and specs
        </Link>
      </div>
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURED_MATERIALS.map((code) => {
          const m = CFG.materials[code];
          const content = materialContent[code];
          return (
            <Link key={code} href={`/materials/${content.slug}`} className="flex flex-col gap-2 border border-rule p-4 hover:border-ink">
              <div className="h-10 w-10 border border-rule" style={{ background: materialSwatch(code) }} aria-hidden />
              <p className="font-medium">{m.label}</p>
              <p className="text-xs text-graphite">{content.hero_line}</p>
            </Link>
          );
        })}
      </div>
    </Section>
  );
}

export function TwoWaysToBuy() {
  return (
    <Section>
      <Heading>Two ways to buy</Heading>
      <div className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-2">
        {Object.values(CFG.certification_tiers).map((t) => (
          <div key={t.label} className="border border-rule p-5">
            <p className="font-medium">{t.label}</p>
            <p className="mt-2 text-sm text-graphite">{t.description}</p>
          </div>
        ))}
      </div>
      <p className="mt-6 text-sm text-graphite">
        Industrial grade is not for approved-vendor-list or flight hardware programs. If your program requires traceability,
        choose Tier 1.
      </p>
    </Section>
  );
}

function RedactedField({ label, width }: { label: string; width: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <span className="text-[11px] uppercase tracking-wide text-graphite">{label}</span>
      <span className="h-3 rounded-sm bg-rule" style={{ width }} />
    </div>
  );
}

export function Certification() {
  return (
    <Section>
      <Heading>Certification</Heading>
      <div className="mt-8 grid grid-cols-1 gap-10 sm:grid-cols-2">
        <div className="text-sm text-graphite">
          <p>
            <strong className="text-ink">The order confirmation</strong> arrives instantly: order number, promised ship date,
            a commercial invoice with full line detail, and a notice of exactly which documents are coming.
          </p>
          <p className="mt-4">
            <strong className="text-ink">The Certification Packet</strong> arrives the same business day the order is cut:
            our Certificate of Conformance naming the real lot cut, measured actual thickness and process, merged with the
            mill&apos;s Material Test Report for that lot.
          </p>
        </div>
        <div className="relative border border-rule bg-paper p-5">
          <span className="absolute right-3 top-3 rotate-6 border border-graphite px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-graphite">
            Sample
          </span>
          <p className="text-xs font-medium uppercase tracking-wide text-graphite">Certificate of Conformance</p>
          <div className="mt-3 flex flex-col gap-1">
            <RedactedField label="Cert number" width="40%" />
            <RedactedField label="Order number" width="35%" />
            <RedactedField label="Material / lot" width="55%" />
            <RedactedField label="Actual thickness" width="20%" />
            <RedactedField label="Tolerance held" width="30%" />
            <RedactedField label="Country of origin" width="25%" />
          </div>
        </div>
      </div>
    </Section>
  );
}

export function WhyNoDrawings() {
  return (
    <Section>
      <Heading>Why we don&apos;t take your drawings</Heading>
      <p className="mt-4 max-w-2xl text-sm text-graphite">
        Dimensions alone are not controlled technical data. A drawing of a defense component can be. We only ever ask for
        length, width, thickness and quantity - never a file. Upload a drawing by mistake and we reject it before it touches
        our servers: keeping technical data off our servers keeps your program off our servers.
      </p>
    </Section>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <div className="border-t border-rule py-5">
      <p className="font-medium">{q}</p>
      <p className="mt-2 text-sm text-graphite">{a}</p>
    </div>
  );
}

export function Faq() {
  const tight = CFG.tolerance_tiers.TIGHT;
  const precision = CFG.tolerance_tiers.PRECISION;
  return (
    <Section>
      <Heading>Questions</Heading>
      <div className="mt-4">
        <FaqItem
          q="Why did my blank arrive slightly bowed?"
          a="PEEK, Ultem and PPS plate carry internal stress from how the sheet was extruded. Cutting a piece free lets that stress release, and a 12x12 blank can bow 0.010-0.025 in within 48 hours. It's normal, not a defect - stress-relief annealing before shipment reduces it."
        />
        <FaqItem
          q="What does annealing do?"
          a={CFG.annealing.description ?? "A controlled heat cycle that relieves internal stress before you machine the blank."}
        />
        <FaqItem
          q="I have a resale certificate - can I skip tax?"
          a="Upload your CDTFA-230 with your account and we'll review it. We charge tax by default and never retroactively exempt a completed order, so get it approved before you check out if it applies to you."
        />
        <FaqItem
          q="How tight a tolerance can you hold?"
          a={`Tighter tolerances only hold over a shorter span: +/-${tight.tolerance_in.toFixed(3)} in up to ${tight.max_dim_in} in, +/-${precision.tolerance_in.toFixed(3)} in up to ${precision.max_dim_in} in. The quote tool enforces this and tells you the limit for your size.`}
        />
        <FaqItem
          q="What happens if a cut is out of spec?"
          a="We recut or refund - that risk is already priced into precision and tight-tolerance orders, not absorbed as a surprise later."
        />
      </div>
    </Section>
  );
}
