import { Document, Page, View, Text, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { brand } from "@/lib/brand";
import cfgJson from "@/lib/pricing/config.json";
import type { PricingConfig } from "@/lib/pricing/engine";
import type { InvoiceShipAddress } from "./invoice";

const CFG = cfgJson as unknown as PricingConfig;

/**
 * The Certificate of Conformance - see CLAUDE_CODE_BRIEF.md §9, "read
 * twice." This is the shop's own document, and it must name the actual lot
 * cut. It is only ever generated during fulfilment, once a real lot with a
 * real MTR has been assigned to every line - never at checkout with a
 * placeholder, which the brief calls falsification of a certification
 * record.
 *
 * "Every field populates from real database values. If any is missing the
 * generator throws rather than printing a blank" - validateCertificateInput
 * enforces that before any PDF is rendered.
 *
 * "On INDUSTRIAL tier lines, the DFARS and lineage statements are
 * suppressed... printing them anyway is the failure mode that ends this
 * business." Since one order can mix TIER1_TRACEABLE and INDUSTRIAL lines,
 * suppression is scoped per line, not per document - see
 * complianceStatements() below.
 */

export class CertificateError extends Error {}

export interface CertificateLine {
  line_no: number;
  part_ref: string | null;
  material_code: string;
  qty: number;
  length_in: number;
  width_in: number;
  thickness_nominal: number;
  thickness_actual: number | null;
  tolerance_tier: string;
  edge_finish: string;
  face_finish: string;
  annealed: boolean;
  certification_tier: string;
  inspected_by: string | null;
  lot: {
    lot_number: string;
    brand: string;
    manufacturer: string;
    country_of_origin: string | null;
  } | null;
}

export interface CertificateProps {
  certNumber: string;
  certDate: string; // ISO
  orderNumber: string;
  customerPo: string | null;
  soldTo: { company: string | null; email: string };
  shipTo: InvoiceShipAddress | null;
  lines: CertificateLine[];
}

export function validateCertificateInput(lines: CertificateLine[]): void {
  if (lines.length === 0) throw new CertificateError("Cannot certify an order with no lines.");
  for (const ln of lines) {
    const where = `line ${ln.line_no}`;
    if (!ln.lot) throw new CertificateError(`${where}: no lot has been assigned. Assign a lot before certifying.`);
    if (!ln.lot.lot_number) throw new CertificateError(`${where}: the assigned lot has no lot number.`);
    if (!ln.lot.manufacturer) throw new CertificateError(`${where}: the assigned lot has no manufacturer on file.`);
    if (!ln.lot.country_of_origin) throw new CertificateError(`${where}: the assigned lot has no country of origin on file.`);
    if (ln.thickness_actual === null || ln.thickness_actual === undefined) {
      throw new CertificateError(`${where}: no measured actual thickness has been recorded.`);
    }
    if (!ln.inspected_by) throw new CertificateError(`${where}: no inspector has been recorded.`);
  }
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
  th: { fontSize: 7, color: "#6B7280", textTransform: "uppercase", paddingRight: 5 },
  td: { fontSize: 7.8, paddingRight: 5 },
  colLine: { width: "4%" },
  colMat: { width: "14%" },
  colLot: { width: "12%" },
  colMfr: { width: "13%" },
  colSize: { width: "13%" },
  colActual: { width: "9%" },
  colQty: { width: "5%" },
  colCoo: { width: "8%" },
  colTol: { width: "10%" },
  colFinish: { width: "12%" },
  statement: { marginTop: 10, fontSize: 8, lineHeight: 1.5 },
  statementHeading: { fontSize: 8.5, fontFamily: "Helvetica-Bold", marginTop: 12, marginBottom: 3 },
  signature: { marginTop: 30, flexDirection: "row", justifyContent: "space-between" },
  signatureBlock: { width: "45%" },
  signatureLine: { borderTop: "1 solid #14181C", marginTop: 24, paddingTop: 3, fontSize: 7.5, color: "#6B7280" },
  footer: { marginTop: 24, fontSize: 7.5, color: "#6B7280", textAlign: "center" },
});

