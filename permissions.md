# Permission Model

This document defines the complete permission model for the document management system. All authorization logic must follow these rules exactly.

---

## Roles

There are four roles in the system, organized into two levels:

### Organization Level

| Role | Description |
|------|-------------|
| **super-admin** | Organization owner. Can create teams, invite users, manage billing. Does NOT have implicit resource access (must be granted explicitly). Can access orphaned resources. |

### Resource Level (Folders & Files)

| Role | Description |
|------|-------------|
| **admin** | Full control over the resource. Can manage permissions and redactions. |
| **editor** | Can modify content and share access with others. |
| **viewer** | Read-only access. |

Resource role hierarchy: `admin > editor > viewer`

**Note:** Super-admin is an organization-level role, not a resource-level role. Super-admins must be granted explicit resource permissions like any other user (except for orphaned resources).

---

## Role-Action Matrix

The matrices below show what each **resource-level role** can do. Super-admin only appears in org-level actions.

### Folder Actions

| Action | admin | editor | viewer | public-link |
|--------|-------|--------|--------|-------------|
| View folder | ✓ | ✓ | ✓ | ✓ |
| List contents | ✓ | ✓ | ✓ | ✓ |
| Create subfolder | ✓ | ✓ | ✗ | ✗ |
| Rename folder | ✓ | ✓ | ✗ | ✗ |
| Move folder | ✓ | ✗ | ✗ | ✗ |
| Delete folder | ✓ | ✗ | ✗ | ✗ |
| Restore folder | ✓ | ✗ | ✗ | ✗ |
| Grant access | ✓ | ✓* | ✗ | ✗ |
| Deny access | ✓ | ✗ | ✗ | ✗ |
| Revoke access | ✓ | ✗ | ✗ | ✗ |
| Create public link | ✓ | ✓ | ✗ | ✗ |
| Disable public link | ✓ | ✗ | ✗ | ✗ |
| Break inheritance | ✓ | ✗ | ✗ | ✗ |

*Editors can grant `editor` or `viewer` access only. They cannot grant `admin` or create deny permissions.

### File Actions

| Action | admin | editor | viewer | public-link |
|--------|-------|--------|--------|-------------|
| View file | ✓ | ✓ | ✓ | ✓ |
| Download file | ✓ | ✓ | ✓ | ✓ |
| Upload/replace file | ✓ | ✓ | ✗ | ✗ |
| Rename file | ✓ | ✓ | ✗ | ✗ |
| Move file | ✓ | ✗ | ✗ | ✗ |
| Delete file | ✓ | ✗ | ✗ | ✗ |
| Restore file | ✓ | ✗ | ✗ | ✗ |
| Grant access | ✓ | ✓* | ✗ | ✗ |
| Deny access | ✓ | ✗ | ✗ | ✗ |
| Revoke access | ✓ | ✗ | ✗ | ✗ |
| Create public link | ✓ | ✓ | ✗ | ✗ |
| Disable public link | ✓ | ✗ | ✗ | ✗ |
| Break inheritance | ✓ | ✗ | ✗ | ✗ |

*Editors can grant `editor` or `viewer` access only. They cannot grant `admin` or create deny permissions.

### AI Features

| Action | admin | editor | viewer | public-link |
|--------|-------|--------|--------|-------------|
| Ask questions about file | ✓ | ✓ | ✓ | ✗ |
| View redacted content indicator | ✓ | ✓ | ✓ | ✓ |
| View redaction details | ✓ | ✗ | ✗ | ✗ |
| Create redaction | ✓ | ✗ | ✗ | ✗ |
| Remove redaction | ✓ | ✗ | ✗ | ✗ |

### Organization-Level Actions (Super-Admin Only)

| Action | super-admin | member |
|--------|-------------|--------|
| Create team | ✓ | ✗ |
| Delete team | ✓ | ✗ |
| Invite user to org | ✓ | ✗ |
| Remove user from org | ✓ | ✗ |
| View orphaned resources | ✓ | ✗ |
| Reassign orphaned resources | ✓ | ✗ |
| Manage billing | ✓ | ✗ |

---

## Ownership

- All folders and files are owned by a **team**.
- The team that owns a resource has implicit `admin` access to it.
- Ownership can be transferred by the owning team's admin or by a `super-admin`.
- If the owning team is deleted, the resource becomes **orphaned**.

### Orphaned Resources

- Orphaned resources have no owning team (`owner_team_id` is NULL).
- Only `super-admin` can view orphaned resources.
- `super-admin` can reassign orphaned resources to a new team.
- Regular users cannot see or access orphaned resources (they appear as "not found").

---

## Permission Inheritance

### Folder-to-File Inheritance

- Files inherit permissions from their parent folder by default.
- Inherited permissions apply automatically; no explicit grant is needed.
- Explicit file-level permissions can be added to extend access.
- Explicit **deny** permissions can be added to block inherited access.

### Nested Folder Inheritance

- Subfolders inherit permissions from their parent folder by default.
- Inheritance is recursive: a deeply nested folder inherits from all ancestors.
- Explicit folder-level permissions can be added to extend access.
- Explicit **deny** permissions can be added to block inherited access.

### Breaking Inheritance

- Each folder and file has an `inherit_permissions` flag (default: true).
- When set to **false**, the resource ignores all permissions from parent folders.
- Only explicit permissions on the resource itself apply.
- This allows creating isolated subfolders that don't inherit parent access.

