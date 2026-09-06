import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import cfgJson from "@/lib/pricing/config.json";
import type { PricingConfig } from "@/lib/pricing/engine";
import { materialContent, getMaterialContent, getMaterialCodeBySlug } from "@/lib/materials/content";
import { materialSwatch } from "@/app/_marketing/swatches";
import { Footer } from "@/app/_marketing/Footer";
import { MaterialCard } from "../MaterialCard";

const CFG = cfgJson as unknown as PricingConfig;

export function generateStaticParams() {
  return Object.values(materialContent).map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const code = getMaterialCodeBySlug(slug);
  if (!code) return {};
  const content = getMaterialContent(code);
  return { title: content.meta_title, description: content.meta_description };
}

export default async function MaterialDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const code = getMaterialCodeBySlug(slug);
  if (!code) notFound();

  const mat = CFG.materials[code];
  const content = getMaterialContent(code);
  const namedBrands = Object.entries(mat.brands).filter(([b]) => b !== "GENERIC");

  const related = Object.keys(materialContent)
    .filter((c) => c !== code && CFG.materials[c].family === mat.family)
    .slice(0, 3);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: mat.label,
    description: content.overview,
    material: mat.family,
    additionalProperty: [
      { "@type": "PropertyValue", name: "Density", value: `${mat.density_lb_in3} lb/in3` },
      { "@type": "PropertyValue", name: "Stock thicknesses (in)", value: mat.stock_thicknesses_in.join(", ") },
      { "@type": "PropertyValue", name: "Brands available", value: namedBrands.map(([, b]) => b.label).join(", ") || "Any approved source" },
    ],
  };

  return (
    <>
    <main className="mx-auto max-w-3xl px-4 py-14 text-ink">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <p className="text-sm">
        <Link href="/materials" className="text-graphite hover:underline">
          Materials
        </Link>
      </p>

      <div className="mt-4 flex items-start gap-5">
        <div className="h-20 w-20 shrink-0 border border-rule" style={{ background: materialSwatch(code) }} aria-hidden />
        <div>
          <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">{mat.label}</h1>
          <p className="text-sm text-graphite">{mat.family}</p>
          <p className="mt-2 text-graphite">{content.hero_line}</p>
        </div>
      </div>

      <p className="mt-8 max-w-2xl">{content.overview}</p>

      <h2 className="mt-10 text-sm font-medium uppercase tracking-wide text-graphite">Specs</h2>
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-graphite">Density</dt>
          <dd className="font-mono tabular-nums">{mat.density_lb_in3} lb/in³</dd>
        </div>
        <div>
          <dt className="text-graphite">Stock thicknesses</dt>
          <dd className="font-mono tabular-nums">{mat.stock_thicknesses_in.join(", ")} in</dd>
        </div>
        <div>
          <dt className="text-graphite">Sheet size</dt>
          <dd className="font-mono tabular-nums">
            {mat.sheet_length_in} x {mat.sheet_width_in} in
          </dd>
        </div>
        <div className="col-span-2 sm:col-span-3">
          <dt className="text-graphite">Brands available</dt>
          <dd>{namedBrands.length > 0 ? namedBrands.map(([, b]) => b.label).join(", ") : "Any approved source"}</dd>
        </div>
      </dl>
      <p className="mt-3 text-sm text-graphite">
        Price depends on size, quantity, tolerance and finish - get an exact number for this material in seconds.
      </p>

      {mat.residual_stress_flag || mat.solvent_stress_crack_sensitive || mat.grain_sensitive ? (
        <div className="mt-8 border border-rule bg-paper p-4">
          <p className="text-sm font-medium">Handling notice</p>
          <ul className="mt-2 flex flex-col gap-2 text-sm text-graphite">
            {mat.residual_stress_flag ? (
              <li>
                {mat.label} carries residual stress from how the plate was made. Cutting it free lets that stress release, and a
                12x12 blank can bow 0.010-0.025 in within 48 hours. Stress-relief annealing is available at quote time.
              </li>
            ) : null}
            {mat.solvent_stress_crack_sensitive ? (
              <li>{mat.label} is stress-crack sensitive; our cleanroom process uses DI water, not IPA.</li>
            ) : null}
            {mat.grain_sensitive ? <li>{mat.label} has a grain direction from its woven reinforcement; part orientation on the sheet can matter for strength in service.</li> : null}
          </ul>
        </div>
      ) : null}

      <h2 className="mt-10 text-sm font-medium uppercase tracking-wide text-graphite">Why this material</h2>
      <p className="mt-2">{content.why_this_material}</p>

      <h2 className="mt-10 text-sm font-medium uppercase tracking-wide text-graphite">Typical applications</h2>
      <ul className="mt-2 list-disc pl-5 text-sm">
        {content.typical_applications.map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ul>

      {content.handling_notes.length > 0 ? (
        <>
          <h2 className="mt-10 text-sm font-medium uppercase tracking-wide text-graphite">Handling notes</h2>
          <ul className="mt-2 list-disc pl-5 text-sm text-graphite">
            {content.handling_notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </>
      ) : null}

      <Link
        href={`/quote?material=${code}`}
        className="mt-10 inline-block rounded bg-ink px-5 py-2.5 text-sm font-medium text-paper hover:opacity-90"
      >
        See a price for {mat.label}
      </Link>

      <h2 className="mt-12 text-sm font-medium uppercase tracking-wide text-graphite">Questions</h2>
      <div className="mt-2">
        {content.faq.map((f) => (
          <details key={f.question} className="border-t border-rule py-3">
            <summary className="cursor-pointer font-medium">{f.question}</summary>
            <p className="mt-2 text-sm text-graphite">{f.answer}</p>
          </details>
        ))}
      </div>

      {related.length > 0 ? (
        <>
          <h2 className="mt-12 text-sm font-medium uppercase tracking-wide text-graphite">Related materials</h2>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {related.map((c) => (
              <MaterialCard key={c} code={c} />
            ))}
          </div>
        </>
      ) : null}
    </main>
    <Footer />
    </>
  );
}
