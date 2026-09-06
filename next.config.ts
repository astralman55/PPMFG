import type { NextConfig } from "next";

// CLAUDE_CODE_BRIEF.md Phase 14 §22 - no security headers existed anywhere
// before this. The browser never loads Stripe.js (checkout is a full-page
// redirect built server-side, see app/quote/page.tsx's handleCheckout), and
// next/font/google self-hosts Archivo at build time, so nothing here needs
// to allow a third-party script or font origin. The only cross-origin calls
// the browser makes are Supabase Auth requests from /ops/login, allowed via
// connect-src below. 'unsafe-eval' is added to script-src only outside
// production because Next.js's dev-mode React Refresh relies on eval-based
// module transforms; production never needs it.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const isDev = process.env.NODE_ENV !== "production";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${supabaseUrl ? ` ${supabaseUrl}` : ""}`,
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
