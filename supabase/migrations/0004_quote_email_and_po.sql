-- CLAUDE_CODE_BRIEF.md §20.4/§20.5 (Phase 12): the "email me this quote"
-- rate-limit timestamp, and the purchase-order-upload attachment path, plus
-- the private storage bucket that upload lives in.

alter table quotes add column if not exists emailed_at timestamptz;
alter table quotes add column if not exists po_upload_path text;

insert into storage.buckets (id, name, public)
values ('purchase-orders', 'purchase-orders', false)
on conflict (id) do nothing;
