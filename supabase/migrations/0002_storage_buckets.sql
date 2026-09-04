-- Private storage buckets for compliance documents - see CLAUDE_CODE_BRIEF.md
-- §6: "Private storage buckets: mtr/, resin-certs/, certs/, invoices/,
-- resale-certs/."
--
-- All five are private (public = false). Nothing reads or writes them except
-- the service-role key from server-side code (lib/supabase/storage.ts) -
-- same access model as the RLS-locked-down tables in 0001_init.sql. Files are
-- served to the browser only via short-lived signed URLs generated on demand.

insert into storage.buckets (id, name, public)
values
  ('mtr', 'mtr', false),
  ('resin-certs', 'resin-certs', false),
  ('certs', 'certs', false),
  ('invoices', 'invoices', false),
  ('resale-certs', 'resale-certs', false)
on conflict (id) do nothing;
