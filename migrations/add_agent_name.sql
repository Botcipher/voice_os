-- Migration: add agent_name column to settings table
-- Run this once in your Supabase SQL editor if the settings table already exists.
-- If you are starting fresh, schema.sql and settings.sql already include this column.

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS agent_name TEXT DEFAULT 'Sarah';
