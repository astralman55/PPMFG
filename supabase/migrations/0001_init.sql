-- Initial schema for the fractional-cut plastics storefront.
-- Source: CLAUDE_CODE_BRIEF.md §6 DATA MODEL.
-- NOT YET APPLIED. Run this against a real Supabase project only after
-- reviewing it and confirming RLS policies separately — this file defines
-- tables only, per the brief's Phase 0 scope.

create table quotes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  request_json jsonb not null,
  result_json  jsonb not null,
  subtotal_cents integer not null,
  shipping_cents integer not null,
  total_cents    integer not null,
  promised_ship_date date not null,
  config_version text not null,
  consumed_at timestamptz,
  email text, company text
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  stripe_customer_id text unique,
  email text not null, company text, phone text,
  resale_cert_status text not null default 'none',
  resale_cert_path text, resale_cert_expires date,
  approved_vendor_list jsonb,      -- brands this customer's AVL permits
  created_at timestamptz not null default now()
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  order_number text unique not null,
  quote_id uuid references quotes(id),
  customer_id uuid references customers(id),
  stripe_session_id text unique not null,
  stripe_payment_intent text,
  status text not null default 'paid',
     -- paid | queued_for_nest | in_production | certified | shipped | cancelled
  customer_po text,
  ship_address jsonb not null,
  amount_paid_cents integer not null,
  tax_cents integer not null default 0,
  promised_ship_date date,
  nest_group_key text,
  tracking_number text, carrier text,
  invoice_path text, packet_path text,
  created_at timestamptz not null default now(),
  shipped_at timestamptz
);

create table lots (
  id uuid primary key default gen_random_uuid(),
  lot_number text not null,
  material_code text not null,
  brand text not null,                       -- must match config brands key
  certification_tier text not null,
  manufacturer text not null,
  distributor text, distributor_po text,
  country_of_origin text,
  thickness_nominal numeric not null,
  received_date date not null,
  mtr_path text, mtr_uploaded_at timestamptz,
  resin_cert_path text,
  qty_received_in2 numeric, qty_remaining_in2 numeric,
  notes text,
  unique (lot_number, material_code, thickness_nominal)
);

create table order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  line_no integer not null, part_ref text,
  material_code text not null,
  brand text not null default 'GENERIC',
  certification_tier text not null,
  tolerance_tier text not null,
  edge_finish text not null, face_finish text not null,
  annealed boolean not null default false,
  add_ons jsonb,
  length_in numeric not null, width_in numeric not null,
  thickness_nominal numeric not null, thickness_actual numeric,
  qty integer not null,
  lot_id uuid references lots(id),
  cut_by text, cut_at timestamptz, inspected_by text,
  anneal_cycle_id uuid
);

create table nest_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  group_key jsonb not null,
  plan_json jsonb not null,
  sheet_count integer not null,
  utilisation numeric not null,
  recoverable_fraction numeric not null,
  executed_at timestamptz
);

create table remnants (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid references lots(id) not null,
  parent_order_id uuid references orders(id),
  nest_run_id uuid references nest_runs(id),
  length_in numeric not null, width_in numeric not null,
  thickness_nominal numeric not null,
  location_tag text,
  created_at timestamptz not null default now(),
  consumed_at timestamptz, consumed_order_id uuid references orders(id)
);

create table webhook_events (
  id text primary key, type text not null,
  processed_at timestamptz not null default now()
);
