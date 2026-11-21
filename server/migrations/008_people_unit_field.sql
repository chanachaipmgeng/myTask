-- Migration 008: ฝ่ายย่อยจาก OpenProject customField2
ALTER TABLE people ADD COLUMN IF NOT EXISTS unit text;
