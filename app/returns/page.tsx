import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/lib/brand";
import { Footer } from "../_marketing/Footer";
import { Logo } from "../_marketing/Logo";

export const metadata: Metadata = {
  title: "Returns & Refunds | Polly Plastics",
  description: "How cancellations, defects, and refunds work for custom-cut orders.",
};

const LAST_UPDATED = "September 6, 2026";

function isSet(value: string): boolean {
  return value.length > 0 && !value.startsWith("REPLACE_WITH_");
}

export default function ReturnsPage() {
  return (
    <>
    <main className="mx-auto max-w-2xl px-4 py-14 text-ink">
      <Logo className="h-6" priority />
      <h1 className="mt-4 text-2xl font-medium tracking-tight sm:text-3xl">Returns &amp; Refunds</h1>
      <p className="mt-2 text-sm text-graphite">Last updated {LAST_UPDATED}.</p>

      <div className="mt-8 flex flex-col gap-8 text-sm leading-relaxed text-graphite [&_h2]:text-base [&_h2]:font-medium [&_h2]:text-ink [&_p]:mt-2 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mt-1">
        <section>
          <p>
            Every part we ship is cut to the exact length, width, thickness, and finish you specified when you
            ordered - it&apos;s made for you, not pulled from stock inventory. That makes it a custom good, and it
            shapes how returns work here: we can&apos;t resell a piece cut to your dimensions to the next customer,
            so this policy is built around getting it right the first time and fixing it fast if we don&apos;t,
            rather than a standard e-commerce return window.
          </p>
        </section>

        <section>
          <h2>1. Changing or cancelling an order</h2>
          <p>
            You can cancel or change an order for a full refund any time before it enters production - in practice,
            before the material for your order has been assigned and cut. Once cutting has started, the order can no
            longer be cancelled or changed, since the material has already been committed to your specification.
            Email us as soon as possible if you need to change or cancel something; we&apos;ll confirm whether the
            order has started.
          </p>
        </section>

        <section>
          <h2>2. If we made a mistake</h2>
          <p>If what arrives doesn&apos;t match what you ordered, we&apos;ll replace it or refund it - your choice. This covers:</p>
          <ul>
            <li>Wrong material, brand, or certification tier from what you selected at checkout</li>
            <li>Length, width, or thickness outside the tolerance tier you selected</li>
            <li>Wrong edge or face finish from what you selected</li>
            <li>A cutting defect - a crack, chip, or burn mark beyond what normal deburring should have caught</li>
            <li>Missing or incorrect certification paperwork for a Tier 1 order</li>
          </ul>
          <p>
            Report it within 10 business days of delivery so we can look into it while the lot is still traceable.
            Include your order number and, if possible, a photo. We&apos;ll cover return shipping when the mistake is
            ours.
          </p>
        </section>

        <section>
          <h2>3. What isn&apos;t a defect</h2>
          <p>
            A few things are normal for cut-to-size plastic and are disclosed on the quote page before you order, so
            they aren&apos;t grounds for a return on their own:
          </p>
          <ul>
            <li>Dimensional variance within the tolerance tier you selected at quote time</li>
            <li>Thickness as-supplied by the mill rather than machined to an exact nominal value</li>
            <li>
              Slight bowing (typically 0.010-0.025 in) appearing within 48 hours of cutting in materials with
              residual stress - annealing at checkout reduces this if it matters for your application
            </li>
            <li>Minor color or lot-to-lot appearance variation, which does not affect material properties</li>
          </ul>
        </section>

        <section>
          <h2>4. Damaged in shipping</h2>
          <p>
            If a package arrives visibly damaged or a part is broken on arrival, keep the packaging, photograph the
            damage, and contact us within 5 business days. We&apos;ll file the freight claim and get a replacement
            moving - this isn&apos;t deducted from any return allowance above.
          </p>
        </section>

        <section>
          <h2>5. How refunds are issued</h2>
          <p>
            Approved refunds are returned to the original payment method through Stripe, usually within 5-10
            business days depending on your bank. A replacement order ships under a new promised ship date, priced
            and scheduled the same way your original order was.
          </p>
        </section>

        <section>
          <h2>6. How to reach us</h2>
          <p>
            {isSet(brand.email) ? (
              <>
                Email{" "}
                <a href={`mailto:${brand.email}`} className="text-amber underline">
                  {brand.email}
                </a>{" "}
                with your order number and what&apos;s wrong.
              </>
            ) : (
              <>Reach us through the contact information on our homepage with your order number and what&apos;s wrong.</>
            )}{" "}
            See also our <Link href="/terms" className="text-amber underline">Terms of Sale</Link>.
          </p>
        </section>
      </div>
    </main>
    <Footer />
    </>
  );
}
