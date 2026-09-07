import { Header } from "./_marketing/Header";
import { Hero } from "./_marketing/Hero";
import { Stats } from "./_marketing/Stats";
import { TrustStrip } from "./_marketing/TrustStrip";
import { ShopByMaterial } from "./_marketing/ShopByMaterial";
import { ThreeCosts, WhatYouGet, TwoWaysToBuy, Certification, WhyNoDrawings, Faq } from "./_marketing/Sections";
import { HowItWorks, CuttingShowcase, ToleranceShowcase } from "./_marketing/ShowcaseSections";
import { Manifesto } from "./_marketing/Manifesto";
import { FinalCta } from "./_marketing/FinalCta";
import { Footer } from "./_marketing/Footer";

// Stats reads live order/customer counts on every request - never freeze
// the homepage's real numbers at build time.
export const dynamic = "force-dynamic";

export default function LandingPage() {
  return (
    <main className="bg-paper text-ink">
      <Header />
      {/* Hero - kept exactly as Phase 8 built it: the live quote tool with
          the dimensioned blank is the pitch, not a video. */}
      <Hero />

      {/* CLAUDE_CODE_BRIEF.md §12: "Thickness is not machined... Say so on
          the landing page." Kept as a one-line note even though it isn't
          one of the homepage's named sections. */}
      <p className="mx-auto max-w-5xl px-4 text-xs text-graphite">
        Thickness ships as-supplied by the mill, not machined - stated on every quote line, the invoice and the Certificate of
        Conformance.
      </p>

      {/* Real, live counts plus real capability facts - never claimed case-study
          numbers. See Stats.tsx for exactly what each figure is and isn't. */}
      <Stats />
      {/* Design-direction review, pattern 4: the order flow laid out once as
          numbered steps instead of only implied by the quote tool above. */}
      <HowItWorks />

      {/* Trust strip - dormant until real certifications or named customers exist. */}
      <TrustStrip />
      {/* Shop by material - the complete list, no tabbed toggle. */}
      <ShopByMaterial />
      {/* Replaces the Nox-style nesting/yield dashboard: the MOQ-trap
          arithmetic is this business's own differentiator, not a copy of
          Nox's nesting explainer. */}
      <ThreeCosts />
      <WhatYouGet />
      {/* Design-direction review, patterns 2 and 3: the click-to-expand photo
          caption and the split image/text card, built with real stock
          photography and real config data - see ShowcaseSections.tsx. */}
      <CuttingShowcase />
      <ToleranceShowcase />
      {/* "Who we serve," honestly: real certification-tier requirements, not
          fabricated client segments or case studies this one-order shop
          hasn't earned yet. */}
      <TwoWaysToBuy />
      {/* The real deliverable in place of a case study - an actual sample of
          the document a customer receives, marked SAMPLE. */}
      <Certification />
      <WhyNoDrawings />
      <Manifesto />
      <Faq />
      {/* Guides are reachable from the menu, not the homepage. */}
      <FinalCta />
      <Footer />
    </main>
  );
}
