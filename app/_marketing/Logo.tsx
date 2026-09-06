import Image from "next/image";
import Link from "next/link";

// Source image is 2432x816 (~2.98:1) - height is set per usage site via
// className, width left to scale automatically so the mark never distorts.
const LOGO_ASPECT = { width: 2432, height: 816 };

export function Logo({ className = "h-8", priority = false }: { className?: string; priority?: boolean }) {
  return (
    <Link href="/" className="inline-flex items-center hover:opacity-80">
      <Image
        src="/logo.png"
        alt="Precision Plastics Manufacturing"
        width={LOGO_ASPECT.width}
        height={LOGO_ASPECT.height}
        className={`w-auto ${className}`}
        priority={priority}
      />
    </Link>
  );
}
