import { Document, Page, View, Text, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { brand } from "@/lib/brand";
import type { QuoteResult } from "@/lib/pricing/engine";
import type { SoloNestResult } from "@/lib/pricing/solo-nest";

/**
 * CLAUDE_CODE_BRIEF.md §20.5 - a distinct template from Invoice
 * (lib/docs/invoice.tsx): a quote has no PAID status and is not a bill, so
 * it must never be visually mistakable for one in an accounts-payable
 * inbox. Content is pulled directly from the stored quotes.result_json and
 * quotes row - nothing here is recomputed, so the PDF always matches
 * exactly what was on screen when it was generated.
 *
 * The solo cut diagram itself (an SVG) is NOT rendered into this PDF -
 * react-pdf has no SVG-to-raster path in this environment without adding a
 * new rendering dependency, so per the brief's own allowance this includes
 * the numeric summary (sheets required / utilisation / recoverable
 * fraction) only, one block per material group.
 */

export interface QuoteSummaryProps {
  quoteId: string;
  createdAt: string; // ISO
  expiresAt: string; // ISO
  customerEmail: string;
  quote: QuoteResult;
  soloNest: SoloNestResult | null;
}

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 9, fontFamily: "Helvetica", color: "#14181C" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  companyName: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  small: { fontSize: 8, color: "#4B5563", marginTop: 1 },
  title: { fontSize: 12, fontFamily: "Helvetica-Bold", textAlign: "right" },
  notBillBadge: {
    alignSelf: "flex-end",
    marginTop: 4,
    paddingVertical: 2,
    paddingHorizontal: 6,
    backgroundColor: "#FCFCFA",
    border: "1 solid #B8710F",
  },
  notBillText: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#B8710F" },
  metaBlock: { marginTop: 18, flexDirection: "row", justifyContent: "space-between" },
  metaCol: { width: "48%" },
  metaLabel: { fontSize: 8, color: "#6B7280", marginTop: 6 },
  metaValue: { fontSize: 9.5, fontFamily: "Helvetica-Bold" },
  sectionHeading: { fontSize: 8, color: "#6B7280", marginTop: 16, marginBottom: 4, textTransform: "uppercase" },
  table: { marginTop: 4, borderTop: "1 solid #E3E3DE" },
  tr: { flexDirection: "row", borderBottom: "1 solid #E3E3DE", paddingVertical: 5 },
  trHead: { flexDirection: "row", borderBottom: "1 solid #14181C", paddingVertical: 4 },
  th: { fontSize: 7.5, color: "#6B7280", textTransform: "uppercase", paddingRight: 6 },
  td: { fontSize: 8.5, paddingRight: 6 },
  colLine: { width: "5%" },
  colMat: { width: "21%" },
  colBrandTier: { width: "18%" },
  colSize: { width: "16%" },
  colQty: { width: "6%" },
  colTol: { width: "13%" },
  colFinish: { width: "21%" },
  totals: { marginTop: 14, alignSelf: "flex-end", width: "45%" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  totalRowFinal: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 5,
    marginTop: 3,
    borderTop: "1 solid #14181C",
  },
  totalLabel: { fontSize: 9 },
  totalLabelFinal: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  totalValue: { fontSize: 9, fontFamily: "Helvetica" },
  totalValueFinal: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  leadBlock: { marginTop: 14 },
  nestBlock: {
    marginTop: 10,
    padding: 8,
    backgroundColor: "#FCFCFA",
    border: "1 solid #E3E3DE",
  },
  nestHeading: { fontSize: 8, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  nestRow: { flexDirection: "row", gap: 14 },
  nestStat: { fontSize: 8, color: "#374151" },
  disclosure: { marginTop: 10, fontSize: 7.5, color: "#6B7280", lineHeight: 1.4 },
});

