import Link from "next/link";
import { articles } from "@/lib/articles/content";

/** CLAUDE_CODE_BRIEF.md §18, section 6 - four cards from the five Phase 9 articles. */
export function GuidesStrip() {
  const featured = articles.slice(0, 4);
  return (
    <section className="mx-auto max-w-5xl border-t border-rule px-4 py-14">
      <div className="flex items-baseline justify-between">
        <h2 className="text-2xl font-medium tracking-tight sm:text-3xl">Guides</h2>
        <Link href="/learn" className="text-sm text-amber hover:underline">
          See all guides
        </Link>
      </div>
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {featured.map((a) => (
          <Link key={a.slug} href={`/learn/${a.slug}`} className="flex flex-col gap-2 border border-rule p-4 hover:border-ink">
            <p className="font-medium">{a.title}</p>
            <p className="text-sm text-graphite">{a.dek}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
