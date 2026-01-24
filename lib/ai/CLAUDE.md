# CLAUDE.md — lib/ai/

## Module Purpose

This module implements the AI Foundation (Phase 8) for secure document processing, redaction, and similarity search.

---

## SECURITY MODEL (NON-NEGOTIABLE)

### Data Flow

```
File Upload
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│  EXTRACTION                                              │
│  - Extract text from PDF/DOCX/TXT                       │
│  - Store in document_raw_text (SECURE)                  │
│                                                         │
│  ⚠️  Raw text is NEVER accessible to AI                 │
└─────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│  REDACTION (Admin only)                                 │
│  - Admin reviews raw text in secure UI                  │
│  - Defines redactions (manual, regex, PII patterns)     │
│  - Redactions stored in document_redactions             │
│                                                         │
│  ⚠️  Redactions are IMMUTABLE after commit              │
└─────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│  COMMIT (Point of no return)                            │
│  - Apply redactions → Generate AI-safe text             │
│  - Store in document_ai_text                            │
│  - DELETE raw text PERMANENTLY                          │
│                                                         │
│  ⚠️  Redacted content is REMOVED, not masked            │
│  ⚠️  Raw text deletion is IRREVERSIBLE                  │
└─────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│  INDEXING                                               │
│  - Chunk AI-safe text (ONLY)                           │
│  - Generate embeddings via Google Gemini                │
│  - Store in document_chunks with pgvector               │
│                                                         │
│  ⚠️  Only AI-safe text reaches embeddings               │
└─────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│  SEARCH                                                 │
│  - Query → Embedding → pgvector similarity              │
│  - Results filtered by org + permissions                │
│  - All queries audited                                  │
│                                                         │
│  ⚠️  Never leaks cross-org data                        │
└─────────────────────────────────────────────────────────┘
```

### Hard Rules

1. **AI NEVER sees raw text** - Only AI-safe text (post-redaction) flows to embeddings
2. **Redactions are immutable** - After commit, redactions cannot be modified or deleted
3. **Raw text is deleted** - After commit, raw text is permanently removed
4. **Org isolation** - All searches are scoped to the user's organization
5. **Permission checks** - User must have view permission on files to see results

---

## Tables

| Table | Purpose | AI Access |
|-------|---------|-----------|
| `document_processing` | Processing state machine | Read only |
| `document_raw_text` | Extracted text BEFORE redaction | ❌ NEVER |
| `document_redactions` | Redaction definitions | Read only |
| `document_ai_text` | Text AFTER redaction | ✅ Source for AI |
| `document_chunks` | Chunked text with embeddings | ✅ Search target |
| `ai_query_log` | Audit log of searches | Admin only |

---

## Processing States

```
pending_extraction → extraction_failed (terminal)
       │
       ▼
pending_redaction → redaction_in_progress → pending_commit
       │                                         │
       └─────────────────────────────────────────┘
                         │
                         ▼
                     committed → indexing → indexed (terminal)
                                    │
                                    ▼
                             indexing_failed (retry possible)
```

---

## Key Functions

### Pipeline

- `processExtraction()` - Extract text from file, store raw text
- `commitRedactions()` - Apply redactions, delete raw text (IRREVERSIBLE)
- `indexDocument()` - Chunk and embed AI-safe text
- `processFullPipeline()` - Full flow for documents without redactions

### Search

- `searchSimilar()` - Secure similarity search with permissions
- `getAiReadyDocuments()` - List indexed documents in org
- `getChunkContext()` - Get surrounding chunks for better AI context

### Redaction

- `detectPii()` - Suggest PII redactions for admin review
- `applyRedactions()` - Apply redactions to text (permanent removal)
- `getRedactionPreview()` - Preview redactions in admin UI

---

## Usage Examples

### Process New Document (with redaction review)

```typescript
// Step 1: Extract
await processExtraction(supabaseAdmin, fileId, orgId, buffer, mimeType);

// Step 2: Admin defines redactions via UI...
// (creates document_redactions records)

// Step 3: Commit (IRREVERSIBLE)
await commitRedactions(supabaseAdmin, fileId, userId);

// Step 4: Index
await indexDocument(supabaseAdmin, fileId);
```

### Process Public Document (no redaction)

```typescript
await processFullPipeline(supabaseAdmin, fileId, orgId, buffer, mimeType, userId);
```

### Search

```typescript
const { results, error } = await searchSimilar(
  supabase,       // User's auth context
  supabaseAdmin,  // For audit logging
  userId,
  organizationId,
  "How do I configure authentication?",
  { limit: 5, similarityThreshold: 0.75 }
);
```

---

## RLS Policies

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| document_processing | file view | service role | service role | service role |
| document_raw_text | **file admin only, pre-commit** | service role | - | service role |
| document_redactions | file view | file admin (pre-commit) | - | file admin (pre-commit) |
| document_ai_text | file view | service role | - | service role |
| document_chunks | file view | service role | - | service role |
| ai_query_log | super_admin only | service role | - | - |

---

## Do NOT

- ❌ Query `document_raw_text` for AI purposes
- ❌ Skip redaction commit and access raw text
- ❌ Modify redactions after commit
- ❌ Search across organizations
- ❌ Return chunks without permission checks
- ❌ Store embeddings before commit

---

## Environment Variables

- `GOOGLE_GENERATIVE_AI_API_KEY` - Required for embedding generation