### Deny Permissions

- A **deny** permission explicitly blocks access for a user or team.
- Deny always wins: it overrides any inherited or explicit grants.
- Deny applies at the resource level where it is defined.
- Deny does not propagate to children (each resource needs its own deny).

### Moving Resources

- When a file or folder is moved, it **loses** all inherited permissions from the old parent.
- It **gains** inherited permissions from the new parent.
- Explicit permissions on the resource itself are preserved.
- The `inherit_permissions` flag is preserved.

---

## Precedence Rules

### Rule 1: Deny Always Wins

A **deny** permission blocks access regardless of any grants. If a user or their team has a deny on a resource, access is denied.

Example: User has `editor` grant but also has `deny` → access denied.

### Rule 2: Highest Grant Wins

When a user has multiple grant sources for the same resource, the highest role applies.

Example: User has `viewer` via Team A and `editor` via Team B → effective role is `editor`.

### Rule 3: Explicit Over Inherited

Explicit permissions on a resource take precedence over inherited permissions.

Example: Folder grants `viewer`, but file has explicit `editor` for user → effective role is `editor`.

### Rule 4: User Over Team (Same Level)

When a user has a direct permission and also inherits via team membership, the direct user permission wins if both are at the same inheritance level.

### Rule 5: Inheritance Can Be Broken

If `inherit_permissions` is false on a resource, parent permissions are ignored entirely.

### Rule 6: Orphaned Resources

Resources with no owning team (`owner_team_id` is NULL) are only accessible to super-admins.

---

## Permission Grant Rules

### Who Can Grant Access

| Grantor Role | Can Grant | Can Deny |
|--------------|-----------|----------|
| admin | admin, editor, viewer | ✓ |
| editor | editor, viewer | ✗ |
| viewer | (cannot grant) | ✗ |

### Grant Constraints

- Users cannot grant a higher role than their own effective role.
- Users cannot revoke access unless they are `admin`.
- Editors can add grant permissions but cannot remove, downgrade, or create deny permissions.
- Only `admin` can create deny permissions.
- Only `admin` can modify `inherit_permissions` flag.

---

## Public Links

- Public links provide **view-only** access to a resource.
- Public links can be created by `admin` or `editor`.
- Public links can only be disabled by `admin` or `super-admin`.
- Public link access does not grant AI question-asking capability.
- Public links on folders grant view access to all contents (files and subfolders).

---

## Redactions

### Definition

A redaction permanently removes specific content sections from AI visibility. The content is still stored but is never sent to the AI provider.

### Visibility

- All users see that a redaction exists (indicator only).
- Only `admin` and `super-admin` can view redaction details (what content is redacted).
- Only `admin` and `super-admin` can create or remove redactions.

### Scope

- Redactions are defined at the file level, specifying sections within the file.
- Redactions do not inherit; they must be explicitly defined per file.

### AI Behavior

- The AI must never receive redacted content.
- When answering questions, the AI must not reference or infer redacted content.
- The AI should acknowledge when a question may relate to redacted content.

---

## Soft Deletion

### Behavior

- Deleted files and folders are moved to a trash state, not permanently removed.
- Deleted resources retain their permissions for potential restoration.
- Only `admin` and `super-admin` can delete or restore resources.

### Visibility

- Deleted resources are hidden from normal views.
- Admins can view and restore deleted resources.
- Super-admins can permanently purge deleted resources.

### Retention

- Deleted resources are retained for a defined period before permanent purge.
- Permanent purge is irreversible.

---

## Safety Defaults

### Default Deny

If permission is missing, ambiguous, or cannot be determined, access is **denied**.

### No Implicit Access

Users have no access to any resource unless:
1. Their team owns the resource, OR
2. They have explicit permission (direct or team grant), OR
3. They have inherited permission from a parent folder, OR
4. They access via a valid public link, OR
5. The resource is orphaned AND they are a super-admin

### Missing Resources

If a resource does not exist or the user has no access, the response is identical: **"Not found"**. This prevents information leakage about resource existence.

### Permission Check Order

1. Resource not found or deleted? → Deny
2. Resource is orphaned?
   - Is user a super-admin? → Allow with admin role
   - Otherwise → Deny
3. Does user or their team have explicit **deny** on this resource? → Deny
4. Does user's team own this resource? → Allow with admin role
5. Does user have explicit **grant** on this resource? → Use that role
6. Does user's team have explicit **grant**? → Use highest team role
7. Is `inherit_permissions` false? → Deny (no inheritance)
8. Walk up folder tree (checking deny, ownership, grants, inheritance flag)
9. Is there a valid public link being used? → Allow with viewer role (no AI)
10. Otherwise → Deny

---

## Summary

| Principle | Rule |
|-----------|------|
| Default | Deny |
| Deny permissions | Always win, block access |
| Grant conflict resolution | Highest permission wins |
| Inheritance | Parent folder → child (can be disabled per resource) |
| Move behavior | Drop old inherited, gain new inherited, keep explicit |
| Ownership | Teams own resources |
| Orphaned resources | Super-admin access only, can be reassigned |
| Super-admin | Org management only, no implicit resource access |
| Redactions | Admin-only, section-level, permanent removal from AI |
| Deletion | Soft delete, admin-only restore |
| Public links | View-only, no AI access |
