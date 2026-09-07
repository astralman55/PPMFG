import type { Metadata } from "next";
import { brand } from "@/lib/brand";
import { Footer } from "../_marketing/Footer";
import { Header } from "../_marketing/Header";

export const metadata: Metadata = {
  title: "Privacy Policy | Precision Plastics Manufacturing",
  description: "What information Precision Plastics Manufacturing collects, why, and who it's shared with.",
};

const LAST_UPDATED = "September 6, 2026";

function isSet(value: string): boolean {
  return value.length > 0 && !value.startsWith("REPLACE_WITH_");
}

export default function PrivacyPage() {
  return (
    <>
    <Header maxWidth="max-w-2xl" />
    <main className="mx-auto max-w-2xl px-4 py-14 text-ink">
      <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">Privacy Policy</h1>
      <p className="mt-2 text-sm text-graphite">Last updated {LAST_UPDATED}.</p>

      <div className="mt-8 flex flex-col gap-8 text-sm leading-relaxed text-graphite [&_h2]:text-base [&_h2]:font-medium [&_h2]:text-ink [&_p]:mt-2 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mt-1">
        <section>
          <p>
            This page explains what {brand.companyName} collects when you get a quote or place an order on this
            site, why, and who we share it with. We collect the minimum needed to price your order, cut it, ship it,
            and certify it - nothing more.
          </p>
        </section>

        <section>
          <h2>1. What we collect</h2>
          <p>When you use the quote tool or place an order, we collect:</p>
          <ul>
            <li>Contact information you give us: email address, and company name and phone number if provided</li>
            <li>Order details: the material, dimensions, quantity, and options you select, and any purchase order number or shipping address you enter</li>
            <li>Payment confirmation from Stripe (a successful charge and the last four digits of your card, for your records) - we never see or store your full card number</li>
            <li>Standard web server logs (IP address, browser type, pages visited) for security and troubleshooting</li>
          </ul>
          <p>
            If you request a resale certificate be applied to your account for sales-tax purposes, we keep a copy of
            that certificate and its expiration date on file.
          </p>
        </section>

        <section>
          <h2>2. Why we collect it</h2>
          <ul>
            <li>To calculate a price and generate your quote</li>
            <li>To process payment and create your order</li>
            <li>To cut, inspect, and ship your parts, and to produce your Certificate of Conformance and Material Test Report</li>
            <li>To email you about a quote or order you asked for - a quote summary, order confirmation, shipping update, or certification package</li>
            <li>To keep the tax, quality, and traceability records a material supplier is expected to keep</li>
          </ul>
          <p>We do not use your information for advertising, and we do not sell your personal information to anyone.</p>
        </section>

        <section>
          <h2>3. Who we share it with</h2>
          <p>We use a small number of outside services to run this site, and share only what each one needs to do its job:</p>
          <ul>
            <li><strong>Stripe</strong> - to process payment and calculate sales tax</li>
            <li><strong>Resend</strong> - to deliver quote, order, and certification emails</li>
            <li><strong>Supabase</strong> - to securely store order records and certification documents</li>
          </ul>
          <p>
            Each acts as a service provider processing data on our behalf, under their own security and privacy
            commitments - none of them is permitted to use your information for their own purposes. We may also
            disclose information if required by law, such as in response to a subpoena.
          </p>
        </section>

        <section>
          <h2>4. Cookies and tracking</h2>
          <p>
            This site does not use advertising or third-party analytics cookies. The only cookie in use is a
            necessary session cookie for our own staff to sign in to the internal order-management console - it
            plays no role in your experience getting a quote or placing an order.
          </p>
        </section>

        <section>
          <h2>5. How long we keep it</h2>
          <p>
            We keep order, payment, and certification records for as long as normal tax and quality-traceability
            recordkeeping calls for. An unpurchased quote that expires is not tied to any order and is not kept
            beyond what&apos;s needed to operate the site.
          </p>
        </section>

        <section>
          <h2>6. Your choices</h2>
          <p>
            You can ask us what information we have about you, ask us to correct it, or ask us to delete it. We&apos;ll
            honor deletion requests except where we&apos;re required to keep a record - for example, a paid order&apos;s
            certification and tax records.
          </p>
        </section>

        <section>
          <h2>7. Children</h2>
          <p>This site is a business-to-business tool for ordering material and isn&apos;t directed at children.</p>
        </section>

        <section>
          <h2>8. Changes to this policy</h2>
          <p>
            If this policy changes, we&apos;ll update the &quot;Last updated&quot; date at the top of this page.
          </p>
        </section>

        <section>
          <h2>9. Contact</h2>
          <p>
            Questions about this policy, or a request about your information:{" "}
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
