-- Upload dedup: SHA-256 of the original uploaded bytes, computed at ingest.
-- Not unique (same bytes may live in different KBs; existing rows stay NULL).
alter table documents add column file_hash text;

-- Lookup index for per-KB dedup checks.
create index idx_documents_kb_file_hash on documents(knowledge_base_id, file_hash)
  where file_hash is not null;
