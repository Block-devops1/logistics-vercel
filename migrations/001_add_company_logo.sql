-- Migration: add logo columns to companies
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS logo_path text;

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS logo_url text;

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS logo_uploaded_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_companies_logo_path ON companies (logo_path);
