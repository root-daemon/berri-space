/**
 * Database types for Supabase.
 *
 * These types match the schema defined in migrations 001-004.
 * For production, regenerate with: `npx supabase gen types typescript`
 */

// ============================================================================
// ENUMS
// ============================================================================

export type OrgRole = "super_admin" | "member" | "admin";
export type ResourceRole = "admin" | "editor" | "viewer";
export type ResourceType = "folder" | "file";
export type GranteeType = "user" | "team";
export type PermissionType = "grant" | "deny";

// AI Foundation types (Phase 8)
export type DocumentProcessingStatus =
  | "pending_extraction"
  | "extraction_failed"
  | "pending_redaction"
  | "redaction_in_progress"
  | "pending_commit"
  | "committed"
  | "indexing"
  | "indexed"
  | "indexing_failed";

export type RedactionType =
  | "manual"
  | "regex"
  | "pii_email"
  | "pii_phone"
  | "pii_ssn"
  | "pii_address"
  | "pii_name"
  | "financial"
  | "medical"
  | "legal"
  | "custom";

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
          invited_at: string | null;
        };
        Insert: {
          organization_id: string;
          user_id: string;
          role?: OrgRole;
          created_at?: string;
          invited_at?: string | null;
        };
        Update: {
          organization_id?: string;
          user_id?: string;
          role?: OrgRole;
          created_at?: string;
          invited_at?: string | null;
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
      // ========================================================================
      // AI FOUNDATION TABLES (Phase 8)
      // ========================================================================
      document_processing: {
        Row: {
          id: string;
          file_id: string;
          organization_id: string;
          status: DocumentProcessingStatus;
          extracted_at: string | null;
          extraction_error: string | null;
          character_count: number | null;
          redaction_started_at: string | null;
          redaction_started_by: string | null;
          committed_at: string | null;
          committed_by: string | null;
          indexed_at: string | null;
          indexing_error: string | null;
          chunk_count: number | null;
          embedding_model: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          file_id: string;
          organization_id: string;
          status?: DocumentProcessingStatus;
          extracted_at?: string | null;
          extraction_error?: string | null;
          character_count?: number | null;
          redaction_started_at?: string | null;
          redaction_started_by?: string | null;
          committed_at?: string | null;
          committed_by?: string | null;
          indexed_at?: string | null;
          indexing_error?: string | null;
          chunk_count?: number | null;
          embedding_model?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          file_id?: string;
          organization_id?: string;
          status?: DocumentProcessingStatus;
          extracted_at?: string | null;
          extraction_error?: string | null;
          character_count?: number | null;
          redaction_started_at?: string | null;
          redaction_started_by?: string | null;
          committed_at?: string | null;
          committed_by?: string | null;
          indexed_at?: string | null;
          indexing_error?: string | null;
          chunk_count?: number | null;
          embedding_model?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      document_raw_text: {
        Row: {
          id: string;
          file_id: string;
          organization_id: string;
          content: string;
          source_mime_type: string;
          extraction_method: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          file_id: string;
          organization_id: string;
          content: string;
          source_mime_type: string;
          extraction_method: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          file_id?: string;
          organization_id?: string;
          content?: string;
          source_mime_type?: string;
          extraction_method?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      document_redactions: {
        Row: {
          id: string;
          file_id: string;
          organization_id: string;
          redaction_type: RedactionType;
          start_offset: number;
          end_offset: number;
          pattern: string | null;
          semantic_label: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          file_id: string;
          organization_id: string;
          redaction_type: RedactionType;
          start_offset: number;
          end_offset: number;
          pattern?: string | null;
          semantic_label?: string | null;
          created_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          file_id?: string;
          organization_id?: string;
          redaction_type?: RedactionType;
          start_offset?: number;
          end_offset?: number;
          pattern?: string | null;
          semantic_label?: string | null;
          created_by?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      document_ai_text: {
        Row: {
          id: string;
          file_id: string;
          organization_id: string;
          content: string;
          character_count: number;
          redaction_count: number;
          processing_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          file_id: string;
          organization_id: string;
          content: string;
          character_count: number;
          redaction_count?: number;
          processing_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          file_id?: string;
          organization_id?: string;
          content?: string;
          character_count?: number;
          redaction_count?: number;
          processing_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      document_chunks: {
        Row: {
          id: string;
          file_id: string;
          organization_id: string;
          chunk_index: number;
          content: string;
          character_start: number;
          character_end: number;
          embedding: string | null; // pgvector returns as string
          embedding_model: string;
          processing_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          file_id: string;
          organization_id: string;
          chunk_index: number;
          content: string;
          character_start: number;
          character_end: number;
          embedding?: string | null;
          embedding_model: string;
          processing_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          file_id?: string;
          organization_id?: string;
          chunk_index?: number;
          content?: string;
          character_start?: number;
          character_end?: number;
          embedding?: string | null;
          embedding_model?: string;
          processing_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      ai_query_log: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          query_text: string;
          query_embedding: string | null;
          result_file_ids: string[];
          result_count: number;
          search_duration_ms: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          query_text: string;
          query_embedding?: string | null;
          result_file_ids?: string[];
          result_count?: number;
          search_duration_ms?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          user_id?: string;
          query_text?: string;
          query_embedding?: string | null;
          result_file_ids?: string[];
          result_count?: number;
          search_duration_ms?: number | null;
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
      // AI Foundation functions (Phase 8)
      is_document_committed: {
        Args: {
          p_file_id: string;
        };
        Returns: boolean;
      };
      is_document_ai_ready: {
        Args: {
          p_file_id: string;
        };
        Returns: boolean;
      };
      search_similar_chunks: {
        Args: {
          p_user_id: string;
          p_organization_id: string;
          p_query_embedding: string;
          p_limit: number;
          p_similarity_threshold: number;
        };
        Returns: Array<{
          chunk_id: string;
          file_id: string;
          file_name: string;
          chunk_index: number;
          content: string;
          similarity: number;
        }>;
      };
      apply_redactions: {
        Args: {
          p_file_id: string;
          p_raw_text: string;
        };
        Returns: string;
      };
    };
    Enums: {
      org_role: OrgRole;
      resource_role: ResourceRole;
      resource_type: ResourceType;
      grantee_type: GranteeType;
      permission_type: PermissionType;
      // AI Foundation enums (Phase 8)
      document_processing_status: DocumentProcessingStatus;
      redaction_type: RedactionType;
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

// ============================================================================
// AI FOUNDATION CONVENIENCE TYPES (Phase 8)
// ============================================================================

/** Document processing state */
export type DbDocumentProcessing = Database["public"]["Tables"]["document_processing"]["Row"];
export type DbDocumentProcessingInsert = Database["public"]["Tables"]["document_processing"]["Insert"];
export type DbDocumentProcessingUpdate = Database["public"]["Tables"]["document_processing"]["Update"];

/** Document raw text (SECURE - never AI accessible) */
export type DbDocumentRawText = Database["public"]["Tables"]["document_raw_text"]["Row"];
export type DbDocumentRawTextInsert = Database["public"]["Tables"]["document_raw_text"]["Insert"];

/** Document redactions */
export type DbDocumentRedaction = Database["public"]["Tables"]["document_redactions"]["Row"];
export type DbDocumentRedactionInsert = Database["public"]["Tables"]["document_redactions"]["Insert"];

/** Document AI-safe text */
export type DbDocumentAiText = Database["public"]["Tables"]["document_ai_text"]["Row"];
export type DbDocumentAiTextInsert = Database["public"]["Tables"]["document_ai_text"]["Insert"];

/** Document chunks with embeddings */
export type DbDocumentChunk = Database["public"]["Tables"]["document_chunks"]["Row"];
export type DbDocumentChunkInsert = Database["public"]["Tables"]["document_chunks"]["Insert"];

/** AI query audit log */
export type DbAiQueryLog = Database["public"]["Tables"]["ai_query_log"]["Row"];
export type DbAiQueryLogInsert = Database["public"]["Tables"]["ai_query_log"]["Insert"];
