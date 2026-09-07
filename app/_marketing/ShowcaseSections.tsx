import Image from "next/image";
import cfgJson from "@/lib/pricing/config.json";
import type { PricingConfig } from "@/lib/pricing/engine";
import { ExpandablePhotoCard } from "./ExpandablePhotoCard";

const CFG = cfgJson as unknown as PricingConfig;

function Eyebrow({ children }: { children: string }) {
  return <p className="text-xs font-medium uppercase tracking-wide text-amber">{children}</p>;
}

/** CLAUDE_CODE_BRIEF.md §11 - the order flow itself, laid out once instead
 * of only implied by the quote tool. */
export function HowItWorks() {
  const steps = [
    {
      n: "01",
      title: "Enter dimensions",
      body: "Material, length, width, thickness, quantity. No drawing, no file upload, no waiting on a person to price it.",
    },
    {
      n: "02",
      title: "See a firm price",
      body: "Same-day to ten-day lead times, priced side by side, updating live as you type.",
    },
    {
      n: "03",
      title: "Cut, certified, shipped",
      body: "Order confirmation instantly. Certificate of Conformance and Material Test Report the same day it's cut.",
    },
  ];
  return (
    <section className="mx-auto max-w-5xl border-t border-rule px-4 py-14">
      <Eyebrow>How it works</Eyebrow>
      <h2 className="mt-1 text-2xl font-medium tracking-tight sm:text-3xl">How an order moves</h2>
      <div className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-3">
        {steps.map((s) => (
          <div key={s.n}>
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-amber font-mono text-sm text-amber">
              {s.n}
            </div>
            <p className="mt-4 font-medium">{s.title}</p>
            <p className="mt-1.5 text-sm text-graphite">{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Two real capabilities the sheet-utilisation stat and the dimensions-only
 * policy already claim elsewhere on this page - shown here, not just stated. */
export function CuttingShowcase() {
  return (
    <section className="mx-auto max-w-5xl border-t border-rule px-4 py-14">
      <Eyebrow>In the shop</Eyebrow>
      <h2 className="mt-1 text-2xl font-medium tracking-tight sm:text-3xl">Cut to spec, checked before it ships</h2>
      <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2">
        <ExpandablePhotoCard
          src="/photos/saw-blade.jpg"
          alt="A saw blade cutting through a sheet on a table saw"
          title="Cut to your exact dimensions"
          detail="Length, width, and thickness only - no drawings, no CAD files. Every quote is priced against your exact spec, not the nearest stock sheet size."
        />
        <ExpandablePhotoCard
          src="/photos/precision-inspection.jpg"
          alt="Hands inspecting a precision-machined component"
          title="Verified before it ships"
          detail="Every cut is checked against the tolerance tier you selected before it's packed - squareness and dimensions measured, not assumed."
        />
      </div>
    </section>
  );
}

/** Real config numbers, not prose describing them - CLAUDE_CODE_BRIEF.md's
 * own "numbers and data focused" brief. */
export function ToleranceShowcase() {
  const tiers = Object.values(CFG.tolerance_tiers);
  return (
    <section className="mx-auto max-w-5xl border-t border-rule px-4 py-14">
      <div className="grid grid-cols-1 overflow-hidden rounded-lg border border-rule sm:grid-cols-2">
        <div className="relative h-64 sm:h-auto sm:min-h-[340px]">
          <Image
            src="/photos/cnc-cutting.jpg"
            alt="A precision cutting tool machining to a tight tolerance"
            fill
            sizes="(min-width: 640px) 50vw, 100vw"
            className="object-cover"
          />
        </div>
        <div className="flex flex-col justify-center p-8">
          <Eyebrow>Measured, not guessed</Eyebrow>
          <h2 className="mt-1 text-xl font-medium tracking-tight sm:text-2xl">Tolerance is span-limited</h2>
          <p className="mt-3 text-sm text-graphite">
            A tighter tolerance only holds over a shorter span - that&apos;s physics, not a policy. The quote tool
            enforces this and tells you the largest part each tier can hold.
          </p>
          <dl className="mt-5 flex flex-col gap-2 font-mono text-sm tabular-nums">
            {tiers.map((t) => (
              <div key={t.label} className="flex items-baseline justify-between border-t border-rule pt-2">
                <dt className="text-graphite">{t.label}</dt>
                <dd>
                  {t.squareness_in_per_12in.toFixed(3)} in/ft, up to {t.max_dim_in} in
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
