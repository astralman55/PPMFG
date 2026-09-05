import { Header } from "./_marketing/Header";
import { Hero } from "./_marketing/Hero";
import { TrustStrip } from "./_marketing/TrustStrip";
import { ShopByMaterial } from "./_marketing/ShopByMaterial";
import { NestingExplainer } from "./_marketing/NestingExplainer";
import { Manifesto } from "./_marketing/Manifesto";
import { GuidesStrip } from "./_marketing/GuidesStrip";
import { FinalCta } from "./_marketing/FinalCta";
import { Footer } from "./_marketing/Footer";

export default function LandingPage() {
  return (
    <main className="bg-paper text-ink">
      <Header />
      {/* 1. Hero - kept exactly as Phase 8 built it: the live quote tool
          with the dimensioned blank is the pitch, not a video. */}
      <Hero />

      {/* CLAUDE_CODE_BRIEF.md §12: "Thickness is not machined... Say so on
          the landing page." This is the one disclosure that section is
          explicit must appear here specifically, so it survives the
          Phase 10 restructure even though it isn't one of Nox's 8 sections. */}
      <p className="mx-auto max-w-5xl px-4 text-xs text-graphite">
        Thickness ships as-supplied by the mill, not machined - stated on every quote line, the invoice and the Certificate of
        Conformance.
      </p>

      {/* 2. Trust strip - dormant until real certifications or named customers exist. */}
      <TrustStrip />
      {/* 3. Shop by material */}
      <ShopByMaterial />
      {/* 4. Nesting explainer */}
      <NestingExplainer />
      {/* 5. Manifesto */}
      <Manifesto />
      {/* 6. Featured guides */}
      <GuidesStrip />
      {/* 7. Final CTA band */}
      <FinalCta />
      {/* 8. Footer */}
      <Footer />
    </main>
  );
}
