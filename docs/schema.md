# Database Schema Documentation

This document describes the database schema that implements the permission model defined in `permissions.md`.

---

## Entity Relationship Overview

```
organizations
    ├── organization_members (users with org-level roles)
    ├── teams
    │   └── team_members (users in teams)
    ├── folders (owned by teams, hierarchical)
    │   └── files (owned by teams, in folders or root)
    └── audit_logs

resource_permissions ──► folders / files
public_links ──────────► folders / files
redactions ────────────► files
```

---

## Tables

### Organization Layer

| Table | Purpose |
|-------|---------|
| `organizations` | Top-level workspaces containing all resources |
| `organization_members` | Maps users to orgs with `super_admin` or `member` role |
| `teams` | Flat groups within an organization |
| `team_members` | Maps users to teams (many-to-many) |

### Resource Layer

| Table | Purpose |
|-------|---------|
| `folders` | Hierarchical folder structure with soft delete |
| `files` | File metadata with soft delete (content in Supabase Storage) |
| `resource_permissions` | Explicit permissions on folders/files for users/teams |
| `public_links` | Token-based view-only sharing |
| `redactions` | Section-level content redactions within files |
| `audit_logs` | Immutable log of sensitive actions |

---

## Enums

| Enum | Values | Usage |
|------|--------|-------|
| `org_role` | `super_admin`, `member` | Organization membership role |
| `resource_role` | `admin`, `editor`, `viewer` | Permission level on resources |
| `resource_type` | `folder`, `file` | Polymorphic resource reference |
| `grantee_type` | `user`, `team` | Who receives the permission |
| `permission_type` | `grant`, `deny` | Whether permission allows or blocks access |

---

## Key Design Decisions

### 1. Polymorphic Permissions

Instead of separate `folder_permissions` and `file_permissions` tables, we use a single `resource_permissions` table with `resource_type` and `resource_id` columns.

**Tradeoffs:**
- (+) Simpler schema, single source of truth
- (+) Easier to query "all permissions for a user"
- (-) No foreign key constraint on `resource_id`
- Mitigation: Application-level validation, partial indexes

### 2. Team Ownership

Resources (folders/files) are owned by teams, not users. The owning team has implicit admin access.

```sql
-- Owner team check in get_effective_role()
IF v_owner_team_id = ANY(v_team_ids) THEN
    RETURN 'admin';
END IF;
```

### 3. Soft Delete Pattern

Folders and files use `deleted_at` / `deleted_by` columns instead of hard delete.

```sql
deleted_at TIMESTAMPTZ,  -- NULL = not deleted
deleted_by UUID,         -- Who deleted it
```

Queries must filter `WHERE deleted_at IS NULL` to exclude deleted items.

### 4. Unique Constraints with Soft Delete

To allow "re-creating" a deleted item with the same name, we use `UNIQUE NULLS NOT DISTINCT`:

```sql
UNIQUE NULLS NOT DISTINCT (organization_id, parent_folder_id, name, deleted_at)
```

This allows:
- Only one active item with a given name in a folder
- Multiple deleted items with the same name (each with different `deleted_at`)

### 5. Public Link Tokens

Public links use a separate `token` column (not the `id`) for URLs:

```sql
token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex')
```

**Why:** IDs are UUIDs which could be guessed. Tokens are 64-character hex strings.

### 6. Redaction Offsets

Redactions store character offsets within file content:

```sql
start_offset INTEGER NOT NULL,
end_offset INTEGER NOT NULL,
CONSTRAINT valid_offset_range CHECK (start_offset >= 0 AND end_offset > start_offset)
```

The application must apply redactions before sending content to the AI.

---

## Permission Resolution

The `get_effective_role()` function implements the precedence rules:

```
1. Resource not found / deleted → NULL (deny)
2. Resource is orphaned (no owner_team_id)?
   - User is super_admin → 'admin'
   - Otherwise → NULL (deny)
3. Explicit DENY on resource for user or team → NULL (deny)
4. User's team owns the resource → 'admin'
5. Explicit GRANT on resource → use that role
6. inherit_permissions = false? → NULL (deny, stop here)
7. Walk up folder tree:
   - Check DENY on ancestor → NULL if found
   - Check ownership of ancestor → 'admin' if found
   - Check GRANT on ancestor → use highest role
   - Check inherit_permissions → stop if false
8. No match → NULL (deny)
```

