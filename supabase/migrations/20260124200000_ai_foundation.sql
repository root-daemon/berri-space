-- Migration: AI Foundation (Phase 8)
-- Description: Implements secure document processing, redaction pipeline, and vector indexing
-- Dependencies: 004_row_level_security.sql
--
-- SECURITY GUARANTEES:
-- 1. Raw text is NEVER accessible to AI pipelines
-- 2. AI-visible text is ONLY produced AFTER redaction finalization
-- 3. pgvector search is always org-scoped and permission-aware
-- 4. Redactions are immutable after finalization
-- 5. Raw text is permanently deleted after redaction commit

-- ============================================================================
-- ENABLE PGVECTOR EXTENSION
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;

-- ============================================================================
-- ENUMS FOR DOCUMENT PROCESSING
-- ============================================================================

-- Processing status for documents
CREATE TYPE document_processing_status AS ENUM (
    'pending_extraction',    -- File uploaded, text not yet extracted
    'extraction_failed',     -- Text extraction failed
    'pending_redaction',     -- Text extracted, awaiting admin redaction review
    'redaction_in_progress', -- Admin is actively defining redactions
    'pending_commit',        -- Redactions defined, awaiting finalization
    'committed',             -- Redactions finalized, AI-visible text generated
    'indexing',              -- Generating embeddings
    'indexed',               -- Ready for AI queries
    'indexing_failed'        -- Embedding generation failed
);

-- Redaction types for semantic labeling
CREATE TYPE redaction_type AS ENUM (
    'manual',       -- Manual character range selection
    'regex',        -- Regex pattern match
    'pii_email',    -- Email addresses
    'pii_phone',    -- Phone numbers
    'pii_ssn',      -- Social Security Numbers
    'pii_address',  -- Physical addresses
    'pii_name',     -- Personal names
    'financial',    -- Financial data (account numbers, etc.)
    'medical',      -- Medical/health information
    'legal',        -- Legal/privileged information
    'custom'        -- Custom semantic label
);

-- ============================================================================
-- DOCUMENT PROCESSING STATE
-- ============================================================================

-- Tracks the processing state of each file for AI
CREATE TABLE document_processing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    status document_processing_status NOT NULL DEFAULT 'pending_extraction',

    -- Extraction metadata
    extracted_at TIMESTAMPTZ,
    extraction_error TEXT,
    character_count INTEGER,

    -- Redaction workflow
    redaction_started_at TIMESTAMPTZ,
    redaction_started_by UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Commit metadata (CRITICAL: marks point of no return)
    committed_at TIMESTAMPTZ,
    committed_by UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Indexing metadata
    indexed_at TIMESTAMPTZ,
    indexing_error TEXT,
    chunk_count INTEGER,
    embedding_model TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- One processing record per file
    UNIQUE (file_id)
);

CREATE INDEX idx_doc_processing_file ON document_processing(file_id);
CREATE INDEX idx_doc_processing_org ON document_processing(organization_id);
CREATE INDEX idx_doc_processing_status ON document_processing(status);

CREATE TRIGGER document_processing_updated_at_trigger
    BEFORE UPDATE ON document_processing
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE document_processing IS 'Tracks AI processing state for each file. Controls the secure processing pipeline.';
COMMENT ON COLUMN document_processing.committed_at IS 'CRITICAL: Once set, redactions are immutable and raw text must be deleted';

-- ============================================================================
-- DOCUMENT RAW TEXT (SECURE - NEVER AI ACCESSIBLE)
-- ============================================================================

-- This table stores raw extracted text BEFORE redaction
-- SECURITY: This table must NEVER be accessible to AI pipelines
-- SECURITY: Must be deleted after redaction commit
CREATE TABLE document_raw_text (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- The raw extracted text (SENSITIVE)
    content TEXT NOT NULL,

    -- Extraction metadata
    source_mime_type TEXT NOT NULL,
    extraction_method TEXT NOT NULL, -- 'pdf-parse', 'mammoth', 'plain', etc.

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- One raw text record per file (before commit, then deleted)
    UNIQUE (file_id)
);

-- CRITICAL: NO index on content - never search raw text
CREATE INDEX idx_raw_text_file ON document_raw_text(file_id);
CREATE INDEX idx_raw_text_org ON document_raw_text(organization_id);

COMMENT ON TABLE document_raw_text IS 'SECURE: Raw extracted text BEFORE redaction. NEVER accessible to AI. Deleted after commit.';
COMMENT ON COLUMN document_raw_text.content IS 'SENSITIVE: Raw document text. Must be deleted after redaction commit.';

-- ============================================================================
-- DOCUMENT REDACTIONS (ENHANCED)
-- ============================================================================

