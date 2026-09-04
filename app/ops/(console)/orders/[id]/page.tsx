"use client";

import { use, useEffect, useState } from "react";
import cfgJson from "@/lib/pricing/config.json";
import type { PricingConfig } from "@/lib/pricing/engine";

const CFG = cfgJson as unknown as PricingConfig;

interface Lot {
  id: string;
  lot_number: string;
  brand: string;
  manufacturer: string;
  certification_tier: string;
  thickness_nominal: number;
  mtr_path: string | null;
}
interface OrderLine {
  id: string;
  line_no: number;
  part_ref: string | null;
  material_code: string;
  brand: string;
  certification_tier: string;
  tolerance_tier: string;
  edge_finish: string;
  face_finish: string;
  annealed: boolean;
  length_in: number;
  width_in: number;
  thickness_nominal: number;
  thickness_actual: number | null;
  qty: number;
  lot_id: string | null;
  inspected_by: string | null;
  assignedLot: Lot | null;
  candidateLots: Lot[];
}
interface OrderDetail {
  order: {
    id: string;
    order_number: string;
    status: string;
    promised_ship_date: string | null;
    customer_po: string | null;
    tracking_number: string | null;
    carrier: string | null;
    invoice_path: string | null;
  };
  customer: { email: string; company: string | null } | null;
  lines: OrderLine[];
  remnants: { id: string; length_in: number; width_in: number; thickness_nominal: number; location_tag: string | null }[];
}

export default function FulfilmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function refresh() {
    fetch(`/api/ops/orders/${id}`)
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setData(d)));
  }
  useEffect(refresh, [id]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return <p className="text-sm text-neutral-500">Loading...</p>;

  const { order, customer, lines, remnants } = data;
  const allAssigned = lines.every((l) => l.lot_id);
  const assignedLots = Array.from(new Map(lines.filter((l) => l.assignedLot).map((l) => [l.assignedLot!.id, l.assignedLot!])).values());

  return (
    <div>
      <h1 className="text-xl font-semibold font-mono">{order.order_number}</h1>
      <p className="mt-1 text-sm text-neutral-500">
        {customer?.company || customer?.email} - status: {order.status} - promised ship {order.promised_ship_date ?? "TBD"}
      </p>
      <p className="mt-2 text-sm">
        {order.invoice_path ? (
          <a href={`/api/ops/orders/${id}/invoice`} target="_blank" rel="noreferrer" className="text-amber-700 hover:underline dark:text-amber-500">
            View original invoice
          </a>
        ) : (
          <span className="text-neutral-400">No invoice archived for this order.</span>
        )}
      </p>
      {notice ? <p className="mt-3 text-sm text-green-700 dark:text-green-500">{notice}</p> : null}

      <h2 className="mt-8 text-sm font-medium text-neutral-500">Lines</h2>
      <div className="mt-3 flex flex-col gap-4">
        {lines.map((line) => (
          <LineCard key={line.id} orderId={id} line={line} onAssigned={() => { setNotice(`Line ${line.line_no} assigned.`); refresh(); }} />
        ))}
      </div>

      <RemnantForm orderId={id} lots={assignedLots} remnants={remnants} onLogged={refresh} />

      <PacketAndShip
        orderId={id}
        allAssigned={allAssigned}
        status={order.status}
        onCertified={() => { setNotice("Certification packet sent."); refresh(); }}
        onShipped={() => { setNotice("Order marked shipped."); refresh(); }}
      />
    </div>
  );
}

