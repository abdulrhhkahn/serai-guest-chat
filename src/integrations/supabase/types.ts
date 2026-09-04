export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_property_switch_log: {
        Row: {
          admin_user_id: string
          id: string
          property_id: string | null
          switched_at: string
        }
        Insert: {
          admin_user_id: string
          id?: string
          property_id?: string | null
          switched_at?: string
        }
        Update: {
          admin_user_id?: string
          id?: string
          property_id?: string | null
          switched_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_property_switch_log_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_decisions: {
        Row: {
          category: string | null
          channel: string
          conversation_id: string | null
          created_at: string
          id: string
          level: string
          outcome: string
          property_id: string
        }
        Insert: {
          category?: string | null
          channel?: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          level: string
          outcome: string
          property_id: string
        }
        Update: {
          category?: string | null
          channel?: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          level?: string
          outcome?: string
          property_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_decisions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_decisions_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_drafts: {
        Row: {
          category: string | null
          conversation_id: string
          created_at: string
          draft: string
          id: string
          property_id: string
        }
        Insert: {
          category?: string | null
          conversation_id: string
          created_at?: string
          draft: string
          id?: string
          property_id: string
        }
        Update: {
          category?: string | null
          conversation_id?: string
          created_at?: string
          draft?: string
          id?: string
          property_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_drafts_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_drafts_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      autonomy_audit: {
        Row: {
          category: string | null
          changed_by: string | null
          created_at: string
          id: string
          new_level: string
          old_level: string | null
          property_id: string
        }
        Insert: {
          category?: string | null
          changed_by?: string | null
          created_at?: string
          id?: string
          new_level: string
          old_level?: string | null
          property_id: string
        }
        Update: {
          category?: string | null
          changed_by?: string | null
          created_at?: string
          id?: string
          new_level?: string
          old_level?: string | null
          property_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "autonomy_audit_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          payload: Json
          processed_at: string | null
          safepay_event_token: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          payload: Json
          processed_at?: string | null
          safepay_event_token: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          safepay_event_token?: string
        }
        Relationships: []
      }
      category_autonomy: {
        Row: {
          category: string
          created_at: string
          id: string
          level: string
          property_id: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          level: string
          property_id: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          level?: string
          property_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_autonomy_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      checkins: {
        Row: {
          arrival_date: string | null
          booking_reference: string | null
          created_at: string
          departure_date: string | null
          documents_purged_at: string | null
          guest_email: string | null
          guest_name: string
          guest_phone: string | null
          guest_user_id: string | null
          id: string
          id_document_url: string | null
          num_guests: number | null
          property_id: string
          room: string | null
          signature_url: string | null
          status: string
        }
        Insert: {
          arrival_date?: string | null
          booking_reference?: string | null
          created_at?: string
          departure_date?: string | null
          documents_purged_at?: string | null
          guest_email?: string | null
          guest_name: string
          guest_phone?: string | null
          guest_user_id?: string | null
          id?: string
          id_document_url?: string | null
          num_guests?: number | null
          property_id: string
          room?: string | null
          signature_url?: string | null
          status?: string
        }
        Update: {
          arrival_date?: string | null
          booking_reference?: string | null
          created_at?: string
          departure_date?: string | null
          documents_purged_at?: string | null
          guest_email?: string | null
          guest_name?: string
          guest_phone?: string | null
          guest_user_id?: string | null
          id?: string
          id_document_url?: string | null
          num_guests?: number | null
          property_id?: string
          room?: string | null
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
      conversation_events: {
        Row: {
          actor_user_id: string | null
          conversation_id: string
          created_at: string
          detail: string | null
          event_type: string
          id: string
        }
        Insert: {
          actor_user_id?: string | null
          conversation_id: string
          created_at?: string
          detail?: string | null
          event_type: string
          id?: string
        }
        Update: {
          actor_user_id?: string | null
          conversation_id?: string
          created_at?: string
          detail?: string | null
          event_type?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_events_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          channel: string
          checkin_id: string | null
          created_at: string
          csat_at: string | null
          csat_rating: number | null
          guest_contact: string | null
          guest_name: string | null
          guest_user_id: string | null
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
          checkin_id?: string | null
          created_at?: string
          csat_at?: string | null
          csat_rating?: number | null
          guest_contact?: string | null
          guest_name?: string | null
          guest_user_id?: string | null
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
          checkin_id?: string | null
          created_at?: string
          csat_at?: string | null
          csat_rating?: number | null
          guest_contact?: string | null
          guest_name?: string | null
          guest_user_id?: string | null
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
            foreignKeyName: "conversations_checkin_id_fkey"
            columns: ["checkin_id"]
            isOneToOne: false
            referencedRelation: "checkins"
            referencedColumns: ["id"]
          },
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
      local_activities: {
        Row: {
          category: string
          created_at: string
          description: string | null
          display_order: number
          id: string
          image_url: string | null
          name: string
          price_text: string | null
          property_id: string
          provider_contact: string | null
          provider_name: string | null
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          name: string
          price_text?: string | null
          property_id: string
          provider_contact?: string | null
          provider_name?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          name?: string
          price_text?: string | null
          property_id?: string
          provider_contact?: string | null
          provider_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "local_activities_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          category: string
          created_at: string
          description: string | null
          display_order: number
          id: string
          image_url: string | null
          menu_id: string
          name: string
          price_text: string | null
          property_id: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          menu_id: string
          name: string
          price_text?: string | null
          property_id: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          menu_id?: string
          name?: string
          price_text?: string | null
          property_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "menus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      menus: {
        Row: {
          created_at: string
          display_order: number
          id: string
          name: string
          property_id: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          name: string
          property_id: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          name?: string
          property_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menus_property_id_fkey"
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
          deleted_at: string | null
          delivery_error: string | null
          delivery_status: string | null
          edited_at: string | null
          external_id: string | null
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
          deleted_at?: string | null
          delivery_error?: string | null
          delivery_status?: string | null
          edited_at?: string | null
          external_id?: string | null
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
          deleted_at?: string | null
          delivery_error?: string | null
          delivery_status?: string | null
          edited_at?: string | null
          external_id?: string | null
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
      messaging_numbers: {
        Row: {
          channel: string
          created_at: string
          id: string
          phone_number: string
          property_id: string
        }
        Insert: {
          channel: string
          created_at?: string
          id?: string
          phone_number: string
          property_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          id?: string
          phone_number?: string
          property_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messaging_numbers_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      org_admins: {
        Row: {
          created_at: string
          org_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          org_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          org_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_admins_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      plan_interest_leads: {
        Row: {
          created_at: string
          first_name: string
          heard_about: string | null
          id: string
          last_name: string
          meet_event_id: string | null
          meet_join_url: string | null
          meeting_slot: string | null
          phone: string
          plan_tier: string
          property_count: number
          property_type: string
          scheduled_at: string | null
          submitted_by: string | null
          work_email: string
        }
        Insert: {
          created_at?: string
          first_name: string
          heard_about?: string | null
          id?: string
          last_name: string
          meet_event_id?: string | null
          meet_join_url?: string | null
          meeting_slot?: string | null
          phone: string
          plan_tier: string
          property_count: number
          property_type: string
          scheduled_at?: string | null
          submitted_by?: string | null
          work_email: string
        }
        Update: {
          created_at?: string
          first_name?: string
          heard_about?: string | null
          id?: string
          last_name?: string
          meet_event_id?: string | null
          meet_join_url?: string | null
          meeting_slot?: string | null
          phone?: string
          plan_tier?: string
          property_count?: number
          property_type?: string
          scheduled_at?: string | null
          submitted_by?: string | null
          work_email?: string
        }
        Relationships: []
      }
      properties: {
        Row: {
          address: string | null
          brand_color: string
          checkin_time: string | null
          checkout_time: string | null
          created_at: string
          default_autonomy: string
          id: string
          logo_url: string | null
          name: string
          organization_id: string | null
          report_email: string | null
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
          default_autonomy?: string
          id?: string
          logo_url?: string | null
          name: string
          organization_id?: string | null
          report_email?: string | null
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
          default_autonomy?: string
          id?: string
          logo_url?: string | null
          name?: string
          organization_id?: string | null
          report_email?: string | null
          slug?: string
          welcome_message?: string | null
          wifi_password?: string | null
          wifi_ssid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "properties_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          bucket: string
          count: number
          identity: string
          window_start: string
        }
        Insert: {
          bucket: string
          count?: number
          identity: string
          window_start: string
        }
        Update: {
          bucket?: string
          count?: number
          identity?: string
          window_start?: string
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
      staff_activity_log: {
        Row: {
          action_type: string
          created_at: string
          detail: string | null
          id: string
          property_id: string
          staff_id: string
        }
        Insert: {
          action_type: string
          created_at?: string
          detail?: string | null
          id?: string
          property_id: string
          staff_id: string
        }
        Update: {
          action_type?: string
          created_at?: string
          detail?: string | null
          id?: string
          property_id?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_activity_log_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_invites: {
        Row: {
          created_at: string
          email: string
          id: string
          invited_by: string
          property_id: string
          status: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          invited_by: string
          property_id: string
          status?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          invited_by?: string
          property_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_invites_property_id_fkey"
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
      subscriptions: {
        Row: {
          amount_pkr: number
          created_at: string
          current_period_end: string | null
          id: string
          organization_id: string
          plan_tier: Database["public"]["Enums"]["plan_tier"]
          property_count: number
          safepay_plan_id: string
          safepay_subscription_reference: string
          status: Database["public"]["Enums"]["subscription_status"]
          updated_at: string
        }
        Insert: {
          amount_pkr: number
          created_at?: string
          current_period_end?: string | null
          id?: string
          organization_id: string
          plan_tier: Database["public"]["Enums"]["plan_tier"]
          property_count?: number
          safepay_plan_id: string
          safepay_subscription_reference: string
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
        }
        Update: {
          amount_pkr?: number
          created_at?: string
          current_period_end?: string | null
          id?: string
          organization_id?: string
          plan_tier?: Database["public"]["Enums"]["plan_tier"]
          property_count?: number
          safepay_plan_id?: string
          safepay_subscription_reference?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      support_conversations: {
        Row: {
          created_at: string
          id: string
          last_message_at: string
          needs_admin: boolean
          needs_staff: boolean
          property_id: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string
          needs_admin?: boolean
          needs_staff?: boolean
          property_id: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string
          needs_admin?: boolean
          needs_staff?: boolean
          property_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_conversations_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      support_messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          id: string
          sender: string
          sender_id: string | null
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          sender: string
          sender_id?: string | null
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          sender?: string
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "support_conversations"
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
      autonomy_level_allowed: {
        Args: { _level: string; _property_id: string }
        Returns: boolean
      }
      can_org_admin_add_property: {
        Args: { _organization_id: string }
        Returns: boolean
      }
      can_switch_to_property: {
        Args: { _new_property_id: string }
        Returns: boolean
      }
      check_rate_limit: {
        Args: {
          _bucket: string
          _identity: string
          _max: number
          _window_secs: number
        }
        Returns: boolean
      }
      conversation_limit_ok: {
        Args: { _property_id: string }
        Returns: boolean
      }
      conversation_owner: { Args: { _conv_id: string }; Returns: string }
      current_staff_property_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin_of_org: { Args: { _org_id: string }; Returns: boolean }
      is_org_admin_for_property: {
        Args: { _property_id: string }
        Returns: boolean
      }
      mark_staff_invite_accepted: {
        Args: { _email: string; _property_id: string }
        Returns: undefined
      }
      org_has_plan_at_least: {
        Args: {
          min_tier: Database["public"]["Enums"]["plan_tier"]
          org_id: string
        }
        Returns: boolean
      }
      property_has_plan_at_least: {
        Args: {
          _property_id: string
          min_tier: Database["public"]["Enums"]["plan_tier"]
        }
        Returns: boolean
      }
      property_id_for_conversation: {
        Args: { _conv_id: string }
        Returns: string
      }
      staff_seat_limit_ok: { Args: { _property_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "agent"
      plan_tier: "basic" | "growth" | "pro"
      subscription_status: "active" | "past_due" | "canceled" | "incomplete"
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
      plan_tier: ["basic", "growth", "pro"],
      subscription_status: ["active", "past_due", "canceled", "incomplete"],
    },
  },
} as const