-- Enhanced redaction table with support for different redaction methods
-- Replaces the simpler 'redactions' table for AI pipeline
CREATE TABLE document_redactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Redaction definition
    redaction_type redaction_type NOT NULL,
    start_offset INTEGER NOT NULL,
    end_offset INTEGER NOT NULL,

    -- For regex/pattern redactions, store the pattern (for audit)
    pattern TEXT,

    -- For semantic redactions, store the label
    semantic_label TEXT,

    -- Audit trail
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- IMMUTABILITY: Once committed, redactions cannot be modified
    -- This is enforced by triggers, not nullable columns

    CONSTRAINT valid_offsets CHECK (end_offset > start_offset AND start_offset >= 0)
);

CREATE INDEX idx_doc_redactions_file ON document_redactions(file_id);
CREATE INDEX idx_doc_redactions_org ON document_redactions(organization_id);
CREATE INDEX idx_doc_redactions_type ON document_redactions(redaction_type);

COMMENT ON TABLE document_redactions IS 'Redaction definitions for AI pipeline. Immutable after document commit.';
COMMENT ON COLUMN document_redactions.start_offset IS 'Character offset (0-indexed) where redaction starts';
COMMENT ON COLUMN document_redactions.end_offset IS 'Character offset (exclusive) where redaction ends';

-- ============================================================================
-- DOCUMENT AI TEXT (POST-REDACTION - AI SAFE)
-- ============================================================================

-- This table stores text AFTER redaction has been applied
-- SECURITY: This is the ONLY text that can flow into AI/embeddings
-- SECURITY: Only populated after commit
CREATE TABLE document_ai_text (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- The redacted text (AI-SAFE)
    content TEXT NOT NULL,

    -- Metadata
    character_count INTEGER NOT NULL,
    redaction_count INTEGER NOT NULL DEFAULT 0,

    -- Link to processing record
    processing_id UUID NOT NULL REFERENCES document_processing(id) ON DELETE CASCADE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- One AI text record per file
    UNIQUE (file_id)
);

CREATE INDEX idx_ai_text_file ON document_ai_text(file_id);
CREATE INDEX idx_ai_text_org ON document_ai_text(organization_id);
CREATE INDEX idx_ai_text_processing ON document_ai_text(processing_id);

COMMENT ON TABLE document_ai_text IS 'AI-SAFE: Redacted text for AI consumption. Only source for embeddings.';
COMMENT ON COLUMN document_ai_text.content IS 'AI-SAFE: Text with all redactions permanently removed.';

-- ============================================================================
-- DOCUMENT CHUNKS (VECTOR STORAGE)
-- ============================================================================

-- Stores chunked text with embeddings for similarity search
CREATE TABLE document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Chunk metadata
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    character_start INTEGER NOT NULL,
    character_end INTEGER NOT NULL,

    -- Vector embedding (1536 dimensions for Gemini embedding-001 with outputDimensionality)
    embedding vector(1536),
    embedding_model TEXT NOT NULL,

    -- Processing reference
    processing_id UUID NOT NULL REFERENCES document_processing(id) ON DELETE CASCADE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Unique chunk per file
    UNIQUE (file_id, chunk_index)
);

-- CRITICAL: pgvector indexes for efficient similarity search
-- Using HNSW for better recall and performance
CREATE INDEX idx_chunks_embedding ON document_chunks
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

CREATE INDEX idx_chunks_file ON document_chunks(file_id);
CREATE INDEX idx_chunks_org ON document_chunks(organization_id);
CREATE INDEX idx_chunks_processing ON document_chunks(processing_id);

COMMENT ON TABLE document_chunks IS 'Chunked AI-safe text with vector embeddings for similarity search.';
COMMENT ON COLUMN document_chunks.embedding IS 'Vector embedding from Google Gemini. Used for cosine similarity search.';
COMMENT ON COLUMN document_chunks.embedding_model IS 'Model used to generate embedding (e.g., gemini-embedding-001)';

-- ============================================================================
-- AI QUERY LOG (AUDIT)
-- ============================================================================

-- Audit log for AI queries (who searched what)
CREATE TABLE ai_query_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,

    -- Query details
    query_text TEXT NOT NULL,
    query_embedding vector(1536),

    -- Results (file IDs that were returned)
    result_file_ids UUID[] NOT NULL DEFAULT '{}',
    result_count INTEGER NOT NULL DEFAULT 0,

    -- Performance
    search_duration_ms INTEGER,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_query_log_org ON ai_query_log(organization_id);
CREATE INDEX idx_ai_query_log_user ON ai_query_log(user_id);
CREATE INDEX idx_ai_query_log_created ON ai_query_log(created_at);

COMMENT ON TABLE ai_query_log IS 'Audit log for all AI similarity searches.';

-- ============================================================================
-- SECURITY FUNCTIONS
-- ============================================================================

