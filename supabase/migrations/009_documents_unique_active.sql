-- Restore the (kb, path, filename) uniqueness the VaultFS relies on for
-- create-vs-overwrite semantics. The upstream llmwiki code catches a violation
-- on the constraint name `idx_documents_unique_active`, but the public
-- migrations never created it. Add it as a partial unique index over active
-- (non-archived) documents so archived duplicates don't block re-creation.
CREATE UNIQUE INDEX idx_documents_unique_active
    ON documents (knowledge_base_id, path, filename)
    WHERE NOT archived;
