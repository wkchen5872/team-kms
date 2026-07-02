-- Document classification: restore upstream's clean source_kind as `kind`.
-- Replaces the ad-hoc metadata->>'asset' flag with a first-class column.
alter table documents add column kind text;

-- Backfill existing rows: /wiki/* → wiki, everything else → raw
-- (uploaded sources, including previously failed images, are raw).
update documents set kind = case when path like '/wiki/%' then 'wiki' else 'raw' end;

alter table documents
  alter column kind set default 'raw',
  alter column kind set not null,
  add constraint documents_kind_check check (kind in ('raw', 'wiki', 'asset'));

create index idx_documents_kind on documents(kind);