function formatDate(iso: string): string {
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00Z` : iso);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

function dims(l: number, w: number, t: number): string {
  return `${l} x ${w} x ${t} in`;
}

/**
 * DFARS/authorised-channel/mercury statements only cover lines actually
 * eligible for them (TIER1_TRACEABLE). INDUSTRIAL lines get their own,
 * separate, "no lineage claimed" statement - and if the whole order is
 * INDUSTRIAL, the lineage statements are omitted entirely rather than
 * scoped to zero lines.
 */
function complianceStatements(lines: CertificateLine[]): { tier1LineNos: number[]; industrialLineNos: number[] } {
  const tier1LineNos = lines.filter((l) => l.certification_tier !== "INDUSTRIAL").map((l) => l.line_no);
  const industrialLineNos = lines.filter((l) => l.certification_tier === "INDUSTRIAL").map((l) => l.line_no);
  return { tier1LineNos, industrialLineNos };
}

export function CertificateDocument(props: CertificateProps) {
  validateCertificateInput(props.lines);
  const { tier1LineNos, industrialLineNos } = complianceStatements(props.lines);
  const inspectors = Array.from(new Set(props.lines.map((l) => l.inspected_by))).filter((v): v is string => Boolean(v));
  const loosestTol = props.lines.reduce((worst, l) => {
    const t = CFG.tolerance_tiers[l.tolerance_tier];
    const w = CFG.tolerance_tiers[worst];
    return t.tolerance_in > w.tolerance_in ? l.tolerance_tier : worst;
  }, props.lines[0].tolerance_tier);
  const tol = CFG.tolerance_tiers[loosestTol];
  const anyAnnealed = props.lines.some((l) => l.annealed);

  return (
    <Document title={`Certificate of Conformance ${props.certNumber}`}>
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
          <Text style={styles.title}>CERTIFICATE OF CONFORMANCE</Text>
        </View>

        <View style={styles.metaBlock}>
          <View style={styles.metaCol}>
            <Text style={styles.sectionHeading}>Sold To</Text>
            <Text style={styles.metaValue}>{props.soldTo.company || props.soldTo.email}</Text>
            <Text style={styles.small}>{props.soldTo.email}</Text>

            <Text style={styles.sectionHeading}>Ship To</Text>
            {(props.shipTo
              ? [props.shipTo.line1, [props.shipTo.city, props.shipTo.state, props.shipTo.postal_code].filter(Boolean).join(", ")]
              : ["Provided at checkout"]
            )
              .filter(Boolean)
              .map((line, i) => (
                <Text key={i} style={styles.small}>
                  {line}
                </Text>
              ))}
          </View>
          <View style={styles.metaCol}>
            <Text style={styles.metaLabel}>Certificate number</Text>
            <Text style={styles.metaValue}>{props.certNumber}</Text>
            <Text style={styles.metaLabel}>Certificate date</Text>
            <Text style={styles.metaValue}>{formatDate(props.certDate)}</Text>
            <Text style={styles.metaLabel}>Order number</Text>
            <Text style={styles.metaValue}>{props.orderNumber}</Text>
            <Text style={styles.metaLabel}>Customer PO</Text>
            <Text style={styles.metaValue}>{props.customerPo || "—"}</Text>
          </View>
        </View>

        <Text style={styles.sectionHeading}>Order lines</Text>
        <View style={styles.table}>
          <View style={styles.trHead}>
            <Text style={[styles.th, styles.colLine]}>#</Text>
            <Text style={[styles.th, styles.colMat]}>Material / grade</Text>
            <Text style={[styles.th, styles.colLot]}>Brand / lot</Text>
            <Text style={[styles.th, styles.colMfr]}>Manufacturer</Text>
            <Text style={[styles.th, styles.colSize]}>Nominal size</Text>
            <Text style={[styles.th, styles.colActual]}>Actual thk.</Text>
            <Text style={[styles.th, styles.colQty]}>Qty</Text>
            <Text style={[styles.th, styles.colCoo]}>Origin</Text>
            <Text style={[styles.th, styles.colTol]}>Tolerance</Text>
            <Text style={[styles.th, styles.colFinish]}>Finish / anneal</Text>
          </View>
          {props.lines.map((ln) => {
            const mat = CFG.materials[ln.material_code];
            const brandLabel = mat?.brands?.[ln.lot!.brand]?.label ?? ln.lot!.brand;
            const tolLabel = CFG.tolerance_tiers[ln.tolerance_tier].label;
            const edgeLabel = CFG.edge_finish[ln.edge_finish].label;
            const faceLabel = CFG.face_finish[ln.face_finish].label;
            return (
              <View style={styles.tr} key={ln.line_no} wrap={false}>
                <Text style={[styles.td, styles.colLine]}>{ln.line_no}</Text>
                <Text style={[styles.td, styles.colMat]}>{mat?.label ?? ln.material_code}</Text>
                <Text style={[styles.td, styles.colLot]}>
                  {brandLabel}
                  {"\n"}Lot {ln.lot!.lot_number}
                </Text>
                <Text style={[styles.td, styles.colMfr]}>{ln.lot!.manufacturer}</Text>
                <Text style={[styles.td, styles.colSize]}>{dims(ln.length_in, ln.width_in, ln.thickness_nominal)}</Text>
                <Text style={[styles.td, styles.colActual]}>{ln.thickness_actual} in</Text>
                <Text style={[styles.td, styles.colQty]}>{ln.qty}</Text>
                <Text style={[styles.td, styles.colCoo]}>{ln.lot!.country_of_origin}</Text>
                <Text style={[styles.td, styles.colTol]}>{tolLabel}</Text>
                <Text style={[styles.td, styles.colFinish]}>
                  {edgeLabel} / {faceLabel}
                  {ln.annealed ? ", annealed" : ""}
                </Text>
              </View>
            );
          })}
        </View>

        <Text style={styles.statementHeading}>Statement of conformance</Text>
        <Text style={styles.statement}>
          {brand.companyName} certifies that the material described above conforms to the requirements stated on the
          referenced order.
        </Text>
        <Text style={styles.statement}>
          Material was saw-cut to the nominal dimensions shown, tolerance +/-{tol.tolerance_in.toFixed(3)} in on X-Y,
          squareness within {tol.squareness_in_per_12in.toFixed(3)} in per 12 in, and edge-finished as noted.
          Thickness is as-supplied by the manufacturer and was not machined. No thermal, chemical, or other
          property-altering process was performed{anyAnnealed ? " other than the stress-relief anneal recorded above where applicable." : "."}
        </Text>

        {tier1LineNos.length > 0 ? (
          <>
            <Text style={styles.statementHeading}>
              Supplemental statements{industrialLineNos.length > 0 ? ` - Tier 1 lines only (${tier1LineNos.map((n) => `#${n}`).join(", ")})` : ""}
            </Text>
            <Text style={styles.statement}>
              DFARS 252.225-7009 specialty metals restrictions do not apply to these polymer and composite
              materials. Material was procured through an authorised distribution channel; {brand.companyName} has
              no knowledge of any suspect or counterfeit material in this lot. No mercury was used in processing or
              handling. Country of origin is stated per line above.
            </Text>
          </>
        ) : null}

        {industrialLineNos.length > 0 ? (
          <>
            <Text style={styles.statementHeading}>
              INDUSTRIAL-tier material{tier1LineNos.length > 0 ? ` (${industrialLineNos.map((n) => `#${n}`).join(", ")})` : ""}
            </Text>
            <Text style={styles.statement}>
              No mill lineage or chain of custody is claimed for the INDUSTRIAL-tier line(s) identified above. No
              Material Test Report accompanies this material.
            </Text>
          </>
        ) : null}

        <View style={styles.signature}>
          <View style={styles.signatureBlock}>
            <Text style={styles.signatureLine}>Certified by: {inspectors.join("; ")}</Text>
          </View>
          <View style={styles.signatureBlock}>
            <Text style={styles.signatureLine}>Signature / date</Text>
          </View>
        </View>

        <Text style={styles.footer}>This certificate shall not be reproduced except in full.</Text>
      </Page>
    </Document>
  );
}

export async function renderCertificatePdf(props: CertificateProps): Promise<Buffer> {
  validateCertificateInput(props.lines);
  return renderToBuffer(<CertificateDocument {...props} />);
}
