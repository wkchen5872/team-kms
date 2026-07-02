-- Readability views: each projects only the columns relevant to its kind.
-- For browsing / ad-hoc queries; the app data layer still reads base tables.

create view sources as
select
    d.id, d.knowledge_base_id, d.user_id, d.filename, d.title, d.path,
    d.file_type, d.file_size, d.status, d.page_count, d.content, d.file_hash,
    dr.parser, dr.error_message,
    d.created_at, d.updated_at
from documents d
left join document_raw dr on dr.document_id = d.id
where d.kind = 'raw' and not d.archived;

create view wiki_pages as
select
    d.id, d.knowledge_base_id, d.user_id, d.filename, d.title, d.path,
    d.file_type, d.content, d.tags, d.date, d.metadata, d.version,
    d.stale_since, d.created_at, d.updated_at
from documents d
where d.kind = 'wiki' and not d.archived;

grant select on sources to service_role;
grant select on wiki_pages to service_role;
