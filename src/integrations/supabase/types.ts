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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      checkins: {
        Row: {
          arrival_date: string | null
          booking_reference: string | null
          created_at: string
          departure_date: string | null
          guest_email: string | null
          guest_name: string
          guest_phone: string | null
          id: string
          id_document_url: string | null
          num_guests: number | null
          property_id: string
          signature_url: string | null
          status: string
        }
        Insert: {
          arrival_date?: string | null
          booking_reference?: string | null
          created_at?: string
          departure_date?: string | null
          guest_email?: string | null
          guest_name: string
          guest_phone?: string | null
          id?: string
          id_document_url?: string | null
          num_guests?: number | null
          property_id: string
          signature_url?: string | null
          status?: string
        }
        Update: {
          arrival_date?: string | null
          booking_reference?: string | null
          created_at?: string
          departure_date?: string | null
          guest_email?: string | null
          guest_name?: string
          guest_phone?: string | null
          id?: string
          id_document_url?: string | null
          num_guests?: number | null
          property_id?: string
          signature_url?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkins_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          channel: string
          created_at: string
          guest_contact: string | null
          guest_name: string | null
          id: string
          last_message_at: string | null
          needs_staff: boolean
          property_id: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          channel?: string
          created_at?: string
          guest_contact?: string | null
          guest_name?: string | null
          id?: string
          last_message_at?: string | null
          needs_staff?: boolean
          property_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          channel?: string
          created_at?: string
          guest_contact?: string | null
          guest_name?: string | null
          id?: string
          last_message_at?: string | null
          needs_staff?: boolean
          property_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      faqs: {
        Row: {
          answer: string
          category: string | null
          created_at: string
          id: string
          property_id: string
          question: string
        }
        Insert: {
          answer: string
          category?: string | null
          created_at?: string
          id?: string
          property_id: string
          question: string
        }
        Update: {
          answer?: string
          category?: string | null
          created_at?: string
          id?: string
          property_id?: string
          question?: string
        }
        Relationships: [
          {
            foreignKeyName: "faqs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          approved: boolean
          body: string
          client_msg_id: string | null
          conversation_id: string
          created_at: string
          id: string
          is_ai_suggestion: boolean
          original_draft: string | null
          sender: string
          sender_user_id: string | null
          source: string | null
        }
        Insert: {
          approved?: boolean
          body: string
          client_msg_id?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          is_ai_suggestion?: boolean
          original_draft?: string | null
          sender: string
          sender_user_id?: string | null
          source?: string | null
        }
        Update: {
          approved?: boolean
          body?: string
          client_msg_id?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          is_ai_suggestion?: boolean
          original_draft?: string | null
          sender?: string
          sender_user_id?: string | null
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      properties: {
        Row: {
          address: string | null
          brand_color: string
          checkin_time: string | null
          checkout_time: string | null
          created_at: string
          id: string
          logo_url: string | null
          name: string
          slug: string
          welcome_message: string | null
          wifi_password: string | null
          wifi_ssid: string | null
        }
        Insert: {
          address?: string | null
          brand_color?: string
          checkin_time?: string | null
          checkout_time?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          slug: string
          welcome_message?: string | null
          wifi_password?: string | null
          wifi_ssid?: string | null
        }
        Update: {
          address?: string | null
          brand_color?: string
          checkin_time?: string | null
          checkout_time?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          slug?: string
          welcome_message?: string | null
          wifi_password?: string | null
          wifi_ssid?: string | null
        }
        Relationships: []
      }
      response_templates: {
        Row: {
          body: string
          category: string | null
          created_at: string
          id: string
          property_id: string
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          category?: string | null
          created_at?: string
          id?: string
          property_id: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          category?: string | null
          created_at?: string
          id?: string
          property_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "response_templates_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          property_id: string | null
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          property_id?: string | null
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          property_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_profiles_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_staff_property_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      property_id_for_conversation: {
        Args: { _conv_id: string }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "agent"
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
      app_role: ["admin", "agent"],
    },
  },
} as const
