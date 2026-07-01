-- Raw-only processing/audit fields moved out of the base documents table (CTI).
-- 1:1 with documents; page_count stays on base (hot-path listing/read).
create table document_raw (
    document_id uuid primary key references documents(id) on delete cascade,
    parser text,
    error_message text
);

-- Project-wide policy: services connect as service_role only (see supabase-migrations rule).
grant select, insert, update, delete on document_raw to service_role;
alter table document_raw enable row level security;

-- Backfill: copy existing raw-doc processing fields into the detail table.
insert into document_raw (document_id, parser, error_message)
select id, parser, error_message
from documents
where parser is not null or error_message is not null;

-- NOTE: base columns documents.parser / documents.error_message are dropped in a
-- later (contract) migration, after the application layer is updated to write/read
-- document_raw. This keeps live services working during the transition.
