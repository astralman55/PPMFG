"use client";

/**
 * The hero's centerpiece - CLAUDE_CODE_BRIEF.md §11: "The hero renders the
 * customer's blank as a live drawing that updates as they type, with ±.030
 * annotated on the edge and the callout changing when they switch tolerance
 * tier." Plain SVG, no charting/diagram library - this is deliberately the
 * one bold, custom-drawn thing on the page; everything else stays quiet.
 *
 * `drawKey` should change (e.g. increment) each time a price resolves - the
 * dimension lines remount and replay their draw-in animation, which is the
 * page's one orchestrated motion moment (§11 "Motion").
 */

export interface DimensionedBlankProps {
  lengthIn: number;
  widthIn: number;
  toleranceIn: number;
  materialLabel: string;
  swatch: string;
  drawKey: number | string;
}

const VIEW_W = 420;
const VIEW_H = 320;
const PAD_LEFT = 70;
const PAD_BOTTOM = 56;
const PAD_TOP = 24;
const PAD_RIGHT = 24;

export function DimensionedBlank({ lengthIn, widthIn, toleranceIn, materialLabel, swatch, drawKey }: DimensionedBlankProps) {
  const drawAreaW = VIEW_W - PAD_LEFT - PAD_RIGHT;
  const drawAreaH = VIEW_H - PAD_TOP - PAD_BOTTOM;

  const aspect = lengthIn > 0 && widthIn > 0 ? lengthIn / widthIn : 1;
  let rectW = drawAreaW;
  let rectH = rectW / aspect;
  if (rectH > drawAreaH) {
    rectH = drawAreaH;
    rectW = rectH * aspect;
  }

  const x0 = PAD_LEFT + (drawAreaW - rectW) / 2;
  const y0 = PAD_TOP + (drawAreaH - rectH) / 2;
  const x1 = x0 + rectW;
  const y1 = y0 + rectH;

  const extGap = 6; // gap between the object and where the extension line starts
  const extOver = 8; // how far the extension line runs past the dimension line
  const dimLineYOffset = 28; // dimension line sits this far below the rectangle
  const dimLineXOffset = 40; // dimension line sits this far left of the rectangle
  const dimLineY = y1 + dimLineYOffset;
  const dimLineX = x0 - dimLineXOffset;

  const lengthLabel = `${trimZeros(lengthIn)} x +/-${toleranceIn.toFixed(3)} in`;
  const widthLabel = `${trimZeros(widthIn)} in`;

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className="w-full max-w-md"
      role="img"
      aria-label={`Dimensioned drawing of a ${materialLabel} blank, ${lengthIn} by ${widthIn} inches, tolerance plus or minus ${toleranceIn} inches`}
    >
      <defs>
        <marker id="dim-arrow-start" markerWidth="8" markerHeight="8" refX="1" refY="4" orient="auto">
          <path d="M7,0 L7,8 L0,4 Z" fill="var(--color-ink)" />
        </marker>
        <marker id="dim-arrow-end" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,0 L0,8 L7,4 Z" fill="var(--color-ink)" />
        </marker>
      </defs>

      {/* The blank */}
      <rect x={x0} y={y0} width={rectW} height={rectH} fill={swatch} stroke="var(--color-ink)" strokeWidth={1.5} />

      {/* Extension lines - length (bottom) */}
      <line x1={x0} y1={y1 + extGap} x2={x0} y2={dimLineY + extOver} stroke="var(--color-graphite)" strokeWidth={1} />
      <line x1={x1} y1={y1 + extGap} x2={x1} y2={dimLineY + extOver} stroke="var(--color-graphite)" strokeWidth={1} />

      {/* Extension lines - width (left) */}
      <line x1={x0 - extGap} y1={y0} x2={dimLineX - extOver} y2={y0} stroke="var(--color-graphite)" strokeWidth={1} />
      <line x1={x0 - extGap} y1={y1} x2={dimLineX - extOver} y2={y1} stroke="var(--color-graphite)" strokeWidth={1} />

      {/* Dimension line - length */}
      <line
        key={`len-${drawKey}`}
        x1={x0}
        y1={dimLineY}
        x2={x1}
        y2={dimLineY}
        stroke="var(--color-ink)"
        strokeWidth={1.5}
        markerStart="url(#dim-arrow-start)"
        markerEnd="url(#dim-arrow-end)"
        className="dim-draw-in"
      />
      <text x={(x0 + x1) / 2} y={dimLineY + 18} textAnchor="middle" className="fill-ink font-mono text-[11px] tabular-nums">
        {lengthLabel}
      </text>

      {/* Dimension line - width */}
      <line
        key={`wid-${drawKey}`}
        x1={dimLineX}
        y1={y0}
        x2={dimLineX}
        y2={y1}
        stroke="var(--color-ink)"
        strokeWidth={1.5}
        markerStart="url(#dim-arrow-start)"
        markerEnd="url(#dim-arrow-end)"
        className="dim-draw-in"
      />
      <text
        x={dimLineX - 10}
        y={(y0 + y1) / 2}
        textAnchor="middle"
        transform={`rotate(-90, ${dimLineX - 10}, ${(y0 + y1) / 2})`}
        className="fill-ink font-mono text-[11px] tabular-nums"
      >
        {widthLabel}
      </text>

      <style>{`
        .dim-draw-in {
          stroke-dasharray: 500;
          stroke-dashoffset: 500;
          animation: dim-draw 0.6s ease-out forwards;
        }
        @keyframes dim-draw {
          to { stroke-dashoffset: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .dim-draw-in { animation: none; stroke-dashoffset: 0; }
        }
      `}</style>
    </svg>
  );
}

function trimZeros(n: number): string {
  return n.toFixed(3).replace(/\.?0+$/, "") || "0";
}
