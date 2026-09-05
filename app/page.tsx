import { Header } from "./_marketing/Header";
import { Hero } from "./_marketing/Hero";
import { ThreeCosts, WhatYouGet, Materials, TwoWaysToBuy, Certification, WhyNoDrawings, Faq } from "./_marketing/Sections";
import { Footer } from "./_marketing/Footer";

export default function LandingPage() {
  return (
    <main className="bg-paper text-ink">
      <Header />
      <Hero />
      <ThreeCosts />
      <WhatYouGet />
      <Materials />
      <TwoWaysToBuy />
      <Certification />
      <WhyNoDrawings />
      <Faq />
      <Footer />
    </main>
  );
}
