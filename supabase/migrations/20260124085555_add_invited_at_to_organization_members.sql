-- Add invited_at to distinguish invited memberships (prioritized in MVP) from own org
ALTER TABLE organization_members
  ADD COLUMN IF NOT EXISTS invited_at timestamptz NULL;

COMMENT ON COLUMN organization_members.invited_at IS
  'When set, user was added by another member (invited). NULL = own org (creator). Prioritize invited orgs over own in MVP.';

-- Backfill: existing admin/member = invited (use created_at); super_admin = own (leave NULL)
UPDATE organization_members
SET invited_at = created_at
WHERE role IN ('member', 'admin') AND invited_at IS NULL;
