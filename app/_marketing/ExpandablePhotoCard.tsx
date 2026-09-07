"use client";

import { useState } from "react";
import Image from "next/image";

/**
 * The photo is always visible - it never gets replaced. A caption card sits
 * over the bottom of it and expands in place to reveal more detail on
 * click, growing taller without ever hiding the photo behind it.
 */
export function ExpandablePhotoCard({
  src,
  alt,
  title,
  detail,
}: {
  src: string;
  alt: string;
  title: string;
  detail: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative overflow-hidden rounded-lg border border-rule">
      <div className="relative h-72 w-full">
        <Image src={src} alt={alt} fill sizes="(min-width: 640px) 50vw, 100vw" className="object-cover" />
      </div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="absolute inset-x-3 bottom-3 rounded-md bg-paper/95 px-5 py-4 text-left shadow-sm backdrop-blur-sm"
      >
        <span className="flex items-center justify-between gap-3">
          <strong className="text-[15px]">{title}</strong>
          <span
            className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-rule text-sm leading-none transition-transform ${open ? "rotate-45 border-amber text-amber" : ""}`}
            aria-hidden
          >
            +
          </span>
        </span>
        <span
          className="grid text-sm text-graphite transition-all"
          style={{ gridTemplateRows: open ? "1fr" : "0fr", marginTop: open ? "10px" : "0" }}
        >
          <span className="overflow-hidden leading-relaxed">{detail}</span>
        </span>
      </button>
    </div>
  );
}
