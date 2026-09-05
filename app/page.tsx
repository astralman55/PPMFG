import { Header } from "./_marketing/Header";
import { Hero } from "./_marketing/Hero";
import { TrustStrip } from "./_marketing/TrustStrip";
import { ShopByMaterial } from "./_marketing/ShopByMaterial";
import { ThreeCosts } from "./_marketing/Sections";
import { Manifesto } from "./_marketing/Manifesto";
import { FinalCta } from "./_marketing/FinalCta";
import { Footer } from "./_marketing/Footer";

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

      {/* Trust strip - dormant until real certifications or named customers exist. */}
      <TrustStrip />
      {/* Shop by material - the complete list, no tabbed toggle. */}
      <ShopByMaterial />
      {/* Replaces the Nox-style nesting/yield dashboard: the MOQ-trap
          arithmetic is this business's own differentiator, not a copy of
          Nox's nesting explainer. */}
      <ThreeCosts />
      <Manifesto />
      {/* Guides are reachable from the menu, not the homepage. */}
      <FinalCta />
      <Footer />
    </main>
  );
}