function LineCard({ orderId, line, onAssigned }: { orderId: string; line: OrderLine; onAssigned: () => void }) {
  const [lotId, setLotId] = useState("");
  const [thicknessActual, setThicknessActual] = useState("");
  const [cutBy, setCutBy] = useState("");
  const [inspectedBy, setInspectedBy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const mat = CFG.materials[line.material_code];

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await fetch(`/api/ops/orders/${orderId}/lines/${line.id}/assign`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lot_id: lotId, thickness_actual: Number(thicknessActual), cut_by: cutBy, inspected_by: inspectedBy }),
    });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(d.error);
      return;
    }
    onAssigned();
  }

  return (
    <div className="rounded border border-neutral-200 p-4 text-sm dark:border-neutral-800">
      <div className="flex items-baseline justify-between">
        <span className="font-medium">
          #{line.line_no} {mat?.label ?? line.material_code} - {line.length_in} x {line.width_in} x {line.thickness_nominal} in x{line.qty}
        </span>
        {line.part_ref ? <span className="text-xs text-neutral-500">{line.part_ref}</span> : null}
      </div>
      <p className="mt-1 text-xs text-neutral-500">
        {line.brand === "GENERIC" ? "Any approved source" : mat?.brands?.[line.brand]?.label} /{" "}
        {CFG.certification_tiers[line.certification_tier]?.label} / {CFG.tolerance_tiers[line.tolerance_tier]?.label}
      </p>

      {line.assignedLot ? (
        <div className="mt-3 flex items-center gap-3 rounded bg-neutral-50 px-3 py-2 text-xs dark:bg-neutral-900">
          <span>
            Lot <strong className="font-mono">{line.assignedLot.lot_number}</strong> ({line.assignedLot.manufacturer}) - measured{" "}
            {line.thickness_actual} in - inspected by {line.inspected_by}
          </span>
          {!line.assignedLot.mtr_path ? <span className="text-red-600">No MTR on file</span> : null}
        </div>
      ) : (
        <form onSubmit={handleAssign} className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <select
            required
            value={lotId}
            onChange={(e) => setLotId(e.target.value)}
            className="col-span-2 rounded border border-neutral-300 px-2 py-1.5 text-xs dark:border-neutral-700 dark:bg-neutral-900 sm:col-span-1"
          >
            <option value="" disabled>
              Lot
            </option>
            {line.candidateLots.map((lot) => (
              <option key={lot.id} value={lot.id}>
                {lot.lot_number} ({lot.manufacturer}){!lot.mtr_path ? " - no MTR" : ""}
              </option>
            ))}
          </select>
          <input
            required
            type="number"
            step="0.0001"
            placeholder="Measured actual (in)"
            value={thicknessActual}
            onChange={(e) => setThicknessActual(e.target.value)}
            className="rounded border border-neutral-300 px-2 py-1.5 text-xs dark:border-neutral-700 dark:bg-neutral-900"
          />
          <input
            required
            placeholder="Cut by"
            value={cutBy}
            onChange={(e) => setCutBy(e.target.value)}
            className="rounded border border-neutral-300 px-2 py-1.5 text-xs dark:border-neutral-700 dark:bg-neutral-900"
          />
          <input
            required
            placeholder="Inspected by"
            value={inspectedBy}
            onChange={(e) => setInspectedBy(e.target.value)}
            className="rounded border border-neutral-300 px-2 py-1.5 text-xs dark:border-neutral-700 dark:bg-neutral-900"
          />
          <button
            type="submit"
            disabled={busy || line.candidateLots.length === 0}
            className="rounded bg-neutral-900 px-2 py-1.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          >
            Assign
          </button>
          {line.candidateLots.length === 0 ? (
            <p className="col-span-full text-xs text-red-600">No matching lot in the library yet.</p>
          ) : null}
          {error ? <p className="col-span-full text-xs text-red-600">{error}</p> : null}
        </form>
      )}
    </div>
  );
}

