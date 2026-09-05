import Link from "next/link";

/** CLAUDE_CODE_BRIEF.md §18, section 7. */
export function FinalCta() {
  return (
    <section className="mx-auto max-w-5xl border-t border-rule px-4 py-16 text-center">
      <p className="text-2xl font-medium tracking-tight sm:text-3xl">Your distributor takes three days. We take five seconds.</p>
      <Link href="/quote" className="mt-6 inline-block rounded bg-ink px-6 py-3 text-sm font-medium text-paper hover:opacity-90">
        Get price
      </Link>
    </section>
  );
}
