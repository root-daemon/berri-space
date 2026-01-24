# CLAUDE.md — lib/permissions/

This directory contains the centralized permission engine.

---

## Purpose

ALL permission checks in the application MUST go through this module.
No API route or server action may bypass these functions.

---

## Core Function

```typescript
canUserAccess(userId, resourceType, resourceId, action) -> PermissionResult
```

This is the single source of truth for authorization decisions.

---

## Resolution Order

Permission checks follow this exact order (implemented in database function):

1. Resource not found / deleted → **DENY**
2. Resource is orphaned (no owner team)?
   - User is super_admin → **ALLOW (admin)**
   - Otherwise → **DENY**
3. Explicit DENY on resource for user or team → **DENY**
4. User's team owns the resource → **ALLOW (admin)**
5. Explicit GRANT on resource → **ALLOW (use that role)**
6. `inherit_permissions` = false → **DENY**
7. Walk up folder tree:
   - Check DENY on ancestor → DENY if found
   - Check ownership → admin if found
   - Check GRANT → use highest role
   - Check `inherit_permissions` → stop if false
8. No match found → **DENY**

---

## Key Principles

1. **Deny always wins** - A deny permission blocks access regardless of grants
2. **Highest grant wins** - When multiple grants exist, use the highest role
3. **Inheritance can be broken** - `inherit_permissions=false` stops inheritance
4. **Super-admin has NO implicit access** - Only org management + orphaned resources
5. **Default to deny** - If ambiguous or error, deny access

---

## Role Hierarchy

```
admin > editor > viewer
```

- **admin**: Full control, can delete, manage permissions, create redactions
- **editor**: Can modify content, rename, share (limited)
- **viewer**: Read-only access

---

## Action Mapping

### Folder Actions

| Action | Minimum Role |
|--------|-------------|
| view, list | viewer |
| create_subfolder, rename, grant_access*, create_public_link | editor |
| move, delete, restore, deny_access, revoke_access, disable_public_link, break_inheritance | admin |

*Editors can only grant editor/viewer, not admin

### File Actions

| Action | Minimum Role |
|--------|-------------|
| view, download, view_redaction_indicator, ask_ai | viewer |
| upload, rename, grant_access*, create_public_link | editor |
| move, delete, restore, deny_access, revoke_access, disable_public_link, break_inheritance, view_redaction_details, create_redaction, remove_redaction | admin |

---

## Usage

```typescript
import { canUserAccess, assertAccess, PermissionError } from "@/lib/permissions";

// Option 1: Check and handle
const result = await canUserAccess(userId, 'folder', folderId, 'delete');
if (!result.allowed) {
  return Response.json({ error: result.reason }, { status: 403 });
}

// Option 2: Assert (throws PermissionError)
try {
  await assertAccess(userId, 'file', fileId, 'download');
} catch (error) {
  if (error instanceof PermissionError) {
    return Response.json({ error: error.message }, { status: 403 });
  }
  throw error;
}
```

---

## DO NOT

- Hardcode permission checks elsewhere
- Trust client-provided roles
- Skip permission checks for "convenience"
- Check permissions in middleware only (also check in handlers)
- Cache permissions without invalidation strategy
