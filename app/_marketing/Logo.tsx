import Image from "next/image";
import Link from "next/link";

// Source image is 875x295 (~2.97:1) - height is set per usage site via
// className, width left to scale automatically so the mark never distorts.
const LOGO_ASPECT = { width: 875, height: 295 };

export function Logo({ className = "h-8", priority = false }: { className?: string; priority?: boolean }) {
  return (
    <Link href="/" className="inline-flex items-center hover:opacity-80">
      <Image
        src="/logo.jpg"
        alt="Polly Plastics"
        width={LOGO_ASPECT.width}
        height={LOGO_ASPECT.height}
        className={`w-auto ${className}`}
        priority={priority}
      />
    </Link>
  );
}