function RemnantForm({
  orderId,
  lots,
  remnants,
  onLogged,
}: {
  orderId: string;
  lots: Lot[];
  remnants: OrderDetail["remnants"];
  onLogged: () => void;
}) {
  const [lotId, setLotId] = useState("");
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [thickness, setThickness] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch(`/api/ops/orders/${orderId}/remnants`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        lot_id: lotId,
        length_in: Number(length),
        width_in: Number(width),
        thickness_nominal: Number(thickness),
        location_tag: location,
      }),
    });
    const d = await res.json();
    if (!res.ok) {
      setError(d.error);
      return;
    }
    setLength("");
    setWidth("");
    setThickness("");
    setLocation("");
    onLogged();
  }

  if (lots.length === 0) return null;

  return (
    <div className="mt-8">
      <h2 className="text-sm font-medium text-neutral-500">Remnants from this order</h2>
      {remnants.length > 0 ? (
        <ul className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">
          {remnants.map((r) => (
            <li key={r.id}>
              {r.length_in} x {r.width_in} x {r.thickness_nominal} in {r.location_tag ? `- ${r.location_tag}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
      <form onSubmit={handleSubmit} className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <select
          required
          value={lotId}
          onChange={(e) => setLotId(e.target.value)}
          className="col-span-2 rounded border border-neutral-300 px-2 py-1.5 text-xs dark:border-neutral-700 dark:bg-neutral-900 sm:col-span-1"
        >
          <option value="" disabled>
            Lot
          </option>
          {lots.map((l) => (
            <option key={l.id} value={l.id}>
              {l.lot_number}
            </option>
          ))}
        </select>
        <input required type="number" step="0.01" placeholder="Length (in)" value={length} onChange={(e) => setLength(e.target.value)} className="rounded border border-neutral-300 px-2 py-1.5 text-xs dark:border-neutral-700 dark:bg-neutral-900" />
        <input required type="number" step="0.01" placeholder="Width (in)" value={width} onChange={(e) => setWidth(e.target.value)} className="rounded border border-neutral-300 px-2 py-1.5 text-xs dark:border-neutral-700 dark:bg-neutral-900" />
        <input required type="number" step="0.001" placeholder="Thickness (in)" value={thickness} onChange={(e) => setThickness(e.target.value)} className="rounded border border-neutral-300 px-2 py-1.5 text-xs dark:border-neutral-700 dark:bg-neutral-900" />
        <input placeholder="Rack location" value={location} onChange={(e) => setLocation(e.target.value)} className="rounded border border-neutral-300 px-2 py-1.5 text-xs dark:border-neutral-700 dark:bg-neutral-900" />
        <button type="submit" className="rounded bg-neutral-900 px-2 py-1.5 text-xs font-medium text-white dark:bg-neutral-100 dark:text-neutral-900">
          Log remnant
        </button>
      </form>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

function PacketAndShip({
  orderId,
  allAssigned,
  status,
  onCertified,
  onShipped,
}: {
  orderId: string;
  allAssigned: boolean;
  status: string;
  onCertified: () => void;
  onShipped: () => void;
}) {
  const [tracking, setTracking] = useState("");
  const [carrier, setCarrier] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"send" | "ship" | null>(null);

  async function handleSend() {
    setError(null);
    setBusy("send");
    const res = await fetch(`/api/ops/orders/${orderId}/packet/send`, { method: "POST" });
    const d = await res.json();
    setBusy(null);
    if (!res.ok) {
      setError(d.error);
      return;
    }
    onCertified();
  }

  async function handleShip(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy("ship");
    const res = await fetch(`/api/ops/orders/${orderId}/ship`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tracking_number: tracking, carrier }),
    });
    const d = await res.json();
    setBusy(null);
    if (!res.ok) {
      setError(d.error);
      return;
    }
    onShipped();
  }

  return (
    <div className="mt-10 border-t border-neutral-200 pt-6 dark:border-neutral-800">
      <h2 className="text-sm font-medium text-neutral-500">Certification Packet</h2>
      {!allAssigned ? <p className="mt-2 text-sm text-neutral-500">Assign a lot to every line first.</p> : null}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <a
          href={`/api/ops/orders/${orderId}/packet/preview`}
          target="_blank"
          rel="noreferrer"
          className={`rounded border border-neutral-300 px-4 py-2 text-sm dark:border-neutral-700 ${!allAssigned ? "pointer-events-none opacity-50" : ""}`}
        >
          Preview packet
        </a>
        <button
          onClick={handleSend}
          disabled={!allAssigned || busy !== null || status === "shipped"}
          className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {busy === "send" ? "Sending..." : "Send certification packet"}
        </button>
      </div>

      <h2 className="mt-8 text-sm font-medium text-neutral-500">Ship</h2>
      <form onSubmit={handleShip} className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs">
          Tracking number
          <input
            required
            value={tracking}
            onChange={(e) => setTracking(e.target.value)}
            className="rounded border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Carrier
          <input
            required
            value={carrier}
            onChange={(e) => setCarrier(e.target.value)}
            className="rounded border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        <button
          type="submit"
          disabled={!allAssigned || busy !== null || status === "shipped"}
          className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {busy === "ship" ? "Marking shipped..." : "Mark shipped"}
        </button>
      </form>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
