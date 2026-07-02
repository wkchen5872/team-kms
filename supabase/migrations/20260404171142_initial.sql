-- ─────────────────────────────────────────────────────────────────────────
-- Team KMS — consolidated baseline schema.
-- Squashed from the original 13 migrations (pre-launch). Reproduces the exact
-- end-state (no semantic change); columns ordered logically for readability:
--   id → foreign keys → domain columns → status/kind → metadata → timestamps.
-- Per .claude/rules/supabase-migrations.md every public table grants to
-- service_role and enables RLS (services connect as service_role only).
-- ─────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pgroonga;

CREATE TYPE document_status AS ENUM ('pending', 'processing', 'ready', 'failed', 'archived');

-- ── users ──────────────────────────────────────────────────────────────
CREATE TABLE users (
    id UUID PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT,
    onboarded BOOLEAN NOT NULL DEFAULT false,
    page_limit INTEGER NOT NULL DEFAULT 500,
    storage_limit_bytes BIGINT NOT NULL DEFAULT 1073741824,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── api_keys ───────────────────────────────────────────────────────────
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT,
    key_hash TEXT NOT NULL UNIQUE,
    key_prefix TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ
);

-- ── knowledge_bases ────────────────────────────────────────────────────
CREATE TABLE knowledge_bases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, slug),
    UNIQUE(user_id, name)
);

-- ── documents ──────────────────────────────────────────────────────────
-- Hot-path table. Raw-only processing fields (parser/error_message) live in
-- document_raw (CTI). kind classifies raw source vs wiki page vs asset.
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    knowledge_base_id UUID NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    filename TEXT NOT NULL,
    title TEXT,
    path TEXT NOT NULL DEFAULT '/',
    file_type TEXT NOT NULL,
    file_size BIGINT NOT NULL DEFAULT 0,
    file_hash TEXT,
    content TEXT,
    tags TEXT[] NOT NULL DEFAULT '{}',
    date TEXT,
    document_number INTEGER,
    page_count INTEGER CHECK (page_count IS NULL OR page_count <= 300),
    kind TEXT NOT NULL DEFAULT 'raw' CHECK (kind IN ('raw', 'wiki', 'asset')),
    status document_status NOT NULL DEFAULT 'pending',
    version INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    metadata JSONB,
    archived BOOLEAN NOT NULL DEFAULT false,
    stale_since TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1:1 detail table for raw-only processing/audit fields.
CREATE TABLE document_raw (
    document_id UUID PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
    parser TEXT,
    error_message TEXT
);

-- ── document_pages ─────────────────────────────────────────────────────
CREATE TABLE document_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    page INTEGER NOT NULL,
    content TEXT NOT NULL CHECK (length(content) <= 500000),
    elements JSONB,
    UNIQUE(document_id, page)
);

-- ── document_chunks ────────────────────────────────────────────────────
CREATE TABLE document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    knowledge_base_id UUID NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL CHECK (length(content) <= 10000),
    page INTEGER,
    start_char INTEGER,
    token_count INTEGER NOT NULL,
    header_breadcrumb TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(document_id, chunk_index)
);

-- ── document_references (citation / cross-reference graph) ──────────────
CREATE TABLE document_references (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    target_document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    knowledge_base_id UUID NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
    reference_type TEXT NOT NULL CHECK (reference_type IN ('cites', 'links_to')),
    page INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(source_document_id, target_document_id, reference_type)
);

-- ── indexes ────────────────────────────────────────────────────────────
CREATE INDEX idx_documents_knowledge_base_id ON documents(knowledge_base_id);
CREATE INDEX idx_documents_user_id ON documents(user_id);
CREATE INDEX idx_documents_tags ON documents USING GIN(tags);
CREATE INDEX idx_documents_kb_path ON documents(knowledge_base_id, path);
CREATE INDEX idx_documents_kb_status ON documents(knowledge_base_id, status) WHERE NOT archived;
CREATE INDEX idx_documents_date ON documents(date) WHERE date IS NOT NULL;
CREATE INDEX idx_documents_kind ON documents(kind);
CREATE INDEX idx_documents_kb_file_hash ON documents(knowledge_base_id, file_hash) WHERE file_hash IS NOT NULL;
CREATE UNIQUE INDEX idx_documents_kb_number ON documents(knowledge_base_id, document_number);
CREATE UNIQUE INDEX idx_documents_unique_active ON documents(knowledge_base_id, path, filename) WHERE NOT archived;
CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX idx_chunks_kb ON document_chunks(knowledge_base_id);
CREATE INDEX idx_chunks_doc ON document_chunks(document_id);
CREATE INDEX idx_document_references_source ON document_references(source_document_id);
CREATE INDEX idx_document_references_target ON document_references(target_document_id);
CREATE INDEX idx_document_references_kb ON document_references(knowledge_base_id);
CREATE INDEX idx_chunks_content_pgroonga ON document_chunks USING pgroonga (content);
CREATE INDEX idx_documents_content_pgroonga ON documents USING pgroonga (content);