function money(dollars: number): string {
  return `$${dollars.toFixed(2)}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function dims(l: number, w: number, t: number): string {
  return `${l} x ${w} x ${t} in`;
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export function QuoteSummaryDocument(props: QuoteSummaryProps) {
  const { quote, soloNest } = props;

  return (
    <Document title={`Quote ${props.quoteId}`}>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.companyName}>{brand.companyName}</Text>
            <Text style={styles.small}>{brand.address.line1}</Text>
            <Text style={styles.small}>
              {brand.address.city}, {brand.address.state} {brand.address.zip}
            </Text>
            <Text style={styles.small}>{brand.phone}</Text>
          </View>
          <View>
            <Text style={styles.title}>PRICE QUOTE</Text>
            <View style={styles.notBillBadge}>
              <Text style={styles.notBillText}>QUOTE - NOT A BILL</Text>
            </View>
          </View>
        </View>

        <View style={styles.metaBlock}>
          <View style={styles.metaCol}>
            <Text style={styles.sectionHeading}>Prepared for</Text>
            <Text style={styles.metaValue}>{props.customerEmail}</Text>
          </View>
          <View style={styles.metaCol}>
            <Text style={styles.metaLabel}>Quote number</Text>
            <Text style={styles.metaValue}>{props.quoteId}</Text>
            <Text style={styles.metaLabel}>Quote date</Text>
            <Text style={styles.metaValue}>{formatDate(props.createdAt)}</Text>
            <Text style={styles.metaLabel}>Valid until</Text>
            <Text style={styles.metaValue}>{formatDate(props.expiresAt)}</Text>
          </View>
        </View>

        <Text style={styles.sectionHeading}>Lines quoted</Text>
        <View style={styles.table}>
          <View style={styles.trHead}>
            <Text style={[styles.th, styles.colLine]}>#</Text>
            <Text style={[styles.th, styles.colMat]}>Material</Text>
            <Text style={[styles.th, styles.colBrandTier]}>Brand / tier</Text>
            <Text style={[styles.th, styles.colSize]}>Size (L x W x T)</Text>
            <Text style={[styles.th, styles.colQty]}>Qty</Text>
            <Text style={[styles.th, styles.colTol]}>Tolerance</Text>
            <Text style={[styles.th, styles.colFinish]}>Finish</Text>
          </View>
          {quote.lines.map((ln, i) => (
            <View style={styles.tr} key={i} wrap={false}>
              <Text style={[styles.td, styles.colLine]}>{i + 1}</Text>
              <Text style={[styles.td, styles.colMat]}>{ln.material_label}</Text>
              <Text style={[styles.td, styles.colBrandTier]}>
                {ln.brand_label} / {ln.certification_label}
              </Text>
              <Text style={[styles.td, styles.colSize]}>
                {dims(ln.length_in, ln.width_in, ln.thickness_nominal_in)}
              </Text>
              <Text style={[styles.td, styles.colQty]}>{ln.qty}</Text>
              <Text style={[styles.td, styles.colTol]}>{ln.tolerance_label}</Text>
              <Text style={[styles.td, styles.colFinish]}>
                {ln.edge_finish_label} edge, {ln.face_finish_label} face{ln.annealed ? ", annealed" : ""}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.leadBlock}>
          <Text style={styles.sectionHeading}>Lead time (this quote)</Text>
          <Text style={styles.metaValue}>{quote.lead_label}</Text>
          <Text style={styles.small}>Promised ship date: {formatDate(quote.lead_time.promised_ship_date)}</Text>
          {quote.lead_time.composite_note ? <Text style={styles.small}>{quote.lead_time.composite_note}</Text> : null}
        </View>

        {soloNest && soloNest.groups.length > 0 ? (
          <View style={styles.nestBlock}>
            <Text style={styles.nestHeading}>How this order fits on our stock sheet</Text>
            {soloNest.groups.map((g, i) => (
              <View key={i} style={styles.nestRow}>
                <Text style={styles.nestStat}>
                  {g.sheet_count} sheet{g.sheet_count === 1 ? "" : "s"}
                </Text>
                <Text style={styles.nestStat}>{pct(g.utilisation)} utilisation</Text>
                <Text style={styles.nestStat}>{pct(g.recoverable_fraction)} placed or kept</Text>
              </View>
            ))}
            <Text style={[styles.small, { marginTop: 4 }]}>
              Shown alone - the flexible ship-when-full option often improves on this by combining the cut with
              other orders on the same sheet. See the on-screen quote for the price difference.
            </Text>
          </View>
        ) : null}

        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal (goods)</Text>
            <Text style={styles.totalValue}>{money(quote.totals.subtotal_goods + quote.totals.processing_adder)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Shipping</Text>
            <Text style={styles.totalValue}>{money(quote.totals.shipping)}</Text>
          </View>
          <View style={styles.totalRowFinal}>
            <Text style={styles.totalLabelFinal}>Estimated total</Text>
            <Text style={styles.totalValueFinal}>{money(quote.totals.total_due)}</Text>
          </View>
        </View>

        <Text style={styles.disclosure}>{quote.spec_statement}</Text>
        <Text style={styles.disclosure}>
          This is a price quote, not an invoice - no payment has been made and none is due. Pricing and the ship
          date above are valid only until {formatDate(props.expiresAt)}, after which a fresh quote may price
          differently.
        </Text>
      </Page>
    </Document>
  );
}

export async function renderQuoteSummaryPdf(props: QuoteSummaryProps): Promise<Buffer> {
  return renderToBuffer(<QuoteSummaryDocument {...props} />);
}