**Key principles:**
- Deny always wins over any grant
- Highest grant wins when multiple sources exist
- Inheritance can be broken at any level
- Super-admin has NO implicit access (except orphaned resources)

---

## Helper Functions

| Function | Purpose |
|----------|---------|
| `is_super_admin(user_id, org_id)` | Check if user is org super_admin (for org management, NOT resource access) |
| `get_user_team_ids(user_id, org_id)` | Get all team IDs user belongs to |
| `get_folder_ancestors(folder_id)` | Get ancestor folder chain for inheritance |
| `is_resource_orphaned(type, id)` | Check if resource has no owning team |
| `has_deny_permission(user, teams, type, id)` | Check for explicit deny on resource |
| `get_direct_grant_role(user, teams, type, id)` | Get grant permission on specific resource |
| `resource_inherits_permissions(type, id)` | Check if resource inherits from parent |
| `get_effective_role(user_id, type, id)` | Calculate effective permission (main function) |
| `can_view(user_id, type, id)` | Check if user has any access |
| `can_edit(user_id, type, id)` | Check if user has editor+ access |
| `can_admin(user_id, type, id)` | Check if user has admin access |
| `get_orphaned_folders(org_id)` | List orphaned folders (super_admin use) |
| `get_orphaned_files(org_id)` | List orphaned files (super_admin use) |
| `reassign_resource_owner(user, type, id, team)` | Reassign orphaned resource (super_admin only) |
| `get_public_link_access(token, type, id)` | Validate public link (always returns viewer, no AI) |

---

## Indexes

### Primary Access Patterns

| Query Pattern | Supporting Index |
|--------------|------------------|
| Get user's orgs | `idx_org_members_user` |
| Get user's teams | `idx_team_members_user` |
| List folder contents | `idx_files_folder`, `idx_folders_parent` |
| Check permissions | `idx_permissions_resource`, `idx_permissions_grantee` |
| Validate public link | `idx_public_links_token` (partial, active only) |
| Get file redactions | `idx_redactions_file` (partial, active only) |
| Audit trail | `idx_audit_org_time`, `idx_audit_user` |

---

## Audit Log Actions

Standard action identifiers for `audit_logs.action`:

| Category | Actions |
|----------|---------|
| Organization | `org.create`, `org.update`, `org.delete` |
| Team | `team.create`, `team.update`, `team.delete`, `team.member.add`, `team.member.remove` |
| Folder | `folder.create`, `folder.update`, `folder.move`, `folder.delete`, `folder.restore` |
| File | `file.create`, `file.update`, `file.move`, `file.delete`, `file.restore` |
| Permission | `permission.grant`, `permission.revoke`, `permission.update` |
| Public Link | `link.create`, `link.disable` |
| Redaction | `redaction.create`, `redaction.remove` |

---

## Row Level Security (RLS)

RLS is enabled on all tables (migration 004). See `docs/rls-policies.md` for details.

### Key Points

- RLS enforces permissions at the database level
- Policies use `can_view()`, `can_edit()`, `can_admin()` functions
- `get_current_user_id()` maps Clerk auth to internal user UUID
- Service role bypasses RLS for backend operations

### RLS Functions

| Function | Purpose |
|----------|---------|
| `get_current_user_id()` | Maps Clerk `auth.uid()` to internal user UUID |
| `is_org_member(org_id)` | Check if current user is in organization |
| `current_user_is_super_admin(org_id)` | Check if current user is super_admin |

---

## Migration Dependencies

```
001_create_users_table.sql
    └── 002_permission_model.sql
        └── 003_schema_hardening.sql
            └── 004_row_level_security.sql
```

The schema depends on:
- `users` table from migration 001
- `update_updated_at_column()` trigger function from migration 001
- Enums and tables from migration 002
- Permission functions from migration 003
