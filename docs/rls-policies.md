# Row Level Security (RLS) Policies

This document describes the RLS policies implemented in migration 004.

---

## Overview

Row Level Security enforces the permission model at the database level, providing defense-in-depth. Even if application code has bugs, the database will prevent unauthorized access.

**Key Principle:** All user-facing operations should use the `authenticated` role with RLS enabled. Backend services use `service_role` to bypass RLS when needed.

---

## Authentication Flow

```
User Request
    │
    ▼
┌─────────────────┐
│   Clerk Auth    │
│  (clerk_user_id)│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│get_current_user │
│  id() function  │
│ Maps to internal│
│    user UUID    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   RLS Policies  │
│ Use permission  │
│   functions     │
└─────────────────┘
```

---

## Helper Functions

| Function | Purpose |
|----------|---------|
| `get_current_user_id()` | Maps Clerk's `auth.uid()` to internal user UUID |
| `is_org_member(org_id)` | Checks if current user is a member of organization |
| `current_user_is_super_admin(org_id)` | Checks if current user has super_admin role |

These functions are `SECURITY DEFINER` to ensure they work correctly in RLS context.

---

## Policy Summary by Table

### users

| Operation | Policy | Who Can Access |
|-----------|--------|----------------|
| SELECT | `users_select_own` | Own record |
| SELECT | `users_select_org_members` | Other users in same organizations |
| UPDATE | `users_update_own` | Own record only |
| INSERT | Service role only | User sync from Clerk |
| DELETE | Service role only | Not exposed to users |

### organizations

| Operation | Policy | Who Can Access |
|-----------|--------|----------------|
| SELECT | `organizations_select_member` | Organization members |
| UPDATE | `organizations_update_admin` | Super_admin only |
| INSERT | Service role only | Org creation flows |
| DELETE | Service role only | Not exposed to users |

### organization_members

| Operation | Policy | Who Can Access |
|-----------|--------|----------------|
| SELECT | `org_members_select` | All org members |
| INSERT | `org_members_insert` | Super_admin |
| UPDATE | `org_members_update` | Super_admin |
| DELETE | `org_members_delete` | Super_admin |

### teams

| Operation | Policy | Who Can Access |
|-----------|--------|----------------|
| SELECT | `teams_select` | All org members |
| INSERT | `teams_insert` | Super_admin |
| UPDATE | `teams_update` | Super_admin |
| DELETE | `teams_delete` | Super_admin |

### team_members

| Operation | Policy | Who Can Access |
|-----------|--------|----------------|
| SELECT | `team_members_select` | All org members |
| INSERT | `team_members_insert` | Super_admin |
| DELETE | `team_members_delete` | Super_admin |

### folders

| Operation | Policy | Who Can Access |
|-----------|--------|----------------|
| SELECT | `folders_select` | Users with view permission |
| INSERT | `folders_insert` | Users with edit permission on parent |
| UPDATE | `folders_update` | Users with edit permission |
| DELETE | `folders_delete` | Users with admin permission |

### files

| Operation | Policy | Who Can Access |
|-----------|--------|----------------|
| SELECT | `files_select` | Users with view permission |
| INSERT | `files_insert` | Users with edit permission on folder |
| UPDATE | `files_update` | Users with edit permission |
| DELETE | `files_delete` | Users with admin permission |

### resource_permissions

| Operation | Policy | Who Can Access |
|-----------|--------|----------------|
| SELECT | `resource_permissions_select` | Users with view permission on resource |
| INSERT | `resource_permissions_insert` | Users with edit permission (app enforces editor limits) |
| UPDATE | `resource_permissions_update` | Users with admin permission |
| DELETE | `resource_permissions_delete` | Users with admin permission |

### public_links

| Operation | Policy | Who Can Access |
|-----------|--------|----------------|
| SELECT | `public_links_select` | Users with view permission on resource |
| INSERT | `public_links_insert` | Users with edit permission |
| UPDATE | `public_links_update` | Users with admin permission |
| DELETE | Not allowed | Use soft delete (disabled_at) |

### redactions

| Operation | Policy | Who Can Access |
|-----------|--------|----------------|
| SELECT | `redactions_select` | Users with view permission (details filtered in app) |
| INSERT | `redactions_insert` | Users with admin permission |
| UPDATE | `redactions_update` | Users with admin permission |
| DELETE | Not allowed | Use soft delete (removed_at) |

### audit_logs

