# Schema Hardening Changes (Migration 003)

This document explains each change made in migration 003 and why it was required.

---

## Summary of Changes

| Change | Reason |
|--------|--------|
| Added `permission_type` enum | Support explicit deny permissions |
| Added `inherit_permissions` to folders/files | Allow breaking inheritance chain |
| Added `created_by_user_id` to folders/files | Track resource creator (audit) |
| Changed `owner_team_id` to nullable | Support orphaned resources |
| Changed FK to `ON DELETE SET NULL` | Orphan resources instead of blocking team deletion |
| Updated `get_effective_role()` | Implement new permission logic |
| Added orphan management functions | Super-admin can view and reassign orphaned resources |
| Added `get_public_link_access()` | Explicit view-only enforcement |
| Added indexes | Performance optimization |
| Added constraints | Data integrity |

---

## Detailed Explanation

### 1. Deny Permissions

**Change:** Added `permission_type` enum with values `'grant'` and `'deny'`

**Why:** The original schema only supported granting access. To override inherited permissions, we need the ability to explicitly deny access.

**Behavior:**
- A `deny` permission at any level blocks access, even if a `grant` exists at a higher level
- Deny is checked before grant in permission resolution
- Deny applies to both user and team grantees

**Example:**
```
Folder A: Team X has 'editor' grant
  └── File B: User Y (member of Team X) has 'deny'

Result: User Y cannot access File B, even though Team X has editor on Folder A
```

### 2. Inheritance Control

**Change:** Added `inherit_permissions BOOLEAN DEFAULT true` to folders and files

**Why:** Some resources need to break from parent permissions without deleting them.

**Behavior:**
- When `true` (default): Resource inherits permissions from parent folder
- When `false`: Resource ignores all parent permissions, only explicit permissions apply

**Example:**
```
Folder A: Team X has 'viewer'
  └── Folder B: inherit_permissions = false, Team Y has 'editor'

Result: Team X cannot access Folder B (inheritance broken)
        Team Y has editor on Folder B
```

### 3. Creator Tracking

**Change:** Added `created_by_user_id` to folders and files

**Why:** Separate concern from ownership. Ownership is team-based, but knowing who created a resource is valuable for audit trails.

**Note:** This does NOT grant any permissions. It's purely for tracking.

### 4. Orphaned Resources

**Change:**
- `owner_team_id` is now nullable
- Foreign key changed from `ON DELETE RESTRICT` to `ON DELETE SET NULL`

**Why:** When a team is deleted, its resources become orphaned rather than blocking deletion or being cascade-deleted.

**Behavior:**
- Orphaned resources (`owner_team_id IS NULL`) are only accessible to super_admin
- Super_admin can view orphaned resources via `get_orphaned_folders()` / `get_orphaned_files()`
- Super_admin can reassign ownership via `reassign_resource_owner()`

### 5. Super-Admin Role Clarification

**Change:** `get_effective_role()` no longer grants implicit admin to super_admins (except for orphaned resources)

**Why:** Organization roles should be separate from resource permissions. Super_admin controls org-level management (teams, users, billing), not automatic access to all files.

**Super-admin capabilities:**
- Create/delete teams
- Invite/remove org members
- Access orphaned resources
- Reassign orphaned resource ownership
- Does NOT automatically have access to resources owned by teams

### 6. Public Link Enforcement

**Change:** Added `get_public_link_access()` function

**Why:** Public links are always view-only with no AI features. This is enforced in the database function, not just application code.

**Returns:**
- `has_access`: Whether the link grants access
- `access_role`: Always `'viewer'` if access granted
- `allows_ai`: Always `FALSE`

**Behavior:**
- Links to folders grant view access to all contents (recursive)
- Links cannot escalate beyond viewer
- AI features are explicitly disabled for public link access

---

## Permission Resolution Order (Updated)

```
1. Resource not found/deleted         → NULL (deny)
2. Resource is orphaned
   - User is super_admin              → 'admin'
   - Otherwise                        → NULL (deny)
3. Explicit DENY on resource          → NULL (deny)
4. User's team owns resource          → 'admin'
5. Explicit GRANT on resource         → use that role
6. If inherit_permissions = false     → NULL (deny)
7. Walk up folder tree:
   - Check DENY on ancestor           → NULL if found
   - Check ownership of ancestor      → 'admin' if found
   - Check GRANT on ancestor          → use that role
   - Check inherit_permissions        → stop if false
8. No permission found                → NULL (deny)
```

---

## New Functions

