-- Per-KB "project prompt": a free-text authoring-preference overlay that the MCP
-- `guide` tool appends on top of the global prompts/guide.md for that knowledge
-- base. Team-shared (server-side, per KB), steers wiki authoring only — not ingest.
--
-- Adding a column to an existing table: it inherits knowledge_bases' existing
-- grants, so no GRANT/RLS block is needed (per supabase-migrations rule, only
-- CREATE TABLE requires re-granting).
ALTER TABLE public.knowledge_bases ADD COLUMN IF NOT EXISTS project_prompt text;
