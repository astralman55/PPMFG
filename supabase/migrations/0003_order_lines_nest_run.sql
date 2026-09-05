-- A committed nest run must take its lines off the nest board's pending
-- queue - see CLAUDE_CODE_BRIEF.md §10 "Nest board." lot_id can't be
-- reused for this: it's set later, per line, during fulfilment (measured
-- actual thickness, cutter, inspector - CLAUDE_CODE_BRIEF.md §10
-- "Fulfilment"), which can happen well after several orders have already
-- been nested and cut together. This column marks "already claimed by a
-- nest run" independently of "already fulfilled."

alter table order_lines add column if not exists nest_run_id uuid references nest_runs(id);
