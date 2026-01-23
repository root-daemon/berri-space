# CLAUDE.md — app/api/

This directory contains all backend API routes.

---

## Mandatory API Rules

Every API route MUST:
1. Authenticate the user via Clerk
2. Validate all inputs
3. Check authorization before accessing data
4. Return only data the user is allowed to see
5. Handle errors explicitly

---

## Security Rules

- Never trust client-provided IDs
- Never expose raw database records
- Never return private file URLs
- Use signed URLs for file access
- Do not leak existence of restricted resources

---

## Authorization

- APIs must call centralized permission helpers
- Permission checks must happen before DB queries where possible
- Viewer access must not allow mutation

---

## Logging

The following actions must be logged:
- File access
- Permission changes
- AI queries
- Redaction changes