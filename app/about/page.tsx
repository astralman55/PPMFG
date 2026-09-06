import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/lib/brand";
import { Footer } from "../_marketing/Footer";

export const metadata: Metadata = {
  title: "About | Polly Plastics",
  description: "Engineering plastics cut to size in El Cajon, CA - priced in seconds, certified the same day.",
};

export default function AboutPage() {
  return (
    <>
    <main className="mx-auto max-w-2xl px-4 py-14 text-ink">
      <p className="text-sm">
        <Link href="/" className="text-graphite hover:underline">
          {brand.companyName}
        </Link>
      </p>
      <h1 className="mt-4 text-2xl font-medium tracking-tight sm:text-3xl">About</h1>
      <p className="mt-4 text-graphite">
        {brand.companyName} cuts engineering plastics - PEEK, Ultem, Delrin, PTFE, PPS, Torlon and G10/FR4 - to size, based in{" "}
        {brand.address.city}, {brand.address.state}.
      </p>
      <p className="mt-4 text-graphite">
        Most distributors sell by the sheet and quote by hand. This site does neither: a firm price in seconds for exactly
        the blank a job needs, and certification paperwork - the mill&apos;s Material Test Report and our own Certificate of
        Conformance naming the real lot cut - the same business day the order is cut.
      </p>

      <h2 className="mt-10 text-sm font-medium uppercase tracking-wide text-graphite">News</h2>
      <p className="mt-2 text-sm text-graphite">Nothing to report yet - check back as the shop grows.</p>
    </main>
    <Footer />
    </>
  );
}