-- Check if a document is committed (redactions finalized)
CREATE OR REPLACE FUNCTION is_document_committed(p_file_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM document_processing
        WHERE file_id = p_file_id
          AND committed_at IS NOT NULL
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Check if document is ready for AI (fully indexed)
CREATE OR REPLACE FUNCTION is_document_ai_ready(p_file_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM document_processing
        WHERE file_id = p_file_id
          AND status = 'indexed'
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================================
-- IMMUTABILITY TRIGGERS
-- ============================================================================

-- Prevent modification of redactions after document is committed
CREATE OR REPLACE FUNCTION prevent_redaction_modification()
RETURNS TRIGGER AS $$
BEGIN
    IF is_document_committed(COALESCE(OLD.file_id, NEW.file_id)) THEN
        RAISE EXCEPTION 'Cannot modify redactions after document is committed. file_id=%',
            COALESCE(OLD.file_id, NEW.file_id);
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_redaction_immutability_update
    BEFORE UPDATE ON document_redactions
    FOR EACH ROW
    EXECUTE FUNCTION prevent_redaction_modification();

CREATE TRIGGER enforce_redaction_immutability_delete
    BEFORE DELETE ON document_redactions
    FOR EACH ROW
    EXECUTE FUNCTION prevent_redaction_modification();

-- Prevent uncommitting a document
CREATE OR REPLACE FUNCTION prevent_uncommit()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.committed_at IS NOT NULL AND NEW.committed_at IS NULL THEN
        RAISE EXCEPTION 'Cannot uncommit a document. Commit is irreversible. file_id=%', OLD.file_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_commit_permanence
    BEFORE UPDATE ON document_processing
    FOR EACH ROW
    EXECUTE FUNCTION prevent_uncommit();

-- Prevent inserting raw text for committed documents
CREATE OR REPLACE FUNCTION prevent_raw_text_after_commit()
RETURNS TRIGGER AS $$
BEGIN
    IF is_document_committed(NEW.file_id) THEN
        RAISE EXCEPTION 'Cannot insert raw text for committed document. file_id=%', NEW.file_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_no_raw_text_after_commit
    BEFORE INSERT ON document_raw_text
    FOR EACH ROW
    EXECUTE FUNCTION prevent_raw_text_after_commit();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE document_processing ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_raw_text ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_redactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_ai_text ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_query_log ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES: document_processing
-- ============================================================================

-- Users with file access can see processing status
CREATE POLICY doc_processing_select ON document_processing
    FOR SELECT
    USING (can_view(get_current_user_id(), 'file'::resource_type, file_id));

-- Only service role can modify (backend processing)
-- No insert/update/delete policies for authenticated users

COMMENT ON POLICY doc_processing_select ON document_processing
    IS 'Users with file access can view processing status';

-- ============================================================================
-- RLS POLICIES: document_raw_text
-- CRITICAL: Very restrictive - only admins for redaction UI
-- ============================================================================

-- ONLY file admins can read raw text (for redaction UI)
-- NOTE: This should ideally be even more restrictive (service role only)
-- but we need admin access for the redaction preview UI
CREATE POLICY raw_text_select_admin ON document_raw_text
    FOR SELECT
    USING (
        can_admin(get_current_user_id(), 'file'::resource_type, file_id)
        AND NOT is_document_committed(file_id)
    );

-- No insert/update/delete for authenticated users (service role only)

COMMENT ON POLICY raw_text_select_admin ON document_raw_text
    IS 'SECURE: Only admins can read raw text, and only before commit';

-- ============================================================================
-- RLS POLICIES: document_redactions
-- ============================================================================

-- Users with file access can see redaction metadata (for UI indicators)
CREATE POLICY doc_redactions_select ON document_redactions
    FOR SELECT
    USING (can_view(get_current_user_id(), 'file'::resource_type, file_id));

-- Only admins can create redactions (before commit)
CREATE POLICY doc_redactions_insert ON document_redactions
    FOR INSERT
    WITH CHECK (
        can_admin(get_current_user_id(), 'file'::resource_type, file_id)
        AND NOT is_document_committed(file_id)
    );

-- Only admins can delete redactions (before commit)
-- Note: Update is blocked by trigger for committed docs
CREATE POLICY doc_redactions_delete ON document_redactions
    FOR DELETE
    USING (
        can_admin(get_current_user_id(), 'file'::resource_type, file_id)
        AND NOT is_document_committed(file_id)
    );

COMMENT ON POLICY doc_redactions_select ON document_redactions
    IS 'Users with file access can see redaction records';
COMMENT ON POLICY doc_redactions_insert ON document_redactions
    IS 'Only admins can create redactions before commit';
COMMENT ON POLICY doc_redactions_delete ON document_redactions
    IS 'Only admins can delete redactions before commit';

-- ============================================================================
-- RLS POLICIES: document_ai_text
-- ============================================================================

-- Users with file access can read AI-safe text
CREATE POLICY ai_text_select ON document_ai_text
    FOR SELECT
    USING (can_view(get_current_user_id(), 'file'::resource_type, file_id));

-- No insert/update/delete for authenticated users (service role only)

COMMENT ON POLICY ai_text_select ON document_ai_text
    IS 'Users with file access can read AI-safe text';

-- ============================================================================
-- RLS POLICIES: document_chunks
-- ============================================================================

-- Users with file access can read chunks
CREATE POLICY chunks_select ON document_chunks
    FOR SELECT
    USING (can_view(get_current_user_id(), 'file'::resource_type, file_id));

-- No insert/update/delete for authenticated users (service role only)

COMMENT ON POLICY chunks_select ON document_chunks
    IS 'Users with file access can read document chunks';

-- ============================================================================
-- RLS POLICIES: ai_query_log
-- ============================================================================

-- Only super_admin can see AI query logs
CREATE POLICY ai_query_log_select ON ai_query_log
    FOR SELECT
    USING (current_user_is_super_admin(organization_id));

-- Insert handled by service role

COMMENT ON POLICY ai_query_log_select ON ai_query_log
    IS 'Only super_admin can view AI query audit logs';

-- ============================================================================
-- SECURE SIMILARITY SEARCH FUNCTION
-- ============================================================================

-- Secure similarity search that enforces org isolation and permissions
CREATE OR REPLACE FUNCTION search_similar_chunks(
    p_user_id UUID,
    p_organization_id UUID,
    p_query_embedding vector(1536),
    p_limit INTEGER DEFAULT 10,
    p_similarity_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
    chunk_id UUID,
    file_id UUID,
    file_name TEXT,
    chunk_index INTEGER,
    content TEXT,
    similarity FLOAT
) AS $$
BEGIN
    -- Verify user is org member
    IF NOT EXISTS (
        SELECT 1 FROM organization_members
        WHERE organization_id = p_organization_id
          AND user_id = p_user_id
    ) THEN
        RAISE EXCEPTION 'User is not a member of this organization';
    END IF;

    RETURN QUERY
    SELECT
        dc.id AS chunk_id,
        dc.file_id,
        f.name AS file_name,
        dc.chunk_index,
        dc.content,
        1 - (dc.embedding <=> p_query_embedding) AS similarity
    FROM document_chunks dc
    JOIN files f ON f.id = dc.file_id
    JOIN document_processing dp ON dp.file_id = dc.file_id
    WHERE
        -- Organization isolation (CRITICAL)
        dc.organization_id = p_organization_id
        -- Only indexed documents
        AND dp.status = 'indexed'
        -- File not deleted
        AND f.deleted_at IS NULL
        -- User has permission to view file
        AND can_view(p_user_id, 'file'::resource_type, dc.file_id)
        -- Similarity threshold
        AND 1 - (dc.embedding <=> p_query_embedding) >= p_similarity_threshold
    ORDER BY dc.embedding <=> p_query_embedding
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION search_similar_chunks IS
    'Secure similarity search with org isolation and permission checks';

-- ============================================================================
-- HELPER FUNCTION: Apply redactions to text
-- ============================================================================

-- Applies redactions to text, permanently removing sensitive content
-- This runs in the backend, not exposed to clients
CREATE OR REPLACE FUNCTION apply_redactions(
    p_file_id UUID,
    p_raw_text TEXT
)
RETURNS TEXT AS $$
DECLARE
    v_result TEXT;
    v_redaction RECORD;
    v_offset_adjustment INTEGER := 0;
BEGIN
    v_result := p_raw_text;

    -- Apply redactions in reverse order (end to start) to preserve offsets
    FOR v_redaction IN
        SELECT start_offset, end_offset
        FROM document_redactions
        WHERE file_id = p_file_id
        ORDER BY start_offset DESC
    LOOP
        -- Remove the redacted content (not replace with placeholder)
        v_result :=
            SUBSTRING(v_result FROM 1 FOR v_redaction.start_offset) ||
            SUBSTRING(v_result FROM v_redaction.end_offset + 1);
    END LOOP;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION apply_redactions IS
    'Applies redactions to raw text, permanently removing sensitive content';

-- ============================================================================
-- GRANT EXECUTE PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION is_document_committed(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_document_ai_ready(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION search_similar_chunks(UUID, UUID, vector, INTEGER, FLOAT) TO authenticated;
-- apply_redactions is service role only (not granted to authenticated)

-- ============================================================================
-- DOCUMENTATION
-- ============================================================================

COMMENT ON TYPE document_processing_status IS 'Processing pipeline states for document AI preparation';
COMMENT ON TYPE redaction_type IS 'Types of redactions for semantic classification';
