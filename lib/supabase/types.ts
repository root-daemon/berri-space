/**
 * Database types for Supabase.
 *
 * These types match the schema defined in migrations 001-004.
 * For production, regenerate with: `npx supabase gen types typescript`
 */

// ============================================================================
// ENUMS
// ============================================================================

export type OrgRole = "super_admin" | "member";
export type ResourceRole = "admin" | "editor" | "viewer";
export type ResourceType = "folder" | "file";
export type GranteeType = "user" | "team";
export type PermissionType = "grant" | "deny";

// ============================================================================
// TABLE TYPES
// ============================================================================

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          clerk_user_id: string;
          email: string;
          name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          clerk_user_id: string;
          email: string;
          name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          clerk_user_id?: string;
          email?: string;
          name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      organizations: {
        Row: {
          id: string;
          name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      organization_members: {
        Row: {
          organization_id: string;
          user_id: string;
          role: OrgRole;
          created_at: string;
        };
        Insert: {
          organization_id: string;
          user_id: string;
          role?: OrgRole;
          created_at?: string;
        };
        Update: {
          organization_id?: string;
          user_id?: string;
          role?: OrgRole;
          created_at?: string;
        };
        Relationships: [];
      };
      teams: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      team_members: {
        Row: {
          team_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          team_id: string;
          user_id: string;
          created_at?: string;
        };
        Update: {
          team_id?: string;
          user_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      folders: {
        Row: {
          id: string;
          organization_id: string;
          owner_team_id: string | null;
          parent_folder_id: string | null;
          name: string;
          inherit_permissions: boolean;
          created_by_user_id: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          deleted_by: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          owner_team_id?: string | null;
          parent_folder_id?: string | null;
          name: string;
          inherit_permissions?: boolean;
          created_by_user_id?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          owner_team_id?: string | null;
          parent_folder_id?: string | null;
          name?: string;
          inherit_permissions?: boolean;
          created_by_user_id?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
        };
        Relationships: [];
      };
      files: {
        Row: {
          id: string;
          organization_id: string;
          owner_team_id: string | null;
          folder_id: string | null;
          name: string;
          storage_path: string;
          mime_type: string | null;
          size_bytes: number | null;
          inherit_permissions: boolean;
          created_by_user_id: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          deleted_by: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          owner_team_id?: string | null;
          folder_id?: string | null;
          name: string;
          storage_path: string;
          mime_type?: string | null;
          size_bytes?: number | null;
          inherit_permissions?: boolean;
          created_by_user_id?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          owner_team_id?: string | null;
          folder_id?: string | null;
          name?: string;
          storage_path?: string;
          mime_type?: string | null;
          size_bytes?: number | null;
          inherit_permissions?: boolean;
          created_by_user_id?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
        };
        Relationships: [];
      };
      resource_permissions: {
        Row: {
          id: string;
          resource_type: ResourceType;
          resource_id: string;
          grantee_type: GranteeType;
          grantee_id: string;
          role: ResourceRole;
          permission_type: PermissionType;
          granted_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          resource_type: ResourceType;
          resource_id: string;
          grantee_type: GranteeType;
          grantee_id: string;
          role: ResourceRole;
          permission_type?: PermissionType;
          granted_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          resource_type?: ResourceType;
          resource_id?: string;
          grantee_type?: GranteeType;
          grantee_id?: string;
          role?: ResourceRole;
          permission_type?: PermissionType;
          granted_by?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      public_links: {
        Row: {
          id: string;
          token: string;
          resource_type: ResourceType;
          resource_id: string;
          created_by: string;
          created_at: string;
          disabled_at: string | null;
          disabled_by: string | null;
        };
        Insert: {
          id?: string;
          token?: string;
          resource_type: ResourceType;
          resource_id: string;
          created_by: string;
          created_at?: string;
          disabled_at?: string | null;
          disabled_by?: string | null;
        };
        Update: {
          id?: string;
          token?: string;
          resource_type?: ResourceType;
          resource_id?: string;
          created_by?: string;
          created_at?: string;
          disabled_at?: string | null;
          disabled_by?: string | null;
        };
        Relationships: [];
      };
      redactions: {
        Row: {
          id: string;
          file_id: string;
          start_offset: number;
          end_offset: number;
          reason: string | null;
          created_by: string;
          created_at: string;
          removed_at: string | null;
          removed_by: string | null;
        };
        Insert: {
          id?: string;
          file_id: string;
          start_offset: number;
          end_offset: number;
          reason?: string | null;
          created_by: string;
          created_at?: string;
          removed_at?: string | null;
          removed_by?: string | null;
        };
        Update: {
          id?: string;
          file_id?: string;
          start_offset?: number;
          end_offset?: number;
          reason?: string | null;
          created_by?: string;
          created_at?: string;
          removed_at?: string | null;
          removed_by?: string | null;
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string | null;
          action: string;
          resource_type: ResourceType | null;
          resource_id: string | null;
          details: Record<string, unknown> | null;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id?: string | null;
          action: string;
          resource_type?: ResourceType | null;
          resource_id?: string | null;
          details?: Record<string, unknown> | null;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          user_id?: string | null;
          action?: string;
          resource_type?: ResourceType | null;
          resource_id?: string | null;
          details?: Record<string, unknown> | null;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_effective_role: {
        Args: {
          p_user_id: string;
          p_resource_type: ResourceType;
          p_resource_id: string;
        };
        Returns: ResourceRole | null;
      };
      can_view: {
        Args: {
          p_user_id: string;
          p_resource_type: ResourceType;
          p_resource_id: string;
        };
        Returns: boolean;
      };
      can_edit: {
        Args: {
          p_user_id: string;
          p_resource_type: ResourceType;
          p_resource_id: string;
        };
        Returns: boolean;
      };
      can_admin: {
        Args: {
          p_user_id: string;
          p_resource_type: ResourceType;
          p_resource_id: string;
        };
        Returns: boolean;
      };
      is_super_admin: {
        Args: {
          p_user_id: string;
          p_org_id: string;
        };
        Returns: boolean;
      };
      get_user_team_ids: {
        Args: {
          p_user_id: string;
          p_org_id: string;
        };
        Returns: string[];
      };
    };
    Enums: {
      org_role: OrgRole;
      resource_role: ResourceRole;
      resource_type: ResourceType;
      grantee_type: GranteeType;
      permission_type: PermissionType;
    };
    CompositeTypes: Record<string, never>;
  };
}

// ============================================================================
// CONVENIENCE TYPES
// ============================================================================

/** User row from the database */
export type DbUser = Database["public"]["Tables"]["users"]["Row"];
export type DbUserInsert = Database["public"]["Tables"]["users"]["Insert"];
export type DbUserUpdate = Database["public"]["Tables"]["users"]["Update"];

/** Organization row from the database */
export type DbOrganization = Database["public"]["Tables"]["organizations"]["Row"];
export type DbOrganizationInsert = Database["public"]["Tables"]["organizations"]["Insert"];
export type DbOrganizationUpdate = Database["public"]["Tables"]["organizations"]["Update"];

/** Organization membership */
export type DbOrganizationMember = Database["public"]["Tables"]["organization_members"]["Row"];
export type DbOrganizationMemberInsert = Database["public"]["Tables"]["organization_members"]["Insert"];

/** Team row from the database */
export type DbTeam = Database["public"]["Tables"]["teams"]["Row"];
export type DbTeamInsert = Database["public"]["Tables"]["teams"]["Insert"];
export type DbTeamUpdate = Database["public"]["Tables"]["teams"]["Update"];

/** Team membership */
export type DbTeamMember = Database["public"]["Tables"]["team_members"]["Row"];
export type DbTeamMemberInsert = Database["public"]["Tables"]["team_members"]["Insert"];

/** Folder row from the database */
export type DbFolder = Database["public"]["Tables"]["folders"]["Row"];
export type DbFolderInsert = Database["public"]["Tables"]["folders"]["Insert"];
export type DbFolderUpdate = Database["public"]["Tables"]["folders"]["Update"];

/** File row from the database */
export type DbFile = Database["public"]["Tables"]["files"]["Row"];
export type DbFileInsert = Database["public"]["Tables"]["files"]["Insert"];
export type DbFileUpdate = Database["public"]["Tables"]["files"]["Update"];

/** Resource permission row */
export type DbResourcePermission = Database["public"]["Tables"]["resource_permissions"]["Row"];
export type DbResourcePermissionInsert = Database["public"]["Tables"]["resource_permissions"]["Insert"];

/** Public link row */
export type DbPublicLink = Database["public"]["Tables"]["public_links"]["Row"];

/** Redaction row */
export type DbRedaction = Database["public"]["Tables"]["redactions"]["Row"];

/** Audit log row */
export type DbAuditLog = Database["public"]["Tables"]["audit_logs"]["Row"];
