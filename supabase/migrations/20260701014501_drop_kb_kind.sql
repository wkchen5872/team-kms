-- Drop the unused knowledge_bases.kind column added in 008.
-- 'course' was never given any distinct behaviour (same page format as 'wiki'),
-- so the column is dead config. Forward-only drop keeps existing data intact.
ALTER TABLE knowledge_bases DROP COLUMN IF EXISTS kind;