| Function | Purpose | Access |
|----------|---------|--------|
| `is_resource_orphaned(type, id)` | Check if resource has no owner | Any |
| `has_deny_permission(user, teams, type, id)` | Check for explicit deny | Internal |
| `get_direct_grant_role(user, teams, type, id)` | Get grant on specific resource | Internal |
| `resource_inherits_permissions(type, id)` | Check inheritance flag | Internal |
| `get_orphaned_folders(org_id)` | List orphaned folders | Super-admin |
| `get_orphaned_files(org_id)` | List orphaned files | Super-admin |
| `reassign_resource_owner(user, type, id, team)` | Reassign ownership | Super-admin |
| `get_public_link_access(token, type, id)` | Check public link access | Any |

---

## New Indexes

| Index | Purpose |
|-------|---------|
| `idx_folders_parent_active` | Tree traversal for active folders |
| `idx_folders_org_parent` | Listing folders by org and parent |
| `idx_folders_orphaned` | Find orphaned folders quickly |
| `idx_files_folder_active` | Listing files in folder |
| `idx_files_org_folder` | Listing files by org and folder |
| `idx_files_orphaned` | Find orphaned files quickly |
| `idx_permissions_resource_type` | Permission lookups by resource |
| `idx_permissions_grantee_lookup` | Find all permissions for a grantee |
| `idx_public_links_active_token` | Fast token lookup (active only) |
| `idx_redactions_file_active` | Active redactions per file |
| `idx_audit_created_at` | Time-based audit queries |
| `idx_team_members_user_teams` | Find all teams for a user |

---

## New Constraints

| Constraint | Table | Purpose |
|------------|-------|---------|
| `valid_offset_range` | redactions | Ensure end > start >= 0 |
| `valid_file_size` | files | Ensure size >= 0 |
| `valid_token` | public_links | Ensure token is not empty |
| `resource_permissions_unique_grant` | resource_permissions | One permission per grantee per resource |

---

## Migration Checklist

Apply changes in this order:

1. **Backup database** (always before migrations)

2. **Run migration 003** in a transaction:
   ```sql
   BEGIN;
   \i 003_schema_hardening.sql
   COMMIT;
   ```

3. **Verify enums created:**
   ```sql
   SELECT typname FROM pg_type WHERE typname = 'permission_type';
   ```

4. **Verify columns added:**
   ```sql
   SELECT column_name, data_type, is_nullable
   FROM information_schema.columns
   WHERE table_name IN ('folders', 'files', 'resource_permissions')
   ORDER BY table_name, ordinal_position;
   ```

5. **Verify indexes created:**
   ```sql
   SELECT indexname FROM pg_indexes
   WHERE tablename IN ('folders', 'files', 'resource_permissions', 'public_links')
   ORDER BY tablename;
   ```

6. **Test permission resolution:**
   ```sql
   -- Should return NULL (super_admin no longer has implicit access)
   SELECT get_effective_role(
       '<super_admin_user_id>',
       'file',
       '<some_file_id>'
   );
   ```

7. **Update application code** to:
   - Stop relying on super_admin implicit access
   - Use `get_public_link_access()` for public link validation
   - Handle orphaned resources in UI (super_admin only)

---

## Breaking Changes

| Change | Impact | Migration Path |
|--------|--------|----------------|
| Super-admin loses implicit resource access | Super-admins can no longer see all files | Grant explicit permissions or accept new behavior |
| `owner_team_id` nullable | Queries assuming NOT NULL will fail | Update queries to handle NULL |
| New permission_type column | Existing permissions default to 'grant' | No action needed (default handles it) |

---

## Rollback

If needed, rollback with:

```sql
-- Reverse column additions
ALTER TABLE folders DROP COLUMN IF EXISTS inherit_permissions;
ALTER TABLE folders DROP COLUMN IF EXISTS created_by_user_id;
ALTER TABLE files DROP COLUMN IF EXISTS inherit_permissions;
ALTER TABLE files DROP COLUMN IF EXISTS created_by_user_id;
ALTER TABLE resource_permissions DROP COLUMN IF EXISTS permission_type;

-- Restore NOT NULL on owner_team_id (requires data cleanup first)
-- UPDATE folders SET owner_team_id = '<fallback_team>' WHERE owner_team_id IS NULL;
-- ALTER TABLE folders ALTER COLUMN owner_team_id SET NOT NULL;

-- Drop new functions
DROP FUNCTION IF EXISTS is_resource_orphaned;
DROP FUNCTION IF EXISTS has_deny_permission;
DROP FUNCTION IF EXISTS get_direct_grant_role;
DROP FUNCTION IF EXISTS resource_inherits_permissions;
DROP FUNCTION IF EXISTS get_orphaned_folders;
DROP FUNCTION IF EXISTS get_orphaned_files;
DROP FUNCTION IF EXISTS reassign_resource_owner;
DROP FUNCTION IF EXISTS get_public_link_access;

-- Drop enum
DROP TYPE IF EXISTS permission_type;
```
