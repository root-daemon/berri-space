/**
 * Database types for Supabase.
 *
 * These types should be regenerated when the database schema changes.
 * For production, use the Supabase CLI: `npx supabase gen types typescript`
 */

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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

/**
 * Convenience type for a User row from the database.
 */
export type DbUser = Database["public"]["Tables"]["users"]["Row"];

/**
 * Type for inserting a new user.
 */
export type DbUserInsert = Database["public"]["Tables"]["users"]["Insert"];

/**
 * Type for updating a user.
 */
export type DbUserUpdate = Database["public"]["Tables"]["users"]["Update"];
