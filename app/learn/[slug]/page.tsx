import type { Metadata } from "next";
import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import cfgJson from "@/lib/pricing/config.json";
import type { PricingConfig } from "@/lib/pricing/engine";
import { articles, getArticleBySlug } from "@/lib/articles/content";
import { getMaterialContent } from "@/lib/materials/content";
import { sheetVsBlankComparison } from "@/lib/materials/sheet-economics";
import { Footer } from "@/app/_marketing/Footer";

const CFG = cfgJson as unknown as PricingConfig;

export function generateStaticParams() {
  return articles.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticleBySlug(slug);
  if (!article) return {};
  return { title: article.meta_title, description: article.meta_description };
}

function money0(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

/** The one article whose economics are computed live rather than told - see the paragraph right above this box. */
function MoqComparisonBox() {
  const c = sheetVsBlankComparison(CFG, "PEEK_NAT", 0.5, 12, 12);
  return (
    <div className="my-6 border border-rule p-4 text-sm">
      <p className="font-medium">Full sheet vs. one blank, computed right now</p>
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
        <div>
          <dt className="text-graphite">
            Full sheet ({c.sheetLengthIn} x {c.sheetWidthIn} x {c.thicknessIn} in)
          </dt>
          <dd className="font-mono tabular-nums">
            {c.sheetWeightLb.toFixed(1)} lb, {money0(c.sheetRawCost)}
          </dd>
        </div>
        <div>
          <dt className="text-graphite">One 12 x 12 in blank</dt>
          <dd className="font-mono tabular-nums">{money0(c.blankRawCost)}</dd>
        </div>
        <div>
          <dt className="text-graphite">Left on the shelf</dt>
          <dd className="font-mono tabular-nums">{money0(c.shelfRemainderCost)}</dd>
        </div>
      </dl>
    </div>
  );
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = getArticleBySlug(slug);
  if (!article) notFound();

  return (
    <>
    <main className="mx-auto max-w-2xl px-4 py-14 text-ink">
      <p className="text-sm">
        <Link href="/learn" className="text-graphite hover:underline">
          Learn
        </Link>
      </p>
      <h1 className="mt-4 text-2xl font-medium tracking-tight sm:text-3xl">{article.title}</h1>
      <p className="mt-2 text-graphite">{article.dek}</p>

      <div className="mt-8 flex flex-col gap-4 text-sm leading-relaxed">
        {article.body.map((paragraph, i) => (
          <Fragment key={i}>
            <p>{paragraph}</p>
            {slug === "buying-a-small-peek-blank-without-buying-a-whole-sheet" && i === 1 ? <MoqComparisonBox /> : null}
          </Fragment>
        ))}
      </div>

      {article.relatedMaterialCodes.length > 0 ? (
        <>
          <h2 className="mt-10 text-sm font-medium uppercase tracking-wide text-graphite">Related materials</h2>
          <ul className="mt-2 flex flex-wrap gap-3 text-sm">
            {article.relatedMaterialCodes.map((code) => (
              <li key={code}>
                <Link href={`/materials/${getMaterialContent(code).slug}`} className="text-amber hover:underline">
                  {CFG.materials[code].label}
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <Link href="/quote" className="mt-8 inline-block rounded bg-ink px-5 py-2.5 text-sm font-medium text-paper hover:opacity-90">
        Get price
      </Link>
    </main>
    <Footer />
    </>
  );
}
