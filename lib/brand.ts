// Company identity used across the site, invoices and certificates.
// PLACEHOLDER VALUES — replace before taking a real order.
// See CLAUDE_CODE_BRIEF.md §16 item 8 re: CAGE code registration.

export const brand = {
  companyName: "Polly Plastics",
  address: {
    line1: "REPLACE_WITH_STREET_ADDRESS",
    city: "El Cajon",
    state: "CA",
    zip: "REPLACE_WITH_ZIP",
    country: "US",
  },
  phone: "REPLACE_WITH_PHONE",
  cageCode: "",
} as const;