| Operation | Policy | Who Can Access |
|-----------|--------|----------------|
| SELECT | `audit_logs_select` | Super_admin only |
| INSERT | Service role only | Application creates entries |
| UPDATE | Not allowed | Immutable |
| DELETE | Not allowed | Immutable |

---

## Permission Function Usage

RLS policies use these functions from the permission model:

| Function | Returns | Usage |
|----------|---------|-------|
| `can_view(user_id, type, id)` | `BOOLEAN` | SELECT policies |
| `can_edit(user_id, type, id)` | `BOOLEAN` | INSERT/UPDATE policies |
| `can_admin(user_id, type, id)` | `BOOLEAN` | DELETE/permission management |
| `is_super_admin(user_id, org_id)` | `BOOLEAN` | Org-level operations |

---

## Application vs Database Enforcement

### Database Enforces (RLS)
- Who can see a resource
- Who can create/update/delete resources
- Basic permission level checks (can_view, can_edit, can_admin)

### Application Enforces
- Editor cannot grant admin role (checked in API)
- Editor cannot create deny permissions (checked in API)
- Redaction detail visibility (admins only)
- Business logic validation
- Audit log creation

**Example:** An editor can INSERT into `resource_permissions` (RLS allows), but the application must verify they're only granting `editor` or `viewer` roles, not `admin`.

---

## Service Role Usage

Use `service_role` key (bypasses RLS) for:

| Operation | Reason |
|-----------|--------|
| User sync from Clerk webhooks | Need to insert/update users table |
| Organization creation | Initial setup before any members exist |
| Audit log writes | Application-level logging |
| Background jobs | Scheduled tasks without user context |
| Admin override operations | Emergency access by system administrators |

**Important:** Never expose `service_role` key to the client. Only use server-side.

---

## Testing RLS

Test policies with this pattern:

```sql
-- Impersonate a user by setting the auth context
-- This simulates what Supabase does with JWT auth

-- 1. Get a test user's Clerk ID
SELECT clerk_user_id FROM users WHERE email = 'test@example.com';

-- 2. Set the auth context (simulates JWT)
SET request.jwt.claim.sub = 'clerk_user_id_here';

-- 3. Test a query (should respect RLS)
SELECT * FROM folders;

-- 4. Reset context
RESET request.jwt.claim.sub;
```

Or use the Supabase client:

```typescript
// Using anon/authenticated key (RLS applied)
const { data, error } = await supabase
  .from('folders')
  .select('*');

// Using service role (RLS bypassed)
const { data, error } = await supabaseAdmin
  .from('folders')
  .select('*');
```

---

## Common Issues

### 1. Infinite recursion in policies

The `get_current_user_id()` function queries the `users` table, which has RLS enabled. To prevent infinite recursion, the function is marked `SECURITY DEFINER`, which runs with elevated privileges.

### 2. Performance

Each row access calls permission functions. For listing operations with many rows:
- Use `LIMIT` and pagination
- Consider caching permission results in application
- Monitor query performance

### 3. Missing access

If a user can't see expected data:
1. Check `get_current_user_id()` returns their ID
2. Check `is_org_member()` for their organization
3. Check `can_view()` for the specific resource
4. Check for deny permissions blocking access

---

## Migration Checklist

1. **Backup database**

2. **Run migration 004:**
   ```sql
   \i 004_row_level_security.sql
   ```

3. **Verify RLS is enabled:**
   ```sql
   SELECT tablename, rowsecurity
   FROM pg_tables
   WHERE schemaname = 'public'
   ORDER BY tablename;
   ```

4. **Test with authenticated user:**
   ```sql
   -- Should only return user's accessible folders
   SET request.jwt.claim.sub = 'test_clerk_id';
   SELECT * FROM folders;
   RESET request.jwt.claim.sub;
   ```

5. **Verify service role bypass:**
   ```sql
   -- With service role, should return all folders
   SELECT * FROM folders;
   ```

---

## Rollback

If needed, disable RLS:

```sql
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE teams DISABLE ROW LEVEL SECURITY;
ALTER TABLE team_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE folders DISABLE ROW LEVEL SECURITY;
ALTER TABLE files DISABLE ROW LEVEL SECURITY;
ALTER TABLE resource_permissions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public_links DISABLE ROW LEVEL SECURITY;
ALTER TABLE redactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY;

-- Drop policies (optional, they're inactive when RLS disabled)
DROP POLICY IF EXISTS users_select_own ON users;
DROP POLICY IF EXISTS users_select_org_members ON users;
-- ... etc for all policies
```
