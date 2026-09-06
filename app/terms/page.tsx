import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/lib/brand";
import { Footer } from "../_marketing/Footer";
import { Logo } from "../_marketing/Logo";

export const metadata: Metadata = {
  title: "Terms of Sale | Precision Plastics Manufacturing",
  description: "The terms that apply to every order placed with Precision Plastics Manufacturing.",
};

const LAST_UPDATED = "September 6, 2026";

function isSet(value: string): boolean {
  return value.length > 0 && !value.startsWith("REPLACE_WITH_");
}

export default function TermsPage() {
  return (
    <>
    <main className="mx-auto max-w-2xl px-4 py-14 text-ink">
      <Logo className="h-10" priority />
      <h1 className="mt-4 text-2xl font-medium tracking-tight sm:text-3xl">Terms of Sale</h1>
      <p className="mt-2 text-sm text-graphite">Last updated {LAST_UPDATED}.</p>

      <div className="mt-8 flex flex-col gap-8 text-sm leading-relaxed text-graphite [&_h2]:text-base [&_h2]:font-medium [&_h2]:text-ink [&_p]:mt-2 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mt-1">
        <section>
          <p>
            These are the terms that apply when you place an order with {brand.companyName} ({brand.address.city},{" "}
            {brand.address.state}) through this website. Placing an order means you agree to them. If anything here
            doesn&apos;t match what you were told directly by us in writing for a specific order, the written
            agreement for that order controls.
          </p>
        </section>

        <section>
          <h2>1. Quotes and pricing</h2>
          <p>
            Every price on this site is generated automatically from the dimensions, material, quantity, and options
            you select - there is no manual quoting step. A quote is a firm price for exactly what you specified, and
            it is good for 7 days from when it&apos;s generated. After that, the price may have changed and you&apos;ll
            need a fresh quote. Placing an order locks in the price shown at that time; changing the specification
            after ordering (material, size, quantity, finish, certification tier) requires a new quote and a new
            order.
          </p>
        </section>

        <section>
          <h2>2. Dimensions only - we do not accept drawings or files</h2>
          <p>
            Orders are placed by entering dimensions, material, and finish options directly - never by uploading a
            drawing, CAD file, or 3D model. This is deliberate, not a missing feature: it keeps your part design and
            any technical data about it entirely off our systems. If you send us a drawing anyway (for example, as an
            email attachment), we do not open or use it to fulfill your order; we&apos;ll ask you to convert it to a
            dimension list instead.
          </p>
        </section>

        <section>
          <h2>3. Payment</h2>
          <p>
            Payment is collected online at checkout through Stripe, our payment processor. We do not see or store
            your full card number - Stripe handles that. Applicable sales tax is calculated automatically based on
            your shipping address. An order is not scheduled for cutting until payment has been successfully
            collected.
          </p>
        </section>

        <section>
          <h2>4. What you&apos;re buying</h2>
          <p>
            Every part is cut from stock plastic sheet or rod to the length, width, and thickness you specify.
            Thickness ships as-supplied by the mill, not machined to a nominal value - the actual thickness of your
            material is stated on your Certificate of Conformance. Cut dimensions and squareness are held to the
            tolerance tier you select at quote time; a tighter tolerance than what you selected is not guaranteed.
            Some materials carry internal residual stress from manufacturing and can bow slightly in the day or two
            after cutting as that stress releases - when this applies to your material, it&apos;s disclosed on the
            quote page before you order, along with the option to have it stress-relief annealed.
          </p>
        </section>

        <section>
          <h2>5. Lead times</h2>
          <p>
            The ship date shown at checkout is a promise, not an estimate, based on our published business-day
            calendar and the lead tier you chose. It assumes normal operating conditions; events outside our
            reasonable control (severe weather, a supplier or freight carrier disruption, a fire or similar casualty)
            may push it back, and we&apos;ll contact you if that happens. Same-day and next-business-day service
            depend on the shop being open on the day you order - see the quote page for whether a given tier is
            available right now.
          </p>
        </section>

        <section>
          <h2>6. Certification</h2>
          <p>
            Orders placed at the Tier 1 certification level ship with a Certificate of Conformance naming the actual
            material lot cut, plus that lot&apos;s Material Test Report from the mill. Orders placed at the standard
            (industrial) tier do not include full mill traceability - if your job needs traceability, select Tier 1
            before ordering.
          </p>
        </section>

        <section>
          <h2>7. Cancellations, defects, and returns</h2>
          <p>
            Because every part is custom-cut to your specification, our cancellation and return policy has its own
            page: <Link href="/returns" className="text-amber underline">Returns &amp; Refunds</Link>. It
            covers what counts as our error, what doesn&apos;t, and how to report a problem.
          </p>
        </section>

        <section>
          <h2>8. Limitation of liability</h2>
          <p>
            If something we shipped is defective or doesn&apos;t match what you ordered, our responsibility is
            limited to repairing it, replacing it, or refunding what you paid for it - whichever we choose. Our total
            liability for any order will never exceed the amount you paid for that order. We are not liable for
            indirect, incidental, special, or consequential damages arising from an order - including lost profits,
            lost production time, or the cost of sourcing a replacement part elsewhere - even if we knew that kind of
            loss was possible. Nothing here limits any liability that cannot be limited under California law.
          </p>
        </section>

        <section>
          <h2>9. Export control</h2>
          <p>
            We sell raw and cut plastic stock shapes to a customer-specified size - not parts built to a drawing, and
            not technical data. Combined with never accepting drawings, CAD files, or 3D models (see §2), this keeps
            controlled technical data off our systems by design. It&apos;s your responsibility to know whether your
            own use of a part is subject to export-control rules that apply to you.
          </p>
        </section>

        <section>
          <h2>10. Governing law</h2>
          <p>
            These terms are governed by the laws of the State of California, without regard to conflict-of-law
            rules. Any dispute arising from an order will be handled in the state or federal courts located in San
            Diego County, California.
          </p>
        </section>

        <section>
          <h2>11. Changes to these terms</h2>
          <p>
            We may update these terms from time to time; the &quot;Last updated&quot; date at the top will change
            when we do. An order already placed is governed by the terms in effect when you placed it.
          </p>
        </section>

        <section>
          <h2>12. Contact</h2>
          <p>
            Questions about an order or these terms:{" "}
            {isSet(brand.email) ? (
              <a href={`mailto:${brand.email}`} className="text-amber underline">
                {brand.email}
              </a>
            ) : (
              <>reach us through the contact information on our homepage</>
            )}
            .
          </p>
        </section>
      </div>
    </main>
    <Footer />
    </>
  );
}
