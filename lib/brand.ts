// Company identity used across the site, invoices and certificates.
// PLACEHOLDER VALUES — replace before taking a real order.
// See CLAUDE_CODE_BRIEF.md §16 item 8 re: CAGE code registration.

export const brand = {
  companyName: "Precision Plastics Manufacturing",
  address: {
    line1: "REPLACE_WITH_STREET_ADDRESS",
    city: "El Cajon",
    state: "CA",
    zip: "REPLACE_WITH_ZIP",
    country: "US",
  },
  phone: "REPLACE_WITH_PHONE",
  cageCode: "",
  // Public contact email for the footer/trust content - not the same as
  // RESEND_API_KEY's send-from address. Blank until confirmed.
  email: "",
  // Real, earned certifications only (e.g. "AS9100D") - CLAUDE_CODE_BRIEF.md
  // §18: "only ones actually earned." Empty means the homepage trust strip
  // and any certification badge render nothing, not a placeholder.
  certifications: [] as string[],
  // Only set once a documented quality policy actually exists.
  qualityPolicyUrl: "",
} as const;
