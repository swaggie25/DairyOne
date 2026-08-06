export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      agents: {
        Row: {
          created_at: string
          employee_code: string
          full_name: string
          id: string
          mcc_id: string
          phone: string | null
          profile_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          employee_code: string
          full_name: string
          id?: string
          mcc_id: string
          phone?: string | null
          profile_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          employee_code?: string
          full_name?: string
          id?: string
          mcc_id?: string
          phone?: string | null
          profile_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agents_mcc_id_fkey"
            columns: ["mcc_id"]
            isOneToOne: false
            referencedRelation: "mcc_centres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agents_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      farmer_animals: {
        Row: {
          animal_count: number
          animal_type: string
          created_at: string
          farmer_id: string
          health_notes: string | null
          id: string
        }
        Insert: {
          animal_count?: number
          animal_type: string
          created_at?: string
          farmer_id: string
          health_notes?: string | null
          id?: string
        }
        Update: {
          animal_count?: number
          animal_type?: string
          created_at?: string
          farmer_id?: string
          health_notes?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "farmer_animals_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
        ]
      }
      farmers: {
        Row: {
          bank_account: string | null
          created_at: string
          farmer_code: string
          full_name: string
          id: string
          ifsc: string | null
          mcc_id: string
          phone: string | null
          profile_id: string | null
          status: string
          updated_at: string
          upi_id: string | null
          village: string | null
        }
        Insert: {
          bank_account?: string | null
          created_at?: string
          farmer_code: string
          full_name: string
          id?: string
          ifsc?: string | null
          mcc_id: string
          phone?: string | null
          profile_id?: string | null
          status?: string
          updated_at?: string
          upi_id?: string | null
          village?: string | null
        }
        Update: {
          bank_account?: string | null
          created_at?: string
          farmer_code?: string
          full_name?: string
          id?: string
          ifsc?: string | null
          mcc_id?: string
          phone?: string | null
          profile_id?: string | null
          status?: string
          updated_at?: string
          upi_id?: string | null
          village?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "farmers_mcc_id_fkey"
            columns: ["mcc_id"]
            isOneToOne: false
            referencedRelation: "mcc_centres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "farmers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mcc_centres: {
        Row: {
          active: boolean
          code: string
          created_at: string
          district: string | null
          id: string
          lat: number | null
          lng: number | null
          name: string
          state: string | null
          updated_at: string
          village: string | null
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          district?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          name: string
          state?: string | null
          updated_at?: string
          village?: string | null
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          district?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          name?: string
          state?: string | null
          updated_at?: string
          village?: string | null
        }
        Relationships: []
      }
      otp_codes: {
        Row: {
          attempts: number
          code: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          phone: string
          role: Database["public"]["Enums"]["app_role"] | null
        }
        Insert: {
          attempts?: number
          code: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          phone: string
          role?: Database["public"]["Enums"]["app_role"] | null
        }
        Update: {
          attempts?: number
          code?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          phone?: string
          role?: Database["public"]["Enums"]["app_role"] | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          preferred_language: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          preferred_language?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          preferred_language?: string
          updated_at?: string
        }
        Relationships: []
      }
      route_point_farmers: {
        Row: {
          farmer_id: string
          id: string
          route_point_id: string
          sequence: number
        }
        Insert: {
          farmer_id: string
          id?: string
          route_point_id: string
          sequence?: number
        }
        Update: {
          farmer_id?: string
          id?: string
          route_point_id?: string
          sequence?: number
        }
        Relationships: [
          {
            foreignKeyName: "route_point_farmers_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_point_farmers_route_point_id_fkey"
            columns: ["route_point_id"]
            isOneToOne: false
            referencedRelation: "route_points"
            referencedColumns: ["id"]
          },
        ]
      }
      route_points: {
        Row: {
          created_at: string
          id: string
          lat: number | null
          lng: number | null
          name: string
          route_id: string
          sequence: number
        }
        Insert: {
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          name: string
          route_id: string
          sequence?: number
        }
        Update: {
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          name?: string
          route_id?: string
          sequence?: number
        }
        Relationships: [
          {
            foreignKeyName: "route_points_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      routes: {
        Row: {
          active: boolean
          assigned_agent_id: string | null
          created_at: string
          description: string | null
          id: string
          mcc_id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          assigned_agent_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          mcc_id: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          assigned_agent_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          mcc_id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "routes_assigned_agent_id_fkey"
            columns: ["assigned_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routes_mcc_id_fkey"
            columns: ["mcc_id"]
            isOneToOne: false
            referencedRelation: "mcc_centres"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          mcc_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mcc_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mcc_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_mcc_id_fkey"
            columns: ["mcc_id"]
            isOneToOne: false
            referencedRelation: "mcc_centres"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      user_mcc_ids: { Args: { _user_id: string }; Returns: string[] }
    }
    Enums: {
      app_role:
        | "owner"
        | "manager"
        | "agent"
        | "buyer"
        | "farmer"
        | "accountant"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["owner", "manager", "agent", "buyer", "farmer", "accountant"],
    },
  },
} as const
