/**
 * CLAUDE_CODE_BRIEF.md §20.1 - before a price has resolved (dimensions not
 * entered yet, or still debouncing), the diagram area shows this instead of
 * blank space: an empty outline at the SELECTED material's real stock sheet
 * size, so the canvas is visible before the cut is. Sheet size comes from
 * resolveSheetSize() (§20.2) - never hardcoded here.
 */
export function EmptySheetOutline({
  lengthIn,
  widthIn,
  materialLabel,
}: {
  lengthIn: number;
  widthIn: number;
  materialLabel: string;
}) {
  return (
    <div className="mt-6 rounded border border-neutral-300 p-4 dark:border-neutral-700">
      <p className="text-sm font-medium">How your order fits on our stock sheet</p>
      <p className="mt-1 text-xs text-neutral-500">
        {materialLabel} - {trimZeros(lengthIn)} x {trimZeros(widthIn)} in stock sheet
      </p>
      <svg
        viewBox={`0 0 ${lengthIn} ${widthIn}`}
        className="mt-3 w-full max-w-lg"
        role="img"
        aria-label={`Empty ${trimZeros(lengthIn)} by ${trimZeros(widthIn)} inch stock sheet outline for ${materialLabel}`}
      >
        <rect
          x={lengthIn * 0.006}
          y={lengthIn * 0.006}
          width={lengthIn * 0.988}
          height={widthIn - lengthIn * 0.012}
          fill="none"
          stroke="var(--color-rule, #e3e3de)"
          strokeWidth={lengthIn * 0.006}
          strokeDasharray={`${lengthIn * 0.02} ${lengthIn * 0.012}`}
        />
      </svg>
      <p className="mt-2 text-xs text-neutral-500">Enter length and width to see your parts placed on the sheet.</p>
    </div>
  );
}

function trimZeros(n: number): string {
  return n.toFixed(3).replace(/\.?0+$/, "") || "0";
}
