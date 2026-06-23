-- Delivery status tracking for public waybill verification.
-- Run this in the Supabase SQL editor (the repo has no migration runner).
--
-- status flows: registered -> in_transit -> out_for_delivery -> delivered
-- status_updated_at records when the courier last advanced the status.
alter table waybill_index
  add column if not exists status text not null default 'registered',
  add column if not exists status_updated_at timestamptz;
