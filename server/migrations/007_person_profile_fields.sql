-- Migration 007: Add avatar_url, department, and job_title to people table
ALTER TABLE people ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE people ADD COLUMN IF NOT EXISTS department text;
ALTER TABLE people ADD COLUMN IF NOT EXISTS job_title text;
