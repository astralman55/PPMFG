import type { Metadata } from "next";
import Link from "next/link";
import { articles } from "@/lib/articles/content";
import { Footer } from "../_marketing/Footer";
import { Logo } from "../_marketing/Logo";

export const metadata: Metadata = {
  title: "Learn | Polly Plastics",
  description: "Plain-language guides on residual stress, tolerance limits, solvent sensitivity and the real economics of buying cut plastic.",
};

export default function LearnIndexPage() {
  return (
    <>
    <main className="mx-auto max-w-3xl px-4 py-14 text-ink">
      <Logo className="h-10" priority />
      <h1 className="mt-4 text-2xl font-medium tracking-tight sm:text-3xl">Learn</h1>
      <p className="mt-2 text-graphite">Straight answers to the questions that come up before an order, not after.</p>

      <div className="mt-8">
        {articles.map((a) => (
          <Link key={a.slug} href={`/learn/${a.slug}`} className="block border-t border-rule py-5 hover:bg-rule/20">
            <p className="font-medium">{a.title}</p>
            <p className="mt-1 text-sm text-graphite">{a.dek}</p>
          </Link>
        ))}
      </div>
    </main>
    <Footer />
    </>
  );
}