-- ── row-level security ─────────────────────────────────────────────────
-- Scoped* reads via auth.uid(); all writes go through service_role (bypasses RLS).
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_bases ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_raw ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_references ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_select ON users FOR SELECT USING (id = auth.uid());
CREATE POLICY users_update ON users FOR UPDATE USING (id = auth.uid());
CREATE POLICY api_keys_select ON api_keys FOR SELECT USING (user_id = auth.uid());
CREATE POLICY knowledge_bases_select ON knowledge_bases FOR SELECT USING (user_id = auth.uid());
CREATE POLICY documents_select ON documents FOR SELECT USING (user_id = auth.uid());
CREATE POLICY document_pages_select ON document_pages
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM documents WHERE documents.id = document_pages.document_id AND documents.user_id = auth.uid())
    );
CREATE POLICY document_chunks_select ON document_chunks FOR SELECT USING (user_id = auth.uid());
CREATE POLICY document_references_select ON document_references
    FOR SELECT TO authenticated
    USING (knowledge_base_id IN (SELECT id FROM knowledge_bases WHERE user_id = auth.uid()));
CREATE POLICY document_references_write ON document_references
    FOR ALL TO authenticated
    USING (knowledge_base_id IN (SELECT id FROM knowledge_bases WHERE user_id = auth.uid()))
    WITH CHECK (knowledge_base_id IN (SELECT id FROM knowledge_bases WHERE user_id = auth.uid()));

-- ── grants (service_role only; see supabase-migrations rule) ────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON users TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON api_keys TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON knowledge_bases TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON documents TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON document_raw TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON document_pages TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON document_chunks TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON document_references TO service_role;

-- ── functions ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION generate_slug(name TEXT, p_user_id UUID)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
    base_slug TEXT;
    candidate TEXT;
    counter INTEGER := 0;
BEGIN
    base_slug := lower(regexp_replace(trim(name), '[^a-zA-Z0-9]+', '-', 'g'));
    base_slug := trim(both '-' from base_slug);
    IF base_slug = '' THEN
        base_slug := 'untitled';
    END IF;
    candidate := base_slug;
    LOOP
        IF NOT EXISTS (SELECT 1 FROM knowledge_bases WHERE slug = candidate AND user_id = p_user_id) THEN
            RETURN candidate;
        END IF;
        counter := counter + 1;
        candidate := base_slug || '-' || counter;
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    INSERT INTO public.users (id, email, display_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data ->> 'display_name', NEW.raw_user_meta_data ->> 'full_name')
    );
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION set_knowledge_base_slug()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.slug IS NULL OR NEW.slug = '' THEN
        NEW.slug := generate_slug(NEW.name, NEW.user_id);
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION set_document_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext(NEW.knowledge_base_id::text));
    NEW.document_number := COALESCE(
        (SELECT MAX(document_number) FROM documents WHERE knowledge_base_id = NEW.knowledge_base_id),
        0
    ) + 1;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION notify_document_change() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM pg_notify('document_changes', json_build_object(
      'event', TG_OP, 'id', OLD.id::text,
      'knowledge_base_id', OLD.knowledge_base_id::text, 'user_id', OLD.user_id::text
    )::text);
    RETURN OLD;
  ELSE
    PERFORM pg_notify('document_changes', json_build_object(
      'event', TG_OP, 'id', NEW.id::text,
      'knowledge_base_id', NEW.knowledge_base_id::text, 'user_id', NEW.user_id::text
    )::text);
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ── triggers ───────────────────────────────────────────────────────────
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

CREATE TRIGGER set_knowledge_base_slug
    BEFORE INSERT ON knowledge_bases
    FOR EACH ROW EXECUTE FUNCTION set_knowledge_base_slug();

CREATE TRIGGER set_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_knowledge_bases_updated_at
    BEFORE UPDATE ON knowledge_bases
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_documents_updated_at
    BEFORE UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_document_number
    BEFORE INSERT ON documents
    FOR EACH ROW EXECUTE FUNCTION set_document_number();

CREATE TRIGGER document_change_trigger
    AFTER INSERT OR UPDATE OR DELETE ON documents
    FOR EACH ROW EXECUTE FUNCTION notify_document_change();

-- ── readability views (browsing/ad-hoc; app reads base tables) ──────────
CREATE VIEW sources AS
SELECT
    d.id, d.knowledge_base_id, d.user_id, d.filename, d.title, d.path,
    d.file_type, d.file_size, d.status, d.page_count, d.content, d.file_hash,
    dr.parser, dr.error_message,
    d.created_at, d.updated_at
FROM documents d
LEFT JOIN document_raw dr ON dr.document_id = d.id
WHERE d.kind = 'raw' AND NOT d.archived;

CREATE VIEW wiki_pages AS
SELECT
    d.id, d.knowledge_base_id, d.user_id, d.filename, d.title, d.path,
    d.file_type, d.content, d.tags, d.date, d.metadata, d.version,
    d.stale_since, d.created_at, d.updated_at
FROM documents d
WHERE d.kind = 'wiki' AND NOT d.archived;

GRANT SELECT ON sources TO service_role;
GRANT SELECT ON wiki_pages TO service_role;
