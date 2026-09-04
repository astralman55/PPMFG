import { Document, Page, View, Text, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { brand } from "@/lib/brand";
import type { QuoteResult } from "@/lib/pricing/engine";

/**
 * The Stage-1 commercial invoice - see CLAUDE_CODE_BRIEF.md §9. Every field
 * below comes from the order/customer/quote rows already written to the
 * database; nothing here is invented or re-priced. Line items show the full
 * spec (material, brand, certification tier, tolerance, finish) exactly as
 * CLAUDE_CODE_BRIEF.md §9 requires, but deliberately carry no per-line dollar
 * figure - the pricing engine applies its margin curve to the order as a
 * whole (see engine.ts's `gamma`), not per line, so a computed "line total"
 * would imply a precision the pricing model doesn't have. The quote builder
 * itself (app/quote/page.tsx) follows the same convention.
 */

export interface InvoiceShipAddress {
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
}

export interface InvoiceProps {
  orderNumber: string;
  createdAt: string; // ISO
  customerPo: string | null;
  promisedShipDate: string | null;
  customerEmail: string;
  customerCompany: string | null;
  shipAddress: InvoiceShipAddress | null;
  quote: QuoteResult;
  amountPaidCents: number;
  taxCents: number;
}

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 9, fontFamily: "Helvetica", color: "#14181C" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 18 },
  companyName: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  small: { fontSize: 8, color: "#4B5563", marginTop: 1 },
  title: { fontSize: 12, fontFamily: "Helvetica-Bold", textAlign: "right" },
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
  notice: {
    marginTop: 18,
    padding: 10,
    backgroundColor: "#FCFCFA",
    border: "1 solid #E3E3DE",
  },
  noticeHeading: { fontSize: 8.5, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  noticeBody: { fontSize: 8, color: "#374151", lineHeight: 1.4 },
  disclosure: { marginTop: 10, fontSize: 7.5, color: "#6B7280", lineHeight: 1.4 },
});

function money(dollars: number): string {
  return `$${dollars.toFixed(2)}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "TBD";
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00Z` : iso);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

function formatAddress(a: InvoiceShipAddress | null): string[] {
  if (!a) return ["Provided at checkout"];
  const lines: string[] = [];
  if (a.line1) lines.push(a.line1);
  if (a.line2) lines.push(a.line2);
  const cityLine = [a.city, a.state, a.postal_code].filter(Boolean).join(", ");
  if (cityLine) lines.push(cityLine);
  if (a.country) lines.push(a.country);
  return lines.length > 0 ? lines : ["Provided at checkout"];
}

function dims(l: number, w: number, t: number): string {
  return `${l} x ${w} x ${t} in`;
}

export function InvoiceDocument(props: InvoiceProps) {
  const { quote } = props;
  const residualStressNote = quote.sanity.flags.some((f) => f.startsWith("RESIDUAL_STRESS"));
  const processingAdder = quote.totals.processing_adder;
  const taxDollars = props.taxCents / 100;
  const amountPaidDollars = props.amountPaidCents / 100;

  return (
    <Document title={`Invoice ${props.orderNumber}`}>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.companyName}>{brand.companyName}</Text>
            <Text style={styles.small}>{brand.address.line1}</Text>
            <Text style={styles.small}>
              {brand.address.city}, {brand.address.state} {brand.address.zip}
            </Text>
            <Text style={styles.small}>{brand.phone}</Text>
            {brand.cageCode ? <Text style={styles.small}>CAGE: {brand.cageCode}</Text> : null}
          </View>
          <Text style={styles.title}>COMMERCIAL INVOICE</Text>
        </View>

        <View style={styles.metaBlock}>
          <View style={styles.metaCol}>
            <Text style={styles.sectionHeading}>Bill To</Text>
            <Text style={styles.metaValue}>{props.customerCompany || props.customerEmail}</Text>
            <Text style={styles.small}>{props.customerEmail}</Text>

            <Text style={styles.sectionHeading}>Ship To</Text>
            {formatAddress(props.shipAddress).map((line, i) => (
              <Text key={i} style={styles.small}>
                {line}
              </Text>
            ))}
          </View>
          <View style={styles.metaCol}>
            <Text style={styles.metaLabel}>Order number</Text>
            <Text style={styles.metaValue}>{props.orderNumber}</Text>
            <Text style={styles.metaLabel}>Invoice date</Text>
            <Text style={styles.metaValue}>{formatDate(props.createdAt)}</Text>
            <Text style={styles.metaLabel}>Customer PO</Text>
            <Text style={styles.metaValue}>{props.customerPo || "—"}</Text>
            <Text style={styles.metaLabel}>Promised ship date</Text>
            <Text style={styles.metaValue}>{formatDate(props.promisedShipDate)}</Text>
          </View>
        </View>

        <Text style={styles.sectionHeading}>Order lines</Text>
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

        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal (goods)</Text>
            <Text style={styles.totalValue}>{money(quote.totals.subtotal_goods + processingAdder)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Shipping</Text>
            <Text style={styles.totalValue}>{money(quote.totals.shipping)}</Text>
          </View>
          {taxDollars > 0.005 ? (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Tax</Text>
              <Text style={styles.totalValue}>{money(taxDollars)}</Text>
            </View>
          ) : null}
          <View style={styles.totalRowFinal}>
            <Text style={styles.totalLabelFinal}>Total charged</Text>
            <Text style={styles.totalValueFinal}>{money(amountPaidDollars)}</Text>
          </View>
        </View>

        <View style={styles.notice}>
          <Text style={styles.noticeHeading}>Certification Package - coming separately</Text>
          <Text style={styles.noticeBody}>
            Prepared the same business day this order is cut and emailed to you at {props.customerEmail}. It will
            include: the mill&apos;s Material Test Report for each lot cut, and our Certificate of Conformance
            naming the actual lot, measured thickness, and process performed.
          </Text>
        </View>

        <Text style={styles.disclosure}>{quote.spec_statement}</Text>
        {residualStressNote ? (
          <Text style={styles.disclosure}>
            This material carries internal residual stress. A cut blank can bow 0.010-0.025 in within 48 hours as
            that stress releases; this is expected and not a defect. Stress-relief annealing reduces it and can be
            added to a future order.
          </Text>
        ) : null}
      </Page>
    </Document>
  );
}

export async function renderInvoicePdf(props: InvoiceProps): Promise<Buffer> {
  return renderToBuffer(<InvoiceDocument {...props} />);
}
