-- Drop the unused documents.url column.
-- 'url' stored the source URL of Chrome-extension web clips; that feature was
-- dropped in this port, so the column is always NULL. Forward-only drop.
ALTER TABLE documents DROP COLUMN IF EXISTS url;
