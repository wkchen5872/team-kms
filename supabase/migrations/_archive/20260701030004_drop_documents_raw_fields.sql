-- Contract step (expand-contract): raw processing fields now live in document_raw.
-- Applied after the application layer was updated to write/read document_raw, so no
-- live query references these base columns anymore.
alter table documents drop column parser;
alter table documents drop column error_message;
